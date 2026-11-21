// Authoritative multiplayer room engine. All bids, purses, ownership, timers, results live here.
import type { WebSocket } from "ws";
import { db, audit, uid, getUser, grantAchievement, addXp } from "./db";
import { buildPool, getSummary, getPlayer, mini2026Retained, MINI_2026_PURSE, eraRating, allSummaries, intlOverride } from "./data";
import {
  FRANCHISES, FRANCHISE_BY_ID, MODE_BY_ID, defaultSettings, nextBid, round2, fmtCr, AI_PERSONALITIES, ageOn,
  type RoomSettings, type ModeId, type Personality, type PlayerSummary,
} from "@shared/game";
import { purchaseBlock, fairValue, needs, slotKey, auctionGrade, bestXI, teamRating, captainPick, composition, type TeamLike } from "@shared/analytics";
import { makeSeason, playNext, predictTournament, type Season } from "./tournament";
import type { Lineup } from "./sim";

export interface SquadItem { pid: string; price: number; how: "auction" | "rtm" | "retained" | "trade" | "fill" | "squad2026"; season: number; fee?: number }
export interface TeamLineup { xi: string[]; bowling: string[]; captain?: string; vice?: string; keeper?: string; impact?: { in: string; out: string } | null; bench?: string[]; alt?: string[][]; fielding?: Record<string, { x: number; y: number }> }
export interface TeamState {
  id: string; name: string; short: string; primary: string; secondary: string; ownerId: string | null; ai: Personality | null;
  purse: number; startPurse: number; squad: SquadItem[]; rtmLeft: number; lineup: TeamLineup | null; listed: { pid: string; ask: number }[];
  retainPicks: string[] | null; retentionDone: boolean;
}
export interface Member { userId: string; username: string; teamId: string | null; role: "player" | "spectator"; online: boolean; ready: boolean; lastSeen: number }
export interface PoolItem { pid: string; base: number; set: string; status: "pending" | "sold" | "unsold" | "retained"; round: number }
export interface Lot {
  seq: number; pid: string; base: number; set: string; round: number; phase: "intro" | "bidding" | "sealed" | "rtm" | "rtm-raise" | "rtm-final" | "result";
  bid: number | null; leader: string | null; bidders: string[]; history: { team: string; amount: number; ts: number }[];
  endsAt: number; pausedLeft?: number; rtmTeam?: string | null; rtmPrice?: number; sealed?: Record<string, { amount: number; ts: number }>; result?: { kind: "sold" | "unsold"; team?: string; price?: number; how?: string };
  aiVals?: Record<string, number>; real2026?: { team: string | null; price: number | null; how: string | null } | null; startedAt: number;
}
export interface Sale { n: number; pid: string; team: string; price: number; fee: number; base: number; how: "auction" | "rtm"; ts: number; bidders: number; set: string; round: number; revealed: boolean; season: number }
export interface Trade { id: string; from: string; to: string; give: string[]; get: string[]; cash: number; status: "pending" | "accepted" | "rejected" | "cancelled"; ts: number; note?: string }
export interface News { ts: number; text: string; kind: string; team?: string; pid?: string }
export interface RoomState {
  code: string; name: string; hostId: string; mode: ModeId; settings: RoomSettings; status: "lobby" | "retention" | "auction" | "post" | "season" | "complete";
  createdAt: number; teams: TeamState[]; members: Member[]; pool: PoolItem[]; lot: Lot | null; lotSeq: number; paused: boolean;
  sales: Sale[]; bidLog: { team: string; pid: string; amount: number; lot: number; ts: number }[]; news: News[]; chat: { userId: string; name: string; text: string; ts: number }[];
  round: number; seasonNo: number; season: Season | null; history: any[]; trades: Trade[]; universe: "auction" | "real2026"; ratingOverrides: Record<string, any>;
  version: number; endedAt?: number; grades?: Record<string, any>; retentionMax?: number;
}

const rooms = new Map<string, Room>();
export const getRoom = (code: string) => rooms.get(code.toUpperCase());

function clamp(n: any, a: number, b: number, d: number) { const x = Number(n); return isNaN(x) ? d : Math.max(a, Math.min(b, x)); }

export function sanitizeSettings(mode: ModeId, patch: Partial<RoomSettings>, prev?: RoomSettings): RoomSettings {
  const s: RoomSettings = { ...(prev || defaultSettings(mode)), ...patch, mode };
  s.purse = clamp(s.purse, 5, 500, 100);
  s.squadMax = Math.round(clamp(s.squadMax, 2, 30, 25));
  s.squadMin = Math.round(clamp(s.squadMin, 1, s.squadMax, Math.min(18, s.squadMax)));
  s.overseasMax = Math.round(clamp(s.overseasMax, 0, s.squadMax, 8));
  s.bidTimer = clamp(s.bidTimer, 3, 60, 10);
  s.introTimer = clamp(s.introTimer, 0, 15, 3);
  s.incrementMultiplier = clamp(s.incrementMultiplier, 0.5, 5, 1);
  s.customIncrement = s.customIncrement ? clamp(s.customIncrement, 0.05, 10, 0.25) : null;
  s.teamCount = Math.round(clamp(s.teamCount, 2, 10, 10));
  s.seasons = Math.round(clamp(s.seasons, 1, 5, 1));
  s.retainMax = Math.round(clamp(s.retainMax, 0, 8, 4));
  s.purseTopUp = clamp(s.purseTopUp, 0, 100, 10);
  s.unsoldRounds = Math.round(clamp(s.unsoldRounds, 0, 3, 1));
  s.poolSize = s.poolSize ? Math.round(clamp(s.poolSize, 10, 900, 200)) : null;
  s.overseasFeeCap = s.overseasFeeCap ? clamp(s.overseasFeeCap, 1, 100, 18) : null;
  s.rtmCards = Math.round(clamp(s.rtmCards, 0, 6, 0));
  if (!["easy", "normal", "hard", "expert"].includes(s.aiDifficulty)) s.aiDifficulty = "normal";
  if (!["hidden", "after-lot", "after-set"].includes(s.blindVisibility)) s.blindVisibility = "after-set";
  if (!["2008-2012", "2013-2017", "2018-2022", "2023-2026", "all"].includes(s.era)) s.era = "all";
  if (mode !== "custom") s.teamCount = mode === "marquee" ? Math.min(s.teamCount, 10) : s.teamCount;
  // Format and pool kind are fixed by the mode, never by client patches.
  const md = MODE_BY_ID[mode];
  s.format = md?.format || "ipl";
  s.intlPool = (md?.defaults as any)?.intlPool ?? null;
  if (s.format !== "ipl") { s.pool = "intl"; s.rtm = false; s.rtmCards = 0; s.teamCount = (md?.defaults as any)?.teamCount ?? s.teamCount; s.overseasMax = s.intlPool?.startsWith("india") ? 0 : s.squadMax; }
  else if (s.pool === "intl") s.pool = "active";
  return s;
}

export function createRoom(hostId: string, mode: ModeId, patch: Partial<RoomSettings> = {}, name?: string, universe: "auction" | "real2026" = "auction"): Room {
  let code = "";
  do { code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(""); } while (rooms.has(code) || db.prepare("SELECT 1 FROM rooms WHERE code=?").get(code));
  const settings = sanitizeSettings(mode, patch);
  const host = getUser(hostId);
  const st: RoomState = {
    code, name: (name || `${host?.username || "Host"}'s ${universe === "real2026" ? "IPL 2026 Season" : MODE_BY_ID[mode].name}`).slice(0, 60), hostId, mode, settings, status: "lobby", createdAt: Date.now(),
    teams: [], members: [], pool: [], lot: null, lotSeq: 0, paused: false, sales: [], bidLog: [], news: [], chat: [], round: 1, seasonNo: 1, season: null,
    history: [], trades: [], universe, ratingOverrides: {}, version: 1,
  };
  const r = new Room(st);
  r.buildTeams();
  rooms.set(code, r);
  r.join(hostId);
  audit(code, hostId, "create", { mode, settings, universe });
  r.persist(true);
  return r;
}

export function loadRooms() {
  const rows = db.prepare("SELECT code, state FROM rooms WHERE status != 'archived'").all() as { code: string; state: string }[];
  for (const row of rows) {
    try {
      const st = JSON.parse(row.state) as RoomState;
      const r = new Room(st);
      for (const m of st.members) m.online = false;
      rooms.set(st.code, r);
      r.recover();
    } catch (e) { console.error("room load failed", row.code, e); }
  }
  return rooms.size;
}
export function listPublicRooms() {
  return [...rooms.values()].filter((r) => r.s.settings.isPublic && r.s.status !== "complete").map((r) => r.summary());
}
export function roomsForUser(userId: string) {
  return [...rooms.values()].filter((r) => r.s.members.some((m) => m.userId === userId)).map((r) => r.summary()).sort((a, b) => b.updated - a.updated);
}
export function allRooms() { return [...rooms.values()]; }

const RETAIN_COST_CAPPED = [18, 14, 11, 18, 14];
const RETAIN_COST_UNCAPPED = 4;

export class Room {
  s: RoomState;
  sockets = new Map<string, Set<WebSocket>>();
  timer: NodeJS.Timeout | null = null;
  aiTimer: NodeJS.Timeout | null = null;
  persistTimer: NodeJS.Timeout | null = null;
  bcastPending = false;
  hostAwayTimer: NodeJS.Timeout | null = null;
  updated = Date.now();

  constructor(s: RoomState) { this.s = s; }

  // ---------- helpers ----------
  get rules() { const s = this.s.settings; return { squadMin: s.squadMin, squadMax: s.squadMax, overseasMax: s.overseasMax, purse: s.purse, reserveRule: s.reserveRule }; }
  look = (pid: string): PlayerSummary | undefined => {
    const b = getSummary(pid);
    if (!b) return undefined;
    const o = this.s.ratingOverrides[pid];
    if (!o) return b;
    const { _stats, ...r } = o;
    return _stats ? { ...b, ratings: { ...b.ratings, ...r }, matches: _stats.matches, runs: _stats.runs, wkts: _stats.wkts, sr: _stats.sr, avg: _stats.avg, econ: _stats.econ } : { ...b, ratings: { ...b.ratings, ...r } };
  };
  team(id: string | null | undefined) { return this.s.teams.find((t) => t.id === id); }
  teamOf(userId: string) { const m = this.s.members.find((x) => x.userId === userId); return m?.teamId ? this.team(m.teamId) : undefined; }
  isHost(userId: string) { return this.s.hostId === userId; }
  tl(t: TeamState): TeamLike { return { id: t.id, name: t.name, purse: t.purse, startPurse: t.startPurse, squad: t.squad }; }
  owned(pid: string) { return this.s.teams.find((t) => t.squad.some((x) => x.pid === pid)); }
  news(text: string, kind = "info", extra: Partial<News> = {}) { this.s.news.unshift({ ts: Date.now(), text, kind, ...extra }); this.s.news = this.s.news.slice(0, 80); }
  summary() {
    const s = this.s;
    return { code: s.code, name: s.name, mode: s.mode, status: s.status, host: getUser(s.hostId)?.username, players: s.members.filter((m) => m.role === "player").length, online: s.members.filter((m) => m.online).length, teams: s.teams.length, humans: s.teams.filter((t) => t.ownerId).length, isPublic: s.settings.isPublic, updated: this.updated, seasonNo: s.seasonNo, universe: s.universe };
  }

  buildTeams() {
    const s = this.s, st = s.settings;
    const list = FRANCHISES.slice(0, s.mode === "custom" || (st.format && st.format !== "ipl") ? st.teamCount : 10);
    const pers = Object.keys(AI_PERSONALITIES) as Personality[];
    s.teams = list.map((f, i) => {
      const c = st.customNames?.[f.id];
      const previous = s.teams.find((t) => t.id === f.id);
      return {
        id: f.id, name: c?.name || f.name, short: c?.short || f.short, primary: c?.primary || f.primary, secondary: c?.secondary || f.secondary,
        ownerId: previous?.ownerId || null, ai: previous ? previous.ai : (st.aiFill ? pers[i % pers.length] : null), purse: st.purse, startPurse: st.purse, squad: [], rtmLeft: st.rtm ? st.rtmCards : 0,
        lineup: null, listed: [], retainPicks: null, retentionDone: false,
      };
    });
    for (const m of s.members) if (m.teamId && !this.team(m.teamId)) m.teamId = null;
  }

  /** Invariant: the AI only ever acts for franchises without a human owner. */
  enforceControl() { for (const t of this.s.teams) if (t.ownerId && t.ai) t.ai = null; }
  changed() {
    this.enforceControl();
    this.s.version++;
    this.updated = Date.now();
    if (!this.bcastPending) {
      this.bcastPending = true;
      setImmediate(() => { this.bcastPending = false; this.broadcast(); });
    }
    if (!this.persistTimer) this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persist(); }, 400);
  }
  persist(sync = false) {
    void sync;
    const s = this.s;
    db.prepare("INSERT OR REPLACE INTO rooms (code, state, updated, host_id, mode, public, status, name) VALUES (?,?,?,?,?,?,?,?)").run(s.code, JSON.stringify(s), Date.now(), s.hostId, s.mode, s.settings.isPublic ? 1 : 0, s.status, s.name);
  }

  // ---------- connections ----------
  attach(userId: string, ws: WebSocket) {
    let set = this.sockets.get(userId);
    if (!set) { set = new Set(); this.sockets.set(userId, set); }
    set.add(ws);
    this.join(userId);
    const m = this.s.members.find((x) => x.userId === userId)!;
    m.online = true; m.lastSeen = Date.now();
    if (userId === this.s.hostId && this.hostAwayTimer) { clearTimeout(this.hostAwayTimer); this.hostAwayTimer = null; }
    this.changed();
    this.sendTo(userId);
  }
  detach(userId: string, ws: WebSocket) {
    const set = this.sockets.get(userId);
    set?.delete(ws);
    if (!set || set.size === 0) {
      this.sockets.delete(userId);
      const m = this.s.members.find((x) => x.userId === userId);
      if (m) { m.online = false; m.lastSeen = Date.now(); }
      if (userId === this.s.hostId) {
        this.hostAwayTimer = setTimeout(() => {
          if (this.sockets.has(this.s.hostId)) return;
          const next = this.s.members.find((x) => x.online && x.userId !== this.s.hostId && x.role === "player") || this.s.members.find((x) => x.online && x.userId !== this.s.hostId);
          if (next) { this.s.hostId = next.userId; audit(this.s.code, "system", "host_auto_transfer", { to: next.userId }); this.news(`${next.username} is now hosting (previous host disconnected).`, "system"); this.changed(); }
        }, 60000);
      }
      this.changed();
    }
  }
  join(userId: string) {
    if (this.s.members.some((m) => m.userId === userId)) return;
    const u = getUser(userId);
    this.s.members.push({ userId, username: u?.username || "Guest", teamId: null, role: "spectator", online: false, ready: false, lastSeen: Date.now() });
    db.prepare("INSERT OR IGNORE INTO room_members (code, user_id) VALUES (?,?)").run(this.s.code, userId);
  }
  broadcast() { for (const uidd of this.sockets.keys()) this.sendTo(uidd); }
  sendTo(userId: string) {
    const set = this.sockets.get(userId);
    if (!set?.size) return;
    const msg = JSON.stringify({ type: "state", state: this.view(userId) });
    for (const ws of set) if (ws.readyState === 1) ws.send(msg);
  }
  event(ev: any) {
    const msg = JSON.stringify({ type: "event", ...ev });
    for (const set of this.sockets.values()) for (const ws of set) if (ws.readyState === 1) ws.send(msg);
  }

  // ---------- redacted view ----------
  view(userId: string) {
    const s = this.s;
    const me = s.members.find((m) => m.userId === userId);
    const myTeam = me?.teamId || null;
    const blind = s.mode === "blind" && (s.status === "auction" || s.status === "lobby");
    const hiddenSale = (x: Sale) => blind && !x.revealed && x.team !== myTeam;
    const teams = s.teams.map((t) => ({
      ...t,
      purse: blind && t.id !== myTeam ? null : round2(t.purse),
      squad: t.squad.filter((q) => !(blind && q.how === "auction" && t.id !== myTeam && s.sales.find((x) => x.pid === q.pid && hiddenSale(x)))),
      retainPicks: t.id === myTeam ? t.retainPicks : t.retainPicks ? t.retainPicks.length : null,
      ownerName: t.ownerId ? s.members.find((m) => m.userId === t.ownerId)?.username || getUser(t.ownerId)?.username : null,
      online: t.ownerId ? !!this.sockets.get(t.ownerId)?.size : false,
    }));
    let lot: any = null;
    if (s.lot) {
      const { aiVals, sealed, ...rest } = s.lot;
      void aiVals;
      lot = { ...rest, sealedCount: sealed ? Object.keys(sealed).length : 0, mySealed: sealed && myTeam ? sealed[myTeam]?.amount ?? null : null };
      if (blind && s.lot.result && s.lot.result.team !== myTeam && !s.sales.find((x) => x.n === s.lot!.seq)?.revealed) lot.result = { kind: s.lot.result.kind === "sold" ? "sealed" : s.lot.result.kind };
    }
    const sales = s.sales.map((x) => (hiddenSale(x) ? { ...x, team: "?", price: null, fee: null } : x));
    const pool = s.pool.map((p) => {
      if (blind && p.status === "sold") { const sale = s.sales.find((x) => x.pid === p.pid && x.season === s.seasonNo); if (sale && hiddenSale(sale)) return { ...p, status: "sealed" }; }
      return p;
    });
    return {
      code: s.code, name: s.name, hostId: s.hostId, mode: s.mode, settings: s.settings, status: s.status, createdAt: s.createdAt, version: s.version, now: Date.now(),
      members: s.members, teams, lot, pool, lotSeq: s.lotSeq, paused: s.paused, sales, bidLog: blind ? s.bidLog.filter((b) => b.team === myTeam).slice(-60) : s.bidLog.slice(-60),
      news: s.news.slice(0, 40), chat: s.chat.slice(-40), round: s.round, seasonNo: s.seasonNo, season: s.season, history: s.history, trades: s.trades.filter((t) => t.from === myTeam || t.to === myTeam || t.status !== "pending").slice(-40),
      universe: s.universe, ratingOverrides: s.ratingOverrides, me: { userId, teamId: myTeam, role: me?.role || "spectator", isHost: s.hostId === userId }, grades: s.grades || null, endedAt: s.endedAt || null,
      blindHidden: blind, retentionMax: s.retentionMax ?? null,
    };
  }

  // ---------- dispatcher ----------
  handle(userId: string, msg: any): { ok: boolean; error?: string } {
    try {
      const fn = (this as any)["on_" + msg.type];
      if (typeof fn !== "function") return { ok: false, error: "Unknown action" };
      const r = fn.call(this, userId, msg);
      if (r && r.error) return { ok: false, error: r.error };
      return { ok: true };
    } catch (e: any) {
      if (!e?.expected) console.error(e);
      return { ok: false, error: e.message || "Server error" };
    }
  }
  requireHost(userId: string) { if (!this.isHost(userId)) throw Object.assign(new Error("Only the host can do that"), { expected: true }); }

  // ---------- lobby ----------
  on_chat(userId: string, m: any) {
    const text = String(m.text || "").slice(0, 280).trim();
    if (!text) return;
    const mem = this.s.members.find((x) => x.userId === userId);
    this.s.chat.push({ userId, name: mem?.username || "?", text, ts: Date.now() });
    this.s.chat = this.s.chat.slice(-100);
    this.changed();
  }
  on_pickTeam(userId: string, m: any) {
    const s = this.s;
    const mem = s.members.find((x) => x.userId === userId)!;
    if (m.teamId == null) {
      if (s.status !== "lobby") return { error: "You can only leave a franchise in the lobby" };
      const t = this.team(mem.teamId); if (t) t.ownerId = null;
      mem.teamId = null; mem.role = "spectator"; mem.ready = false;
      this.changed(); return;
    }
    const t = this.team(m.teamId);
    if (!t) return { error: "No such franchise" };
    if (t.ownerId && t.ownerId !== userId) return { error: "Franchise already taken" };
    if (s.status !== "lobby") {
      // Allow taking over an AI-controlled franchise mid-game only when its previous human owner is this user (reconnect) or it is AI and host allows
      if (!t.ai && t.ownerId !== userId) return { error: "Game in progress" };
      if (mem.teamId) return { error: "You already control a franchise" };
    }
    const prev = this.team(mem.teamId); if (prev && prev !== t) prev.ownerId = null;
    t.ownerId = userId; t.ai = null; // a human-owned franchise is never driven by the AI
    mem.teamId = t.id; mem.role = "player"; mem.ready = false;
    audit(s.code, userId, "pick_team", { team: t.id });
    this.changed();
  }
  on_ready(userId: string, m: any) { const mem = this.s.members.find((x) => x.userId === userId); if (mem) { mem.ready = !!m.ready; this.changed(); } }
  on_settings(userId: string, m: any) {
    this.requireHost(userId);
    if (this.s.status !== "lobby") return { error: "Settings are locked once the game starts" };
    const prevCount = this.s.teams.length;
    this.s.settings = sanitizeSettings(this.s.mode, m.patch || {}, this.s.settings);
    if (typeof m.name === "string" && m.name.trim()) this.s.name = m.name.trim().slice(0, 60);
    if ((this.s.mode === "custom" || this.s.settings.format !== "ipl") && (prevCount !== this.s.settings.teamCount || m.patch?.customNames)) this.buildTeams();
    else for (const t of this.s.teams) {
      t.purse = this.s.settings.purse;
      t.startPurse = this.s.settings.purse;
      t.rtmLeft = this.s.settings.rtm ? this.s.settings.rtmCards : 0;
      // Only change franchise AI assignments when the host explicitly changes
      // the global AI-fill switch. Per-franchise "No AI" choices must persist
      // through unrelated settings edits.
      if (!t.ownerId && Object.prototype.hasOwnProperty.call(m.patch || {}, "aiFill")) {
        t.ai = this.s.settings.aiFill ? (t.ai || "balanced") : null;
      }
    }
    audit(this.s.code, userId, "settings", m.patch);
    this.changed();
  }
  on_setAI(userId: string, m: any) {
    this.requireHost(userId);
    const t = this.team(m.teamId);
    if (!t || t.ownerId) return { error: "Only empty franchises can be AI" };
    t.ai = m.personality && (AI_PERSONALITIES as any)[m.personality] ? m.personality : null;
    this.changed();
  }
  on_kick(userId: string, m: any) {
    this.requireHost(userId);
    const mem = this.s.members.find((x) => x.userId === m.userId);
    if (!mem || mem.userId === this.s.hostId) return { error: "Cannot remove" };
    const t = this.team(mem.teamId);
    if (t) { t.ownerId = null; t.ai = "balanced"; }
    this.s.members = this.s.members.filter((x) => x !== mem);
    for (const ws of this.sockets.get(mem.userId) || []) ws.send(JSON.stringify({ type: "kicked", code: this.s.code }));
    audit(this.s.code, userId, "kick", { user: mem.userId });
    this.changed();
  }
  on_transferHost(userId: string, m: any) {
    this.requireHost(userId);
    const mem = this.s.members.find((x) => x.userId === m.userId);
    if (!mem) return { error: "Not a member" };
    this.s.hostId = mem.userId;
    audit(this.s.code, userId, "transfer_host", { to: mem.userId });
    this.news(`${mem.username} is now the host.`, "system");
    this.changed();
  }

  on_start(userId: string) {
    this.requireHost(userId);
    const s = this.s;
    if (s.status !== "lobby") return { error: "Already started" };
    const humans = s.teams.filter((t) => t.ownerId);
    if (!humans.length) return { error: "Pick a franchise first" };
    const notReady = s.members.filter((m) => m.teamId && m.userId !== s.hostId && !m.ready);
    if (notReady.length) return { error: `Waiting for: ${notReady.map((m) => m.username).join(", ")} to ready up` };
    this.enforceControl();
    // Respect each franchise AI selection; null explicitly means no AI.
    audit(s.code, userId, "start", { teams: s.teams.map((t) => [t.id, t.ownerId || "ai:" + t.ai]) });
    if (s.universe === "real2026") return this.startReal2026();
    // legends: era-specific ratings
    if (s.mode === "legends" || (s.settings.format && s.settings.format !== "ipl")) {
      s.ratingOverrides = {};
    }
    if (s.mode === "mini") {
      const ret = mini2026Retained();
      for (const t of s.teams) {
        t.squad = (ret[t.id] || []).map((r) => ({ pid: r.pid, price: r.price, how: "retained" as const, season: 1 }));
        t.purse = MINI_2026_PURSE[t.id] ?? s.settings.purse; t.startPurse = t.purse;
      }
      this.news("Real IPL 2026 retentions loaded. Purses match the figures franchises took to the Abu Dhabi auction.", "system");
    }
    if (s.mode === "mega" && s.settings.rtm) return this.beginRetention(6, "mega");
    this.beginAuction();
  }

  startReal2026() {
    const s = this.s;
    for (const t of s.teams) {
      t.squad = allSummaries().filter((p) => p.team2026 === t.id).map((p) => ({ pid: p.id, price: p.price2026 || 0, how: "squad2026" as const, season: 1 }));
      t.purse = 0; t.startPurse = s.settings.purse;
    }
    s.status = "post";
    this.news("Real IPL 2026 squads loaded (Wikipedia squad lists). Results from here on are simulated.", "system");
    this.changed();
  }

  // ---------- retention (mega pre-auction & championship) ----------
  beginRetention(max: number, kind: "mega" | "championship") {
    const s = this.s;
    s.status = "retention";
    s.retentionMax = max;
    for (const t of s.teams) {
      t.retainPicks = []; t.retentionDone = false;
      if (kind === "mega") {
        // candidates: real 2026 squad players of this franchise
        t.squad = allSummaries().filter((p) => p.team2026 === t.id).map((p) => ({ pid: p.id, price: p.price2026 || 0, how: "squad2026" as const, season: s.seasonNo }));
      }
      if (t.ai && !t.ownerId) { t.retainPicks = this.aiRetain(t, max, kind); t.retentionDone = true; }
    }
    this.news(kind === "mega" ? `Retention window open: keep up to ${max} players from your 2026 squad. Unused slots become Right-to-Match cards.` : `Season ${s.seasonNo - 1} complete. Retain up to ${max} players before the next auction.`, "system");
    (s as any).retentionKind = kind;
    this.changed();
  }
  retentionCost(t: TeamState, picks: string[]) {
    const kind = (this.s as any).retentionKind;
    if (kind === "mega") {
      let capped = 0, cost = 0;
      for (const pid of picks) { const p = this.look(pid); if (p?.capped) { cost += RETAIN_COST_CAPPED[capped] ?? 18; capped++; } else cost += RETAIN_COST_UNCAPPED; }
      return cost * (this.s.settings.purse / 120);
    }
    return picks.reduce((a, pid) => a + (t.squad.find((x) => x.pid === pid)?.price || 0), 0);
  }
  validRetention(t: TeamState, picks: string[]): string | null {
    const max = this.s.retentionMax ?? 4;
    if (picks.length > max) return `Maximum ${max} retentions`;
    if (new Set(picks).size !== picks.length) return "Duplicate player";
    for (const pid of picks) if (!t.squad.some((x) => x.pid === pid)) return "Player not in your squad";
    if ((this.s as any).retentionKind === "mega") {
      const capped = picks.filter((p) => this.look(p)?.capped).length;
      const unc = picks.length - capped;
      if (capped > 5) return "At most 5 capped retentions";
      if (unc > 2) return "At most 2 uncapped retentions";
    }
    const cost = this.retentionCost(t, picks);
    const purse = this.nextPurse(t);
    if (cost > purse) return `Retentions cost ${fmtCr(cost)} but purse is ${fmtCr(purse)}`;
    return null;
  }
  nextPurse(t: TeamState) {
    const kind = (this.s as any).retentionKind;
    if (kind === "mega") return this.s.settings.purse;
    return this.s.settings.purse + this.s.settings.purseTopUp * (this.s.seasonNo - 1);
  }
  aiRetain(t: TeamState, max: number, kind: string) {
    const ranked = t.squad.map((x) => this.look(x.pid)!).filter(Boolean).sort((a, b) => b.ratings.overall - a.ratings.overall);
    const n = t.ai === "moneyball" ? Math.min(2, max) : t.ai === "starchaser" ? Math.min(4, max) : Math.min(3, max);
    const picks: string[] = [];
    for (const p of ranked) {
      if (picks.length >= n) break;
      const trial = [...picks, p.id];
      if (!this.validRetention(t, trial)) {
        const cost = kind === "mega" ? this.retentionCost(t, trial) - this.retentionCost(t, picks) : t.squad.find((x) => x.pid === p.id)!.price;
        if (fairValue(p.ratings.overall, this.s.settings.purse) >= cost * 0.75) picks.push(p.id);
      }
    }
    return picks;
  }
  on_retain(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t || this.s.status !== "retention") return { error: "Not in a retention window" };
    const picks = (m.pids || []).map(String);
    const err = this.validRetention(t, picks);
    if (err) return { error: err };
    t.retainPicks = picks; t.retentionDone = !!m.confirm;
    audit(this.s.code, userId, "retain", { team: t.id, picks, confirm: !!m.confirm });
    this.changed();
    if (this.s.teams.every((x) => x.retentionDone)) this.finishRetention();
  }
  on_forceRetention(userId: string) {
    this.requireHost(userId);
    if (this.s.status !== "retention") return;
    for (const t of this.s.teams) t.retentionDone = true;
    this.finishRetention();
  }
  finishRetention() {
    const s = this.s;
    const kind = (s as any).retentionKind;
    for (const t of s.teams) {
      const picks = t.retainPicks || [];
      const cost = this.retentionCost(t, picks);
      const purse = this.nextPurse(t);
      const priceOf = (pid: string, idx: number) => {
        if (kind !== "mega") return t.squad.find((x) => x.pid === pid)!.price;
        const p = this.look(pid)!;
        const cappedIdx = picks.slice(0, idx).filter((x) => this.look(x)?.capped).length;
        return round2((p.capped ? RETAIN_COST_CAPPED[cappedIdx] ?? 18 : RETAIN_COST_UNCAPPED) * (s.settings.purse / 120));
      };
      t.squad = picks.map((pid, i) => ({ pid, price: priceOf(pid, i), how: "retained" as const, season: s.seasonNo }));
      t.purse = round2(purse - cost); t.startPurse = purse;
      if (kind === "mega") t.rtmLeft = s.settings.rtm ? Math.max(0, 6 - picks.length) : 0;
      t.retainPicks = null; t.lineup = null;
      if (picks.length) this.news(`${t.short} retain ${picks.map((p) => this.look(p)?.name).join(", ")} (${fmtCr(cost)}).`, "retention", { team: t.id });
    }
    audit(s.code, "system", "retention_done", s.teams.map((t) => [t.id, t.squad.map((x) => x.pid)]));
    this.beginAuction();
  }

  // ---------- auction ----------
  beginAuction() {
    const s = this.s;
    const ownedIds = new Set(s.teams.flatMap((t) => t.squad.map((x) => x.pid)));
    const pool = buildPool(s.settings).filter((p) => !ownedIds.has(p.pid));
    s.pool = pool.map((p) => ({ ...p, status: "pending" as const, round: 1 }));
    if (s.mode === "legends") for (const p of s.pool) { const fp = getPlayer(p.pid); if (fp) s.ratingOverrides[p.pid] = eraRating(fp, s.settings.era); }
    if (s.settings.format && s.settings.format !== "ipl") {
      const fmt = s.settings.format;
      for (const pid of [...s.pool.map((p) => p.pid), ...s.teams.flatMap((t) => t.squad.map((x) => x.pid))]) { const o = intlOverride(getPlayer(pid), fmt); if (o) s.ratingOverrides[pid] = o; }
    }
    s.round = 1; s.status = "auction"; s.paused = false;
    this.news(`${MODE_BY_ID[s.mode].name} begins: ${s.pool.length} players across ${new Set(s.pool.map((p) => p.set)).size} sets.`, "system");
    audit(s.code, "system", "auction_start", { pool: s.pool.length, season: s.seasonNo });
    this.nextLot();
  }
  incrementFor(cur: number | null, base: number) {
    const st = this.s.settings;
    if (cur == null) return round2(base);
    if (st.customIncrement) return round2(cur + st.customIncrement);
    return nextBid(cur, base, { increments: [{ upTo: 1, step: 0.05 }, { upTo: 2, step: 0.1 }, { upTo: Infinity, step: 0.2 }] }, st.incrementMultiplier);
  }
  nextLot() {
    const s = this.s;
    this.clearTimers();
    const prevSet = s.lot?.set;
    let idx = s.pool.findIndex((p) => p.status === "pending");
    if (idx < 0) {
      const unsold = s.pool.filter((p) => p.status === "unsold");
      const anyNeed = s.teams.some((t) => t.squad.length < s.settings.squadMax);
      if (unsold.length && s.round <= s.settings.unsoldRounds && anyNeed) {
        s.round++;
        for (const p of unsold) { p.status = "pending"; p.round = s.round; p.set = `Accelerated round ${s.round - 1}`; p.base = Math.max(0.2, round2(p.base * (s.settings.pool === "mini2026" ? 1 : 1))); }
        this.news(`Accelerated round ${s.round - 1}: ${unsold.length} unsold players return.`, "system");
        idx = s.pool.findIndex((p) => p.status === "pending");
      }
    }
    if (prevSet && s.mode === "blind" && s.settings.blindVisibility === "after-set" && (idx < 0 || s.pool[idx].set !== prevSet)) this.revealBlind(prevSet);
    if (idx < 0 || s.teams.every((t) => t.squad.length >= s.settings.squadMax)) return this.endAuction();
    const p = s.pool[idx];
    const fp = getPlayer(p.pid);
    s.lotSeq++;
    const r26 = fp?.auction?.find((e: any) => e.year === 2026);
    s.lot = {
      seq: s.lotSeq, pid: p.pid, base: p.base, set: p.set, round: p.round, phase: s.settings.introTimer > 0 ? "intro" : s.mode === "blind" ? "sealed" : "bidding",
      bid: null, leader: null, bidders: [], history: [], endsAt: Date.now() + (s.settings.introTimer > 0 ? s.settings.introTimer * 1000 : s.settings.bidTimer * 1000 + 3000),
      sealed: s.mode === "blind" ? {} : undefined, aiVals: {}, startedAt: Date.now(),
      real2026: r26 ? { team: r26.team || null, price: r26.priceCr ?? null, how: r26.type } : fp?.squad2026 ? { team: fp.squad2026.team, price: fp.squad2026.priceCr, how: fp.squad2026.how } : null,
    };
    for (const t of s.teams) if (t.ai) s.lot.aiVals![t.id] = this.aiValuation(t, this.look(p.pid)!);
    this.event({ kind: "lot", seq: s.lotSeq, pid: p.pid });
    this.schedule();
    this.changed();
  }
  schedule() {
    const s = this.s;
    if (this.timer) clearTimeout(this.timer);
    if (!s.lot || s.paused) return;
    const ms = Math.max(0, s.lot.endsAt - Date.now());
    this.timer = setTimeout(() => this.onTimer(), ms + 30);
    if (s.lot.phase === "bidding" || s.lot.phase === "sealed" || s.lot.phase.startsWith("rtm")) this.scheduleAI();
  }
  clearTimers() { if (this.timer) clearTimeout(this.timer); if (this.aiTimer) clearTimeout(this.aiTimer); this.timer = null; this.aiTimer = null; }

  onTimer() {
    const s = this.s, lot = s.lot;
    if (!lot || s.paused) return;
    if (Date.now() < lot.endsAt - 5) return this.schedule();
    switch (lot.phase) {
      case "intro":
        lot.phase = s.mode === "blind" ? "sealed" : "bidding";
        lot.endsAt = Date.now() + s.settings.bidTimer * 1000 + (s.mode === "blind" ? 0 : 3000);
        this.schedule(); this.changed(); return;
      case "bidding": return this.closeBidding();
      case "sealed": return this.resolveSealed();
      case "rtm": return this.rtmDecision(lot.rtmTeam!, false);
      case "rtm-raise": return this.rtmRaise(lot.leader!, null);
      case "rtm-final": return this.rtmFinal(lot.rtmTeam!, false);
      case "result": return this.nextLot();
    }
  }

  canBid(t: TeamState, amount: number) {
    const lot = this.s.lot!;
    const p = this.look(lot.pid)!;
    if (this.owned(lot.pid)) return "Player already owned";
    return purchaseBlock(this.tl(t), p, amount, this.look, this.rules);
  }

  on_bid(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t) return { error: "Spectators cannot bid" };
    return this.placeBid(t, m.seq, m.amount, userId);
  }
  placeBid(t: TeamState, seq: number, amount: number, actor: string) {
    if (actor.startsWith("ai:") && t.ownerId) return { error: "AI cannot bid for a human-owned franchise" };
    const s = this.s, lot = s.lot;
    if (s.status !== "auction" || !lot) return { error: "No active lot" };
    if (s.paused) return { error: "Auction paused" };
    if (lot.seq !== seq) return { error: "That lot has closed" };
    if (lot.phase !== "bidding") return { error: lot.phase === "intro" ? "Bidding opens after the introduction" : "Bidding is closed for this lot" };
    if (Date.now() > lot.endsAt) return { error: "Hammer already fell" };
    if (lot.leader === t.id) return { error: "You already hold the highest bid" };
    const expected = this.incrementFor(lot.bid, lot.base);
    amount = round2(Number(amount));
    if (!(amount >= expected - 1e-9)) return { error: `Bid must be at least ${fmtCr(expected)}` };
    if (amount > expected + 1e-9) {
      // custom jump bid must sit on 5-lakh grid
      if (Math.abs(amount * 20 - Math.round(amount * 20)) > 1e-6) return { error: "Custom bids must be in multiples of ₹5 L" };
    }
    const block = this.canBid(t, amount);
    if (block) return { error: block };
    lot.bid = amount; lot.leader = t.id;
    if (!lot.bidders.includes(t.id)) lot.bidders.push(t.id);
    lot.history.push({ team: t.id, amount, ts: Date.now() });
    s.bidLog.push({ team: t.id, pid: lot.pid, amount, lot: lot.seq, ts: Date.now() });
    if (s.bidLog.length > 4000) s.bidLog = s.bidLog.slice(-3000);
    lot.endsAt = Date.now() + s.settings.bidTimer * 1000;
    this.event({ kind: "bid", team: t.id, amount, seq: lot.seq });
    this.schedule();
    this.changed();
    void actor;
    return {};
  }

  // Blind sealed bid
  on_sealed(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t) return { error: "Spectators cannot bid" };
    return this.placeSealed(t, m.seq, m.amount);
  }
  placeSealed(t: TeamState, seq: number, amount: number | null) {
    const s = this.s, lot = s.lot;
    if (!lot || lot.seq !== seq || lot.phase !== "sealed" || s.paused) return { error: "Sealed bidding is not open" };
    if (lot.sealed![t.id]) return { error: "You have already submitted a sealed bid for this player" };
    if (amount == null) { lot.sealed![t.id] = { amount: 0, ts: Date.now() }; }
    else {
      amount = round2(Number(amount));
      if (amount < lot.base) return { error: `Minimum bid is the base price ${fmtCr(lot.base)}` };
      if (Math.abs(amount * 20 - Math.round(amount * 20)) > 1e-6) return { error: "Bids must be in multiples of ₹5 L" };
      const block = this.canBid(t, amount);
      if (block) return { error: block };
      lot.sealed![t.id] = { amount, ts: Date.now() };
      s.bidLog.push({ team: t.id, pid: lot.pid, amount, lot: lot.seq, ts: Date.now() });
    }
    const eligible = s.teams.filter((x) => !this.canBid(x, lot.base));
    if (eligible.every((x) => lot.sealed![x.id])) { lot.endsAt = Date.now(); this.schedule(); }
    this.changed();
    return {};
  }
  resolveSealed() {
    const lot = this.s.lot!;
    const bids = Object.entries(lot.sealed || {}).filter(([, v]) => v.amount > 0).sort((a, b) => b[1].amount - a[1].amount || a[1].ts - b[1].ts);
    for (const [tid, v] of bids) {
      const t = this.team(tid)!;
      if (!this.canBid(t, v.amount)) { lot.bid = v.amount; lot.leader = tid; lot.bidders = bids.map((b) => b[0]); return this.sell(t, v.amount, "auction"); }
    }
    this.unsold();
  }
  revealBlind(set?: string) {
    let n = 0;
    for (const x of this.s.sales) if (!x.revealed && (!set || x.set === set)) { x.revealed = true; n++; }
    if (n) this.news(`Sealed results revealed${set ? ` for ${set}` : ""}: ${n} players.`, "reveal");
  }

  closeBidding() {
    const s = this.s, lot = s.lot!;
    if (!lot.leader) return this.unsold();
    const winner = this.team(lot.leader)!;
    // RTM check
    const fp = getPlayer(lot.pid);
    const prev = fp?.squad2026?.team || null;
    if (s.settings.rtm && prev && prev !== winner.id && s.mode !== "blind") {
      const rt = this.team(prev);
      if (rt && rt.rtmLeft > 0 && !this.canBid(rt, lot.bid!)) {
        lot.phase = "rtm"; lot.rtmTeam = rt.id; lot.endsAt = Date.now() + 10000;
        this.news(`${rt.short} can use a Right-to-Match card on ${this.look(lot.pid)?.name} at ${fmtCr(lot.bid)}.`, "rtm", { team: rt.id, pid: lot.pid });
        this.schedule(); this.changed(); return;
      }
    }
    this.sell(winner, lot.bid!, "auction");
  }
  on_rtm(userId: string, m: any) {
    const t = this.teamOf(userId); const lot = this.s.lot;
    if (!t || !lot) return { error: "No RTM pending" };
    if (lot.phase === "rtm" && lot.rtmTeam === t.id) return this.rtmDecision(t.id, !!m.use);
    if (lot.phase === "rtm-raise" && lot.leader === t.id) return this.rtmRaise(t.id, m.amount == null ? null : Number(m.amount));
    if (lot.phase === "rtm-final" && lot.rtmTeam === t.id) return this.rtmFinal(t.id, !!m.use);
    return { error: "Not your decision" };
  }
  rtmDecision(tid: string, use: boolean) {
    const lot = this.s.lot!;
    if (!use) { this.news(`${this.team(tid)?.short} decline to use RTM.`, "rtm"); return this.sell(this.team(lot.leader)!, lot.bid!, "auction"); }
    lot.phase = "rtm-raise"; lot.endsAt = Date.now() + 10000;
    this.news(`${this.team(tid)?.short} raise the RTM card. ${this.team(lot.leader)?.short} get one final chance to raise.`, "rtm");
    this.schedule(); this.changed(); return {};
  }
  rtmRaise(tid: string, amount: number | null) {
    const lot = this.s.lot!;
    const winner = this.team(lot.leader)!, rt = this.team(lot.rtmTeam)!;
    if (amount != null) {
      amount = round2(amount);
      if (amount <= lot.bid!) return { error: "Raise must be above the current bid" };
      const block = this.canBid(winner, amount); if (block) return { error: block };
      lot.bid = amount; lot.history.push({ team: winner.id, amount, ts: Date.now() });
      this.s.bidLog.push({ team: winner.id, pid: lot.pid, amount, lot: lot.seq, ts: Date.now() });
      if (this.canBid(rt, amount)) { this.news(`${rt.short} cannot afford to match ${fmtCr(amount)}.`, "rtm"); return this.sell(winner, amount, "auction"); }
      lot.phase = "rtm-final"; lot.endsAt = Date.now() + 10000;
      this.news(`${winner.short} raise to ${fmtCr(amount)}. Will ${rt.short} match?`, "rtm");
      this.schedule(); this.changed(); return {};
    }
    void tid;
    return this.sell(rt, lot.bid!, "rtm");
  }
  rtmFinal(tid: string, use: boolean) {
    const lot = this.s.lot!;
    void tid;
    if (use) return this.sell(this.team(lot.rtmTeam)!, lot.bid!, "rtm");
    return this.sell(this.team(lot.leader)!, lot.bid!, "auction");
  }

  sell(t: TeamState, price: number, how: "auction" | "rtm") {
    const s = this.s, lot = s.lot!;
    // Final authoritative re-validation inside the single-threaded commit
    const block = this.canBid(t, price);
    if (block) { this.news(`Sale to ${t.short} rejected at commit: ${block}. Player unsold.`, "warning"); return this.unsold(); }
    const p = this.look(lot.pid)!;
    const fee = p.overseas && s.settings.overseasFeeCap ? Math.min(price, s.settings.overseasFeeCap) : price;
    t.purse = round2(t.purse - price);
    if (t.purse < 0) throw new Error("Invariant violated: negative purse");
    if (how === "rtm") t.rtmLeft--;
    t.squad.push({ pid: lot.pid, price, how, season: s.seasonNo, fee });
    const poolItem = s.pool.find((x) => x.pid === lot.pid && x.status === "pending");
    if (poolItem) poolItem.status = "sold";
    const sale: Sale = { n: lot.seq, pid: lot.pid, team: t.id, price, fee, base: lot.base, how, ts: Date.now(), bidders: lot.bidders.length, set: lot.set, round: lot.round, revealed: s.mode !== "blind" || s.settings.blindVisibility === "after-lot", season: s.seasonNo };
    s.sales.push(sale);
    lot.phase = "result"; lot.result = { kind: "sold", team: t.id, price, how }; lot.endsAt = Date.now() + 3200;
    audit(s.code, t.ownerId || "ai:" + t.ai, "sold", { pid: lot.pid, team: t.id, price, how, seq: lot.seq });
    this.headlines(sale, p, t);
    if (t.ownerId) {
      grantAchievement(t.ownerId, "first_purchase", s.code);
      if (lot.bidders.length >= 3) grantAchievement(t.ownerId, "bidding_war", s.code);
      addXp(t.ownerId, 5);
    }
    this.event({ kind: "sold", team: t.id, pid: lot.pid, price, how });
    this.schedule(); this.changed();
    return {};
  }
  unsold() {
    const s = this.s, lot = s.lot!;
    const poolItem = s.pool.find((x) => x.pid === lot.pid && x.status === "pending");
    if (poolItem) poolItem.status = "unsold";
    lot.phase = "result"; lot.result = { kind: "unsold" }; lot.endsAt = Date.now() + 2400;
    const p = this.look(lot.pid);
    if (p && p.ratings.overall >= 80 && s.mode !== "blind") this.news(`Shock: ${p.name} (rating ${p.ratings.overall}) goes UNSOLD at ${fmtCr(lot.base)}.`, "unsold", { pid: p.id });
    audit(s.code, "system", "unsold", { pid: lot.pid, seq: lot.seq });
    this.event({ kind: "unsold", pid: lot.pid });
    this.schedule(); this.changed();
    return {};
  }
  headlines(sale: Sale, p: PlayerSummary, t: TeamState) {
    if (this.s.mode === "blind" && !sale.revealed) { this.news(`Sealed envelope opened for ${p.name}. Result hidden until reveal.`, "sealed", { pid: p.id }); return; }
    const fv = fairValue(p.ratings.overall, this.s.settings.purse);
    const top = Math.max(0, ...this.s.sales.filter((x) => x !== sale && x.season === this.s.seasonNo).map((x) => x.price));
    if (sale.how === "rtm") this.news(`${t.short} use Right-to-Match to keep ${p.name} at ${fmtCr(sale.price)}.`, "rtm", { team: t.id, pid: p.id });
    else if (sale.price > top && this.s.sales.length > 1) this.news(`RECORD BUY: ${t.name} make ${p.name} the most expensive player of this auction at ${fmtCr(sale.price)}.`, "record", { team: t.id, pid: p.id });
    else if (sale.bidders >= 3) this.news(`Bidding war: ${sale.bidders} franchises fought for ${p.name}. ${t.short} win at ${fmtCr(sale.price)}.`, "war", { team: t.id, pid: p.id });
    else if (sale.price <= fv * 0.6 && p.ratings.overall >= 65) this.news(`Bargain alert: ${t.short} land ${p.name} for ${fmtCr(sale.price)} (calculated value ${fmtCr(fv)}).`, "bargain", { team: t.id, pid: p.id });
    else if (sale.price >= fv * 1.8 && sale.price >= 3) this.news(`Premium paid: ${t.short} spend ${fmtCr(sale.price)} on ${p.name}, well above calculated value ${fmtCr(fv)}.`, "overpay", { team: t.id, pid: p.id });
    else this.news(`${p.name} sold to ${t.short} for ${fmtCr(sale.price)}.`, "sold", { team: t.id, pid: p.id });
    if (sale.price !== sale.fee) this.news(`Overseas fee cap: ${p.name} receives ${fmtCr(sale.fee)}; the remaining ${fmtCr(sale.price - sale.fee)} goes to the BCCI welfare fund. ${t.short}'s purse is debited the full bid.`, "rule", { pid: p.id });
    if (t.purse < t.startPurse * 0.1 && t.purse + sale.price >= t.startPurse * 0.1) this.news(`${t.short} are down to ${fmtCr(t.purse)}, under 10% of their purse.`, "purse", { team: t.id });
    if (t.squad.length === this.s.settings.squadMin) this.news(`${t.short} reach the minimum squad size of ${this.s.settings.squadMin}.`, "squad", { team: t.id });
  }

  // ---------- AI ----------
  aiValuation(t: TeamState, p: PlayerSummary) {
    const st = this.s.settings;
    const per = AI_PERSONALITIES[t.ai || "balanced"];
    let v = fairValue(p.ratings.overall, st.purse);
    if (this.s.mode === "blind") v *= 0.9;
    if (p.ratings.overall >= 85) v *= per.starBias;
    const age = ageOn(p.dob);
    if (age && age <= 24) v *= per.youthBias; else if (age && age >= 35) v *= 2 - per.youthBias;
    v *= per.overpay;
    if (per.valueBias > 1 && p.ratings.overall < 70) v *= 0.95;
    const sd = { easy: 0.35, normal: 0.2, hard: 0.12, expert: 0.06 }[st.aiDifficulty];
    const bias = { easy: 0.85, normal: 0.95, hard: 1.0, expert: 1.02 }[st.aiDifficulty];
    const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2 * sd;
    v *= bias * (1 + g);
    if (p.ratings.limited) v *= 0.8;
    return round2(Math.max(0, v));
  }
  aiWillPay(t: TeamState, p: PlayerSummary, amount: number) {
    const lot = this.s.lot!;
    let v = lot.aiVals?.[t.id] ?? this.aiValuation(t, p);
    const n = needs(this.tl(t), this.look, this.rules);
    const key = slotKey(p);
    const gap = n.gaps[key] || 0;
    v *= gap > 0 ? Math.min(1.25, 1.1 + 0.04 * gap) : (n.have[key] || 0) >= (n.want[key] || 0) + 2 ? 0.35 : 0.75;
    v = Math.min(v, fairValue(p.ratings.overall, this.s.settings.purse) * 1.7);
    if (p.overseas && n.overseasLeft <= 0) return false;
    // budget planning: keep enough for remaining minimum slots
    const remainingNeeded = Math.max(0, n.minNeeded - 1);
    const budgetCap = t.purse - remainingNeeded * Math.max(0.3, this.s.settings.purse * 0.004);
    if (this.s.settings.aiDifficulty === "expert" || this.s.settings.aiDifficulty === "hard") v = Math.min(v, budgetCap);
    v = Math.min(v, t.purse * (t.ai === "starchaser" || t.ai === "aggressor" ? 0.55 : 0.4) + (n.minNeeded <= 1 ? t.purse : 0));
    // late-auction squad filling
    const pending = this.s.pool.filter((x) => x.status === "pending").length;
    if (n.minNeeded > 0 && pending <= n.minNeeded * 4) v = Math.max(v, Math.min(budgetCap, lot.base * 1.5));
    return amount <= v;
  }
  scheduleAI() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    const s = this.s, lot = s.lot;
    this.enforceControl();
    if (!lot || s.paused || !s.teams.some((t) => t.ai)) return;
    const left = lot.endsAt - Date.now();
    const diff = s.settings.aiDifficulty;
    const base = lot.phase === "sealed" ? 800 + Math.random() * Math.min(5000, left * 0.6) : 280 + Math.random() * Math.min(900, Math.max(200, left - 900));
    const delay = Math.max(250, Math.min(base * (diff === "expert" ? 0.8 : 1), left - 350));
    if (left < 400) return;
    this.aiTimer = setTimeout(() => this.aiTick(), delay);
  }
  aiTick() {
    const s = this.s, lot = s.lot;
    if (!lot || s.paused || s.status !== "auction") return;
    const p = this.look(lot.pid)!;
    if (lot.phase === "sealed") {
      for (const t of s.teams.filter((x) => x.ai && !x.ownerId && !lot.sealed![x.id])) {
        let v = lot.aiVals?.[t.id] ?? 0;
        const n = needs(this.tl(t), this.look, this.rules);
        v *= (n.gaps[slotKey(p)] || 0) > 0 ? 1.15 : 0.7;
        v = Math.min(v, t.purse * 0.45);
        const amt = round2(Math.round(Math.max(v, 0) * 20) / 20);
        if (amt >= lot.base && !this.canBid(t, amt)) this.placeSealed(t, lot.seq, amt); else this.placeSealed(t, lot.seq, null);
        break;
      }
      this.scheduleAI();
      return;
    }
    if (lot.phase === "rtm") { const rt = this.team(lot.rtmTeam); if (rt?.ai) { const fv = (lot.aiVals?.[rt.id] ?? 0) * 1.1; this.rtmDecision(rt.id, lot.bid! <= fv); } return; }
    if (lot.phase === "rtm-raise") { const w = this.team(lot.leader); if (w?.ai) { const v = lot.aiVals?.[w.id] ?? 0; const raise = round2(Math.min(v, lot.bid! * 1.25)); this.rtmRaise(w.id, raise > lot.bid! + 0.1 && !this.canBid(w, raise) ? raise : null); } return; }
    if (lot.phase === "rtm-final") { const rt = this.team(lot.rtmTeam); if (rt?.ai) { const fv = (lot.aiVals?.[rt.id] ?? 0) * 1.15; this.rtmFinal(rt.id, lot.bid! <= fv); } return; }
    if (lot.phase !== "bidding") return;
    const amount = this.incrementFor(lot.bid, lot.base);
    const willing = s.teams.filter((t) => t.ai && !t.ownerId && t.id !== lot.leader && !this.canBid(t, amount) && this.aiWillPay(t, p, amount));
    if (willing.length) {
      const aggr = (t: TeamState) => (t.ai === "aggressor" ? 1.6 : t.ai === "starchaser" ? 1.25 : 1) * Math.random();
      const pick = willing.sort((a, b) => aggr(b) - aggr(a))[0];
      const prob = pick.ai === "aggressor" ? 0.95 : 0.8;
      if (Math.random() < prob) {
        // jump bid when far below valuation (keeps lots moving like a real auction room)
        let amt = amount;
        const v = lot.aiVals?.[pick.id] ?? 0;
        if (lot.bid != null && amount < v * 0.45) { const j = this.incrementFor(this.incrementFor(amount, lot.base), lot.base); const j2 = this.incrementFor(j, lot.base); amt = !this.canBid(pick, j2) ? j2 : amount; }
        this.placeBid(pick, lot.seq, amt, "ai:" + pick.ai); return;
      }
    }
    this.scheduleAI();
  }

  // ---------- host controls ----------
  on_pause(userId: string) {
    this.requireHost(userId);
    const s = this.s;
    if (s.status !== "auction" || !s.lot || s.paused) return;
    s.paused = true; s.lot.pausedLeft = Math.max(1000, s.lot.endsAt - Date.now());
    this.clearTimers(); audit(s.code, userId, "pause", { seq: s.lot.seq });
    this.news("Auction paused by host.", "system"); this.changed();
  }
  on_resume(userId: string) {
    this.requireHost(userId);
    const s = this.s;
    if (!s.paused || !s.lot) return;
    s.paused = false; s.lot.endsAt = Date.now() + (s.lot.pausedLeft || s.settings.bidTimer * 1000); delete s.lot.pausedLeft;
    audit(s.code, userId, "resume", { seq: s.lot.seq });
    this.news("Auction resumed.", "system"); this.schedule(); this.changed();
  }
  on_skip(userId: string) {
    this.requireHost(userId);
    const lot = this.s.lot;
    if (!lot || this.s.status !== "auction") return;
    if (lot.phase === "result") return this.nextLot();
    if (lot.leader && lot.phase === "bidding") { lot.endsAt = Date.now(); this.schedule(); audit(this.s.code, userId, "hammer_now", { seq: lot.seq }); return; }
    audit(this.s.code, userId, "skip", { seq: lot.seq, pid: lot.pid });
    this.unsold();
  }
  on_timerSettings(userId: string, m: any) {
    this.requireHost(userId);
    this.s.settings.bidTimer = clamp(m.bidTimer, 3, 60, this.s.settings.bidTimer);
    if (m.introTimer != null) this.s.settings.introTimer = clamp(m.introTimer, 0, 15, this.s.settings.introTimer);
    audit(this.s.code, userId, "timer", { bidTimer: this.s.settings.bidTimer, introTimer: this.s.settings.introTimer });
    this.changed();
  }
  on_undo(userId: string) {
    this.requireHost(userId);
    const s = this.s;
    const sale = [...s.sales].reverse().find((x) => x.season === s.seasonNo);
    if (!sale || s.status !== "auction") return { error: "Nothing to undo" };
    const t = this.team(sale.team)!;
    const i = t.squad.findIndex((x) => x.pid === sale.pid && x.how === sale.how);
    if (i < 0) return { error: "Sale no longer reversible (player moved)" };
    t.squad.splice(i, 1); t.purse = round2(t.purse + sale.price); if (sale.how === "rtm") t.rtmLeft++;
    s.sales = s.sales.filter((x) => x !== sale);
    const pi = s.pool.findIndex((x) => x.pid === sale.pid);
    if (pi >= 0) {
      const [item] = s.pool.splice(pi, 1); item.status = "pending";
      const cur = s.lot ? s.pool.findIndex((x) => x.pid === s.lot!.pid) : -1;
      s.pool.splice(cur + 1, 0, item);
    }
    audit(s.code, userId, "undo_sale", sale);
    this.news(`Host reversed the sale of ${this.look(sale.pid)?.name} to ${t.short} (${fmtCr(sale.price)} refunded). Logged in audit history. Player will be re-auctioned next.`, "undo", { team: t.id, pid: sale.pid });
    this.changed();
  }
  on_reauction(userId: string, m: any) {
    this.requireHost(userId);
    const s = this.s;
    const pi = s.pool.findIndex((x) => x.pid === m.pid && x.status === "unsold");
    if (pi < 0) return { error: "Player is not unsold" };
    const [item] = s.pool.splice(pi, 1); item.status = "pending";
    const cur = s.lot ? s.pool.findIndex((x) => x.pid === s.lot!.pid) : -1;
    s.pool.splice(cur + 1, 0, item);
    audit(s.code, userId, "reauction", { pid: m.pid });
    this.news(`${this.look(m.pid)?.name} will be re-auctioned next.`, "system");
    this.changed();
  }
  on_endAuction(userId: string) { this.requireHost(userId); if (this.s.status === "auction") { audit(this.s.code, userId, "end_auction", {}); this.endAuction(); } }

  endAuction() {
    const s = this.s;
    this.clearTimers();
    if (s.mode === "blind") this.revealBlind();
    s.lot = null; s.status = "post"; s.endedAt = Date.now(); s.paused = false;
    const all = s.teams.map((t) => this.tl(t));
    s.grades = {};
    for (const t of s.teams) s.grades[t.id] = auctionGrade(this.tl(t), all, this.look);
    const ratings = s.teams.map((t) => ({ t, r: teamRating(this.tl(t), this.look) }));
    const bestBat = [...ratings].sort((a, b) => b.r.batting - a.r.batting)[0];
    const bestBowl = [...ratings].sort((a, b) => b.r.bowling - a.r.bowling)[0];
    for (const t of s.teams) if (t.ownerId) {
      const g = s.grades[t.id];
      if (g.grade === "A" || g.grade === "A+") grantAchievement(t.ownerId, "smartest_auction", s.code);
      if (t.squad.length >= s.settings.squadMin && t.purse >= t.startPurse * 0.1) grantAchievement(t.ownerId, "budget_master", s.code);
      if (bestBat.t === t) grantAchievement(t.ownerId, "best_batting", s.code);
      if (bestBowl.t === t) grantAchievement(t.ownerId, "best_bowling", s.code);
      addXp(t.ownerId, 50);
    }
    const sorted = Object.entries(s.grades).sort((a: any, b: any) => b[1].score - a[1].score);
    this.news(`Auction complete. Top calculated grade: ${this.team(sorted[0][0])?.name} (${(sorted[0][1] as any).grade}).`, "system");
    audit(s.code, "system", "auction_end", { grades: Object.fromEntries(sorted.map(([k, v]: any) => [k, v.grade])) });
    this.event({ kind: "auctionEnd" });
    this.changed();
  }

  // Fill squads to minimum from unsold/remaining pool at base price (host action, logged)
  on_fillSquads(userId: string) {
    this.requireHost(userId);
    const s = this.s;
    if (s.status !== "post") return { error: "Only after the auction" };
    const owned = new Set(s.teams.flatMap((t) => t.squad.map((x) => x.pid)));
    const mf = s.settings.format || "ipl";
    const intl = mf !== "ipl";
    const needN = s.teams.reduce((a, t) => a + Math.max(0, Math.max(11, Math.min(s.settings.squadMin, 14)) - t.squad.length), 0);
    const intlCands = (cap: number, widen: boolean) => allSummaries().filter((p) => {
          if (owned.has(p.id) || p.custom) return false;
          const fp = getPlayer(p.id), f = fp?.intl?.[mf];
          if (!f || f.ratings.overall > cap) return false;
          const india = (p.country || "India") === "India";
          const k = s.settings.intlPool;
          return k === "india_now" ? india && (widen || f.active) : k === "india_all" ? india : k === "world" ? !india : true;
        });
    let ic = intl ? intlCands(66, false) : [];
    // Small pools (e.g. active India Test players): widen to all-time players, then lift the rating cap, so every side can field an XI.
    if (intl && ic.length < needN) ic = intlCands(66, true);
    let lifted = false;
    if (intl && ic.length < needN) { lifted = true; const extra = intlCands(999, true).filter((p) => !ic.includes(p)).sort((a, b) => (getPlayer(a.id)!.intl[mf].ratings.overall) - (getPlayer(b.id)!.intl[mf].ratings.overall)); ic = [...ic, ...extra.slice(0, needN - ic.length + 4)]; }
    const avail = intl
      ? ic.map((p) => { const o = intlOverride(getPlayer(p.id), mf as any); if (o) s.ratingOverrides[p.id] = o; return this.look(p.id)!; }).sort((a, b) => b.ratings.overall - a.ratings.overall)
      : allSummaries().filter((p) => !owned.has(p.id) && !p.retired && !p.intlOnly && (p.team2026 || (p.lastSeason ?? 0) >= 2024) && p.ratings.overall <= 66).sort((a, b) => b.ratings.overall - a.ratings.overall);
    const osCap = intl ? 99 : 4;
    // Replacement-level free agents only (calculated rating <= 66) so filling never hands out stars.
    const minXI = Math.max(11, Math.min(s.settings.squadMin, 14));
    let filled = 0;
    for (const t of s.teams) {
      const eligible = () => { const os = t.squad.filter((x) => this.look(x.pid)?.overseas).length; return t.squad.length - os + Math.min(os, osCap); };
      while ((t.squad.length < minXI || eligible() < 11) && t.squad.length < s.settings.squadMax) {
        const n = needs(this.tl(t), this.look, this.rules);
        const want = Object.entries(n.gaps).sort((a, b) => b[1] - a[1])[0]?.[0];
        const osNow = t.squad.filter((x) => this.look(x.pid)?.overseas).length;
        const idx = avail.findIndex((p) => (!p.overseas || (n.overseasLeft > 0 && osNow < osCap)) && (slotKey(p) === want || n.gaps[want] === 0) && Math.min(p.basePrice, 0.3) <= t.purse);
        const idx2 = idx >= 0 ? idx : avail.findIndex((p) => !p.overseas || (n.overseasLeft > 0 && osNow < osCap));
        if (idx2 < 0 || t.purse <= 0) break;
        const [p] = avail.splice(idx2, 1);
        const price = Math.min(0.3, t.purse);
        t.squad.push({ pid: p.id, price, how: "fill", season: s.seasonNo }); t.purse = round2(t.purse - price); filled++;
      }
    }
    audit(s.code, userId, "fill_squads", { filled });
    this.news(lifted
      ? `Host filled incomplete squads with ${filled} free agents at ₹30 L or less. This player pool is small, so the lowest-rated remaining players were used even above the usual rating-66 limit.`
      : `Host filled incomplete squads with ${filled} replacement-level free agents (calculated rating 66 or lower) at ₹30 L or less so every side can field a valid XI.`, "system");
    this.changed();
  }

  // ---------- lineups ----------
  validLineup(t: TeamState, l: TeamLineup): string | null {
    const ids = new Set(t.squad.map((x) => x.pid));
    if (!Array.isArray(l.xi) || l.xi.length !== 11) return "Playing XI must have exactly 11 players";
    if (new Set(l.xi).size !== 11) return "Duplicate player in XI";
    for (const p of l.xi) if (!ids.has(p)) return "XI contains a player not in your squad";
    const os = l.xi.filter((p) => this.look(p)?.overseas).length;
    const osMax = this.s.settings.format && this.s.settings.format !== "ipl" ? 11 : 4;
    if (os > osMax) return `At most ${osMax} overseas players in the XI`;
    if (l.captain && !l.xi.includes(l.captain)) return "Captain must be in the XI";
    if (l.vice && !l.xi.includes(l.vice)) return "Vice-captain must be in the XI";
    if (l.keeper && !l.xi.includes(l.keeper)) return "Wicket-keeper must be in the XI";
    if (l.captain && l.captain === l.vice) return "Captain and vice-captain must differ";
    if (l.impact && this.s.settings.format && this.s.settings.format !== "ipl") return "No Impact Player substitutions in international formats";
    if (l.impact) {
      if (!ids.has(l.impact.in) || l.xi.includes(l.impact.in)) return "Impact player must be a squad player outside the XI";
      if (!l.xi.includes(l.impact.out)) return "Impact substitution must replace an XI player";
      const osAfter = l.xi.filter((p) => p !== l.impact!.out).concat(l.impact.in).filter((p) => this.look(p)?.overseas).length;
      if (osAfter > osMax) return "Impact player would exceed the overseas limit";
    }
    const bowlers = (l.bowling || []).filter((p) => l.xi.includes(p) || p === l.impact?.in);
    if (l.bowling && bowlers.length < 5) return "Select at least 5 bowling options";
    return null;
  }
  on_lineup(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t) return { error: "No franchise" };
    const l: TeamLineup = { xi: (m.lineup?.xi || []).map(String), bowling: (m.lineup?.bowling || []).map(String), captain: m.lineup?.captain, vice: m.lineup?.vice, keeper: m.lineup?.keeper, impact: m.lineup?.impact || null, bench: m.lineup?.bench, alt: m.lineup?.alt, fielding: m.lineup?.fielding || t.lineup?.fielding };
    const err = this.validLineup(t, l);
    if (err) return { error: err };
    t.lineup = l;
    audit(this.s.code, userId, "lineup", { team: t.id });
    this.changed();
  }
  on_fielding(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t) return { error: "No franchise" };
    const f: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of Object.entries<any>(m.fielding || {}).slice(0, 11)) f[String(k).slice(0, 24)] = { x: clamp(v.x, 0, 1, 0.5), y: clamp(v.y, 0, 1, 0.5) };
    t.lineup = { ...(t.lineup || this.autoLineup(t)), fielding: f };
    this.changed();
  }
  autoLineup(t: TeamState): TeamLineup {
    const intl = !!this.s.settings.format && this.s.settings.format !== "ipl";
    const b = bestXI(t.squad.map((x) => x.pid), this.look, intl ? 11 : 4);
    const c = captainPick(b.xi, this.look);
    const bench = t.squad.map((x) => x.pid).filter((p) => !b.xi.includes(p));
    // impact player: best bench bowler replaces weakest bowling batter (lowest batting order)
    const benchBowler = bench.map((p) => this.look(p)!).filter(Boolean).sort((a, b2) => b2.ratings.bowl - a.ratings.bowl)[0];
    const outP = [...b.xi].reverse().find((p) => this.look(p)?.role === "Batter" || this.look(p)?.role === "Wicket-keeper");
    let impact: TeamLineup["impact"] = null;
    if (benchBowler && outP && !intl) {
      const osAfter = b.xi.filter((p) => p !== outP).concat(benchBowler.id).filter((p) => this.look(p)?.overseas).length;
      if (osAfter <= 4) impact = { in: benchBowler.id, out: outP };
    }
    return { xi: b.xi, bowling: b.bowling, captain: c.captain, vice: c.vice, keeper: b.xi.find((p) => this.look(p)?.role === "Wicket-keeper"), impact, bench };
  }
  lineupFor = (tid: string): Lineup => {
    const t = this.team(tid)!;
    let l = t.lineup && !this.validLineup(t, t.lineup) ? t.lineup : this.autoLineup(t);
    if (l.xi.length < 11) l = { ...l, xi: t.squad.map((x) => x.pid).slice(0, 11) };
    return { id: t.id, name: t.name, short: t.short, color: t.primary, xi: l.xi, bowling: l.bowling, captain: l.captain, keeper: l.keeper, impact: l.impact };
  };

  // ---------- season ----------
  on_startSeason(userId: string, m: any) {
    this.requireHost(userId);
    const s = this.s;
    if (s.status !== "post") return { error: "Season can start after the auction" };
    const short = s.teams.filter((t) => t.squad.length < 11);
    if (short.length) return { error: `${short.map((t) => t.short).join(", ")} have fewer than 11 players. Use "Fill squads" first.` };
    const pitch = ["balanced", "flat", "green", "dry", "slow"].includes(m.pitch) ? m.pitch : "balanced";
    const fmt = m.format === "single" ? "single" : "double";
    const mf = s.settings.format || "ipl";
    const venues: Record<string, string> = {};
    if (mf !== "ipl") {
      const V = s.settings.intlPool?.startsWith("india") ? ["Wankhede Stadium", "Eden Gardens", "M Chinnaswamy Stadium", "MA Chidambaram Stadium"] : ["Lord's", "Melbourne Cricket Ground", "Newlands", "Basin Reserve", "Galle International Stadium", "Kensington Oval"];
      s.teams.forEach((t, i) => { venues[t.id] = V[i % V.length]; });
    }
    const intl = mf !== "ipl";
    s.season = makeSeason(s.teams.map((t) => t.id), 2026 + s.seasonNo, {
      format: fmt, pitch, label: `${s.name} · ${intl ? (mf === "test" ? "Test Championship" : mf === "odi" ? "ODI Series" : "T20I Series") : `Season ${s.seasonNo}`}`,
      matchFormat: mf, venues: intl ? venues : undefined, finalVenue: intl ? (s.settings.intlPool?.startsWith("india") ? "Narendra Modi Stadium" : "Lord's") : undefined,
      playoffs: intl ? (mf === "test" || s.teams.length < 4 ? 2 : 4) : undefined,
    });
    s.status = "season";
    audit(s.code, userId, "season_start", { seasonNo: s.seasonNo, fmt, pitch });
    this.news(`Season ${s.seasonNo} begins: ${s.season.fixtures.length} league matches (${fmt === "double" ? "double" : "single"} round-robin). All match results are simulated.`, "system");
    this.changed();
  }
  playOne(userId: string) {
    const s = this.s;
    if (!s.season) return null;
    const style = (getUser(userId)?.settings && JSON.parse(getUser(userId)!.settings).commentary) || "pro";
    const r = playNext(s.code, s.seasonNo, s.season, this.lineupFor, style);
    if (r) {
      const m = r.match;
      if (r.fixture.n === 1) for (const t of s.teams) if (t.ownerId) grantAchievement(t.ownerId, "first_match", s.code);
      const w = this.team(m.winner);
      this.news(`${r.fixture.stage === "league" ? `Match ${r.fixture.n}` : r.fixture.stage}: ${m.margin}.${m.pom ? ` Player of the match ${this.look(m.pom.pid)?.name} ${m.pom.reason}.` : ""} (simulated)`, "match", { team: w?.id });
    }
    if (s.season.status === "complete") this.finishSeason();
    return r;
  }
  on_playNext(userId: string) {
    this.requireHost(userId);
    if (this.s.status !== "season") return { error: "No season running" };
    const r = this.playOne(userId);
    this.changed();
    if (r) this.event({ kind: "match", n: r.fixture.n, season: this.s.seasonNo });
  }
  on_playMany(userId: string, m: any) {
    this.requireHost(userId);
    if (this.s.status !== "season" || !this.s.season) return { error: "No season running" };
    const stage = m.until === "league" ? "league" : "all";
    let k = 0;
    while (this.s.season && this.s.season.status !== "complete" && k < 200) {
      if (stage === "league" && this.s.season.status !== "league") break;
      this.playOne(userId); k++;
      if ((this.s.status as string) !== "season") break;
    }
    this.changed();
  }
  finishSeason() {
    const s = this.s, se = s.season!;
    const champ = this.team(se.champion);
    const leaguePos = se.table.findIndex((r) => r.team === se.champion) + 1;
    s.history.push({ seasonNo: s.seasonNo, year: se.year, champion: se.champion, runnerUp: se.runnerUp, table: se.table, awards: se.awards, squads: Object.fromEntries(s.teams.map((t) => [t.id, t.squad.map((x) => x.pid)])), owners: Object.fromEntries(s.teams.map((t) => [t.id, t.ownerId])) });
    db.prepare("INSERT INTO game_records (code, season, kind, value, pid, team, owner, label, ts) VALUES (?,?,?,?,?,?,?,?,?)").run(s.code, s.seasonNo, "title", 1, null, se.champion, champ?.ownerId || null, `${champ?.name} won ${se.label}`, Date.now());
    if (champ?.ownerId) {
      grantAchievement(champ.ownerId, "champion", s.code); addXp(champ.ownerId, 200);
      if (leaguePos >= 3) grantAchievement(champ.ownerId, "comeback", s.code);
    }
    const spend = s.teams.map((t) => ({ t, spent: t.squad.reduce((a, x) => a + x.price, 0) })).sort((a, b) => a.spent - b.spent);
    const top4 = se.table.slice(0, 4).map((r) => r.team);
    const eco = spend.find((x) => top4.includes(x.t.id));
    if (eco && eco === spend[0] && eco.t.ownerId) grantAchievement(eco.t.ownerId, "economical", s.code);
    this.news(`CHAMPIONS: ${champ?.name} win the simulated ${se.label}!`, "trophy", { team: champ?.id });
    this.event({ kind: "champion", team: champ?.id });
    if (s.mode === "championship" && s.seasonNo < s.settings.seasons) {
      s.seasonNo++;
      this.beginRetention(s.settings.retainMax, "championship");
    } else {
      s.status = "complete";
    }
    audit(s.code, "system", "season_end", { champion: se.champion, seasonNo: s.seasonNo });
  }
  on_anotherSeason(userId: string) {
    this.requireHost(userId);
    if (this.s.status !== "complete") return { error: "Season still running" };
    this.s.seasonNo++; this.s.status = "post"; this.s.season = null;
    this.changed();
  }

  predict() { return this.s.season ? predictTournament(this.s.season, this.lineupFor, 30) : null; }

  // ---------- trades & marketplace ----------
  tradeWindowOpen() { const s = this.s; return s.status === "post" || s.status === "retention" || (s.status === "season" && !!s.season && s.season.status === "league"); }
  validateTrade(tr: Trade): string | null {
    const A = this.team(tr.from), B = this.team(tr.to);
    if (!A || !B || A === B) return "Invalid franchises";
    for (const p of tr.give) if (!A.squad.some((x) => x.pid === p)) return `${this.look(p)?.name || p} is not in ${A.short}`;
    for (const p of tr.get) if (!B.squad.some((x) => x.pid === p)) return `${this.look(p)?.name || p} is not in ${B.short}`;
    if (!tr.give.length && !tr.get.length) return "Trade must include at least one player";
    const cash = round2(tr.cash || 0);
    if (A.purse - cash < 0) return `${A.short} cannot afford the cash component`;
    if (B.purse + cash < 0) return `${B.short} cannot afford the cash component`;
    const sizeA = A.squad.length - tr.give.length + tr.get.length, sizeB = B.squad.length - tr.get.length + tr.give.length;
    const mx = this.s.settings.squadMax;
    if (sizeA > mx || sizeB > mx) return `Squad would exceed ${mx}`;
    const os = (t: TeamState, out: string[], inn: string[]) => t.squad.filter((x) => !out.includes(x.pid)).map((x) => x.pid).concat(inn).filter((p) => this.look(p)?.overseas).length;
    if (os(A, tr.give, tr.get) > this.s.settings.overseasMax || os(B, tr.get, tr.give) > this.s.settings.overseasMax) return "Overseas limit exceeded";
    if (sizeA < 11 || sizeB < 11) return "Both squads must keep at least 11 players";
    return null;
  }
  on_proposeTrade(userId: string, m: any) {
    const A = this.teamOf(userId);
    if (!A) return { error: "No franchise" };
    if (!this.tradeWindowOpen()) return { error: "Trade window is closed (open after auction, between seasons and during the league stage)" };
    const tr: Trade = { id: uid(8), from: A.id, to: String(m.to), give: (m.give || []).map(String), get: (m.get || []).map(String), cash: round2(Number(m.cash) || 0), status: "pending", ts: Date.now() };
    const err = this.validateTrade(tr);
    if (err) return { error: err };
    this.s.trades.push(tr);
    audit(this.s.code, userId, "trade_propose", tr);
    const B = this.team(tr.to)!;
    if (!B.ownerId) {
      // AI evaluation: accept if calculated value gained exceeds value lost by 5% (cash counted at face value)
      const val = (ids: string[]) => ids.reduce((a, p) => a + fairValue(this.look(p)?.ratings.overall || 40, this.s.settings.purse), 0);
      const gain = val(tr.give) + tr.cash, loss = val(tr.get);
      const ok = gain >= loss * 1.05;
      tr.note = `AI valuation: receives ${gain.toFixed(2)} cr of calculated value, gives ${loss.toFixed(2)} cr.`;
      this.respondTrade(tr, ok, "ai");
    } else this.news(`Trade offer: ${A.short} → ${B.short}.`, "trade");
    this.changed();
  }
  on_respondTrade(userId: string, m: any) {
    const tr = this.s.trades.find((x) => x.id === m.id);
    if (!tr || tr.status !== "pending") return { error: "Trade not pending" };
    const me = this.teamOf(userId);
    if (m.cancel) { if (me?.id !== tr.from) return { error: "Not your offer" }; tr.status = "cancelled"; this.changed(); return; }
    if (me?.id !== tr.to) return { error: "Not your decision" };
    return this.respondTrade(tr, !!m.accept, userId);
  }
  respondTrade(tr: Trade, accept: boolean, actor: string) {
    if (!accept) { tr.status = "rejected"; audit(this.s.code, actor, "trade_reject", tr); this.changed(); return {}; }
    const err = this.validateTrade(tr);
    if (err) { tr.status = "rejected"; tr.note = (tr.note ? tr.note + " " : "") + "Failed validation at commit: " + err; this.changed(); return { error: err }; }
    const A = this.team(tr.from)!, B = this.team(tr.to)!;
    const move = (from: TeamState, to: TeamState, ids: string[]) => {
      for (const p of ids) { const i = from.squad.findIndex((x) => x.pid === p); const [it] = from.squad.splice(i, 1); to.squad.push({ ...it, how: "trade" }); from.listed = from.listed.filter((x) => x.pid !== p); }
    };
    move(A, B, tr.give); move(B, A, tr.get);
    A.purse = round2(A.purse - tr.cash); B.purse = round2(B.purse + tr.cash);
    A.lineup = null; B.lineup = null;
    tr.status = "accepted";
    audit(this.s.code, actor, "trade_accept", tr);
    const names = (ids: string[]) => ids.map((p) => this.look(p)?.name).join(", ") || "—";
    this.news(`TRADE: ${A.short} receive ${names(tr.get)}${tr.cash < 0 ? ` + ${fmtCr(-tr.cash)}` : ""}; ${B.short} receive ${names(tr.give)}${tr.cash > 0 ? ` + ${fmtCr(tr.cash)}` : ""}.`, "trade");
    for (const t of [A, B]) if (t.ownerId) grantAchievement(t.ownerId, "trader", this.s.code);
    this.changed();
    return {};
  }
  on_list(userId: string, m: any) {
    const t = this.teamOf(userId);
    if (!t) return { error: "No franchise" };
    if (!t.squad.some((x) => x.pid === m.pid)) return { error: "Not your player" };
    t.listed = t.listed.filter((x) => x.pid !== m.pid);
    if (m.ask != null) t.listed.push({ pid: m.pid, ask: round2(clamp(m.ask, 0.2, 50, 1)) });
    this.changed();
  }
  on_buyListed(userId: string, m: any) {
    const A = this.teamOf(userId);
    const B = this.s.teams.find((t) => t.listed.some((x) => x.pid === m.pid));
    if (!A || !B) return { error: "Listing not found" };
    const l = B.listed.find((x) => x.pid === m.pid)!;
    return this.on_proposeTrade(userId, { to: B.id, give: [], get: [m.pid], cash: l.ask });
  }

  // ---------- recovery ----------
  recover() {
    const s = this.s;
    if (s.status === "auction" && s.lot) {
      if (!s.paused) {
        // Server restarted: give everyone a fresh clock on the current lot (logged).
        s.lot.endsAt = Date.now() + Math.max(5000, s.settings.bidTimer * 1000);
        audit(s.code, "system", "recovered", { seq: s.lot.seq, phase: s.lot.phase });
        this.news("Server recovered this auction. The current lot clock has been reset.", "system");
      }
      this.schedule();
    }
  }
}

export function ownerStats(userId: string) {
  let rooms = 0, titles = 0, buys = 0, spent = 0, grades: string[] = [];
  for (const r of allRooms()) {
    const t = r.s.teams.find((x) => x.ownerId === userId);
    if (!t) continue;
    rooms++;
    titles += r.s.history.filter((h) => h.champion === t.id && h.owners?.[t.id] === userId).length;
    const mine = r.s.sales.filter((x) => x.team === t.id);
    buys += mine.length; spent += mine.reduce((a, x) => a + x.price, 0);
    if (r.s.grades?.[t.id]) grades.push(r.s.grades[t.id].grade);
  }
  return { rooms, titles, buys, spent: round2(spent), grades };
}
void composition;
