import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import crypto from "node:crypto";
import {
  db, uid, hashPass, publicUser, getUser, userByToken, issueToken, ACHIEVEMENTS, grantAchievement, audit, levelOf, type UserRow,
} from "./db";
import { allSummaries, getPlayer, getSummary, playerDetail, rebuild, DATA_META, BASELINE, MINI_2026_PURSE, MINI_2026_SOURCE, HALL_OF_FAME } from "./data";
import { createRoom, getRoom, listPublicRooms, roomsForUser, loadRooms, allRooms, ownerStats, Room } from "./auction";
import { attachWS } from "./ws";
import { getMatch, makeSeason, playNext, hash } from "./tournament";
import { simulateMatch, quickPredict, clearSimCache, type Lineup } from "./sim";
import { FRANCHISES, FRANCHISE_BY_ID, MODES, RULESETS, AI_PERSONALITIES, COMMENTARY_STYLES, PITCHES, ageOn, round2, type PlayerSummary } from "@shared/game";
import { teamRating, bestXI, captainPick, needs, auctionGrade, ownerProfile, fairValue, composition, potential, type TeamLike } from "@shared/analytics";

type AuthedReq = Request & { user?: UserRow };

function auth(req: AuthedReq) {
  const h = req.headers.authorization;
  const tok = h?.startsWith("Bearer ") ? h.slice(7) : undefined;
  let u = userByToken(tok);
  const visitor = req.headers["x-visitor-id"] as string | undefined;
  if (!u && visitor) {
    const v = db.prepare("SELECT user_id FROM visitors WHERE visitor=?").get(visitor) as { user_id: string } | undefined;
    if (v) u = getUser(v.user_id);
  }
  return u;
}
function need(req: AuthedReq, res: Response): UserRow | null {
  const u = auth(req);
  if (!u) { res.status(401).json({ message: "Sign in first" }); return null; }
  return u;
}
function remember(req: Request, userId: string) {
  const visitor = req.headers["x-visitor-id"] as string | undefined;
  if (visitor) db.prepare("INSERT OR REPLACE INTO visitors (visitor, user_id) VALUES (?,?)").run(visitor, userId);
}
const clean = (s: any, n = 40) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

const realLineup = (team: string): Lineup => {
  const ids = allSummaries().filter((p) => p.team2026 === team).map((p) => p.id);
  const b = bestXI(ids, getSummary, 4);
  const f = FRANCHISE_BY_ID[team];
  return { id: team, name: f.name, short: f.short, color: f.primary, xi: b.xi, bowling: b.bowling, keeper: b.xi.find((p) => getSummary(p)?.role === "Wicket-keeper") };
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const n = loadRooms();
  console.log(`recovered ${n} rooms`);
  attachWS(httpServer);

  // ------------- auth -------------
  app.get("/api/me", (req: AuthedReq, res) => {
    const u = auth(req);
    if (!u) return res.json({ user: null });
    const visitor = req.headers["x-visitor-id"];
    const token = (req.headers.authorization || "").replace("Bearer ", "") || (visitor ? issueToken(u.id) : null);
    res.json({ user: { ...publicUser(u), settings: JSON.parse(u.settings || "{}"), privacy: u.privacy }, token });
  });
  app.post("/api/auth/guest", (req, res) => {
    const name = clean(req.body?.name, 20) || `Owner${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!/^[\w .-]{2,20}$/.test(name)) return res.status(400).json({ message: "Name: 2-20 letters, numbers, spaces, . - _" });
    let username = name;
    let k = 1;
    while (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) username = `${name}${++k}`;
    const id = uid(12), salt = uid(8);
    db.prepare("INSERT INTO users (id, username, pass, salt, created, guest) VALUES (?,?,?,?,?,1)").run(id, username, hashPass(uid(16), salt), salt, Date.now());
    remember(req, id);
    const u = getUser(id)!;
    res.json({ user: { ...publicUser(u), settings: {}, privacy: u.privacy }, token: issueToken(id) });
  });
  app.post("/api/auth/register", (req: AuthedReq, res) => {
    const username = clean(req.body?.username, 20), password = String(req.body?.password || "");
    if (!/^[\w.-]{3,20}$/.test(username)) return res.status(400).json({ message: "Username: 3-20 letters, numbers, . - _" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    const existing = db.prepare("SELECT id FROM users WHERE username=?").get(username) as any;
    const cur = auth(req);
    const salt = uid(8);
    if (cur && cur.guest) {
      if (existing && existing.id !== cur.id) return res.status(409).json({ message: "Username taken" });
      db.prepare("UPDATE users SET username=?, pass=?, salt=?, guest=0 WHERE id=?").run(username, hashPass(password, salt), salt, cur.id);
      const u = getUser(cur.id)!;
      return res.json({ user: { ...publicUser(u), settings: JSON.parse(u.settings), privacy: u.privacy }, token: issueToken(u.id) });
    }
    if (existing) return res.status(409).json({ message: "Username taken" });
    const id = uid(12);
    db.prepare("INSERT INTO users (id, username, pass, salt, created) VALUES (?,?,?,?,?)").run(id, username, hashPass(password, salt), salt, Date.now());
    remember(req, id);
    const u = getUser(id)!;
    res.json({ user: { ...publicUser(u), settings: {}, privacy: u.privacy }, token: issueToken(id) });
  });
  app.post("/api/auth/login", (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE username=? AND guest=0").get(clean(req.body?.username, 20)) as UserRow & { pass: string; salt: string } | undefined;
    if (!u || !crypto.timingSafeEqual(Buffer.from(hashPass(String(req.body?.password || ""), u.salt), "hex"), Buffer.from(u.pass, "hex"))) return res.status(401).json({ message: "Wrong username or password" });
    remember(req, u.id);
    res.json({ user: { ...publicUser(u), settings: JSON.parse(u.settings), privacy: u.privacy }, token: issueToken(u.id) });
  });
  app.post("/api/auth/logout", (req, res) => {
    const visitor = req.headers["x-visitor-id"] as string | undefined;
    if (visitor) db.prepare("DELETE FROM visitors WHERE visitor=?").run(visitor);
    const h = req.headers.authorization; if (h) db.prepare("DELETE FROM tokens WHERE token=?").run(h.replace("Bearer ", ""));
    res.json({ ok: true });
  });
  app.patch("/api/me", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const b = req.body || {};
    if (b.bio != null) db.prepare("UPDATE users SET bio=? WHERE id=?").run(clean(b.bio, 200), u.id);
    if (b.avatar != null) db.prepare("UPDATE users SET avatar=? WHERE id=?").run(clean(b.avatar, 300), u.id);
    if (b.privacy && ["public", "friends", "private"].includes(b.privacy)) db.prepare("UPDATE users SET privacy=? WHERE id=?").run(b.privacy, u.id);
    if (b.settings && typeof b.settings === "object") db.prepare("UPDATE users SET settings=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(u.settings || "{}"), ...b.settings }).slice(0, 4000), u.id);
    const nu = getUser(u.id)!;
    res.json({ user: { ...publicUser(nu), settings: JSON.parse(nu.settings), privacy: nu.privacy } });
  });

  // ------------- meta & players -------------
  app.get("/api/halloffame", (_req, res) => res.json(HALL_OF_FAME));
  app.get("/api/meta", (_req, res) => {
    res.json({ data: DATA_META, franchises: FRANCHISES, modes: MODES, rulesets: RULESETS, personalities: AI_PERSONALITIES, commentary: COMMENTARY_STYLES, pitches: PITCHES, mini2026: { purses: MINI_2026_PURSE, source: MINI_2026_SOURCE }, venues: BASELINE.venueFirstInnings, achievements: ACHIEVEMENTS });
  });
  app.get("/api/players", (_req, res) => { res.set("Cache-Control", "no-store"); res.json(allSummaries()); });
  app.get("/api/players/duplicates", (_req, res) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const map = new Map<string, PlayerSummary[]>();
    for (const p of allSummaries()) { const k = norm(p.name); map.set(k, [...(map.get(k) || []), p]); }
    const dobMap = new Map<string, PlayerSummary[]>();
    for (const p of allSummaries()) if (p.dob) { const k = p.dob + norm(p.name.split(" ").slice(-1)[0]); dobMap.set(k, [...(dobMap.get(k) || []), p]); }
    const groups = [...map.values(), ...dobMap.values()].filter((g) => g.length > 1).map((g) => g.map((p) => ({ id: p.id, name: p.name, dob: p.dob, country: p.country, custom: p.custom, matches: p.matches })));
    const seen = new Set<string>();
    res.json(groups.filter((g) => { const k = g.map((x) => x.id).sort().join(","); if (seen.has(k)) return false; seen.add(k); return true; }));
  });
  app.get("/api/players/export", (req, res) => {
    const fmt = req.query.format === "csv" ? "csv" : "json";
    const list = allSummaries();
    if (fmt === "json") { res.setHeader("Content-Disposition", "attachment; filename=ipl-arena-players.json"); return res.json({ meta: DATA_META, players: list }); }
    const cols = ["id", "name", "country", "role", "bowlType", "batting", "bowling", "capped", "overseas", "dob", "matches", "runs", "wkts", "sr", "avg", "econ", "basePrice", "team2026", "price2026"];
    const esc = (v: any) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", "attachment; filename=ipl-arena-players.csv");
    res.send([cols.join(","), ...list.map((p: any) => cols.map((c) => esc(p[c])).join(","))].join("\n"));
  });
  app.get("/api/players/:id", (req, res) => {
    const d = playerDetail((req.params.id as string));
    if (!d) return res.status(404).json({ message: "Player not found" });
    const edits = db.prepare("SELECT data, updated, by FROM player_overrides WHERE pid=?").get((req.params.id as string)) as any;
    const ip: any = (d as any).ipl || {};
    const splits = Object.fromEntries(["phaseBat", "phaseBowl", "venue", "vs", "chase", "home", "away", "recentScores", "recentBowl", "vsPaceSpin"].map((k) => [k, ip[k] ?? null]));
    res.json({ ...splits, ...d, potential: potential(d.summary), fairValue: fairValue(d.summary.ratings.overall), edits: edits ? { ...edits, data: JSON.parse(edits.data), by: getUser(edits.by)?.username } : null });
  });
  const EDITABLE = ["name", "fullName", "country", "role", "batting", "bowling", "bowlType", "capped", "overseas", "dob", "basePrice", "customPhoto"];
  function validateEdit(b: any) {
    const out: any = {};
    for (const k of EDITABLE) if (b[k] !== undefined) out[k] = b[k];
    if (out.role && !["Batter", "Bowler", "All-rounder", "Wicket-keeper"].includes(out.role)) throw new Error("Invalid role");
    if (out.bowlType && !["Pace", "Spin", null].includes(out.bowlType)) throw new Error("Invalid bowling type");
    if (out.dob && !/^\d{4}-\d{2}-\d{2}$/.test(out.dob)) throw new Error("DOB must be YYYY-MM-DD");
    if (out.basePrice != null) { const v = Number(out.basePrice); if (!(v >= 0.2 && v <= 2)) throw new Error("Base price must be ₹20 L to ₹2 cr"); out.basePrice = round2(v); }
    if (out.customPhoto != null && out.customPhoto !== "" && !/^https:\/\/[^\s"'<>]+$/.test(out.customPhoto) && !/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(out.customPhoto)) throw new Error("Photo must be an https URL or uploaded image");
    if (out.customPhoto && out.customPhoto.length > 400000) throw new Error("Photo too large (max ~300 KB)");
    if (out.customPhoto === "") out.customPhoto = null;
    for (const k of ["name", "fullName", "country", "batting", "bowling"]) if (out[k] != null) out[k] = clean(out[k], 60);
    if (out.capped != null) out.capped = !!out.capped;
    if (out.overseas != null) out.overseas = !!out.overseas;
    return out;
  }
  app.patch("/api/players/:id", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    if (!getPlayer((req.params.id as string))) return res.status(404).json({ message: "Player not found" });
    try {
      const patch = validateEdit(req.body || {});
      const prev = db.prepare("SELECT data, by FROM player_overrides WHERE pid=?").get((req.params.id as string)) as any;
      if (prev && prev.by && prev.by !== u.id) return res.status(403).json({ message: "Another user has already edited this player. Only they can change or revert those edits." });
      const merged = { ...(prev ? JSON.parse(prev.data) : {}), ...patch };
      db.prepare("INSERT OR REPLACE INTO player_overrides (pid, data, updated, by) VALUES (?,?,?,?)").run((req.params.id as string), JSON.stringify(merged), Date.now(), u.id);
      audit("players", u.id, "edit_player", { pid: (req.params.id as string), patch: { ...patch, customPhoto: patch.customPhoto ? "(photo)" : patch.customPhoto } });
      rebuild(); clearSimCache();
      res.json(getSummary((req.params.id as string)));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/players/:id/edits", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const prev = db.prepare("SELECT by FROM player_overrides WHERE pid=?").get((req.params.id as string)) as any;
    if (prev && prev.by && prev.by !== u.id) return res.status(403).json({ message: "Only the user who made these edits can revert them" });
    db.prepare("DELETE FROM player_overrides WHERE pid=?").run((req.params.id as string));
    audit("players", u.id, "revert_player", { pid: (req.params.id as string) });
    rebuild(); res.json(getSummary((req.params.id as string)));
  });
  app.post("/api/players/import", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const { format, text } = req.body || {};
    if (typeof text !== "string" || text.length > 2_000_000) return res.status(400).json({ message: "Provide file text under 2 MB" });
    let rows: any[] = [];
    try {
      if (format === "json") { const j = JSON.parse(text); rows = Array.isArray(j) ? j : j.players || []; }
      else {
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const parse = (l: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
        const head = parse(lines[0]).map((h) => h.trim());
        rows = lines.slice(1).map((l) => { const v = parse(l); return Object.fromEntries(head.map((h, i) => [h, v[i]])); });
      }
    } catch { return res.status(400).json({ message: "Could not parse file" }); }
    const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    const existing = new Map(allSummaries().map((p) => [norm(p.name), p]));
    const report = { created: 0, updated: 0, duplicates: [] as string[], errors: [] as string[] };
    const ins = db.prepare("INSERT INTO custom_players (pid, data, created, by) VALUES (?,?,?,?)");
    for (const [i, r] of rows.slice(0, 2000).entries()) {
      try {
        const name = clean(r.name, 60);
        if (!name) throw new Error("missing name");
        const bool = (v: any) => v === true || v === 1 || /^(true|yes|1|y)$/i.test(String(v));
        const role = ["Batter", "Bowler", "All-rounder", "Wicket-keeper"].find((x) => norm(x) === norm(r.role)) || "Batter";
        const dup = (r.id && getPlayer(String(r.id))) ? getSummary(String(r.id)) : existing.get(norm(name));
        if (dup && !dup.custom) {
          // matched an existing real player: only allow editable fields as override, never stats
          const patch = validateEdit({ ...r, name: undefined, capped: r.capped != null ? bool(r.capped) : undefined, overseas: r.overseas != null ? bool(r.overseas) : undefined, basePrice: r.basePrice ? Number(r.basePrice) : undefined });
          if (Object.keys(patch).length) {
            const prev = db.prepare("SELECT data FROM player_overrides WHERE pid=?").get(dup.id) as any;
            db.prepare("INSERT OR REPLACE INTO player_overrides (pid, data, updated, by) VALUES (?,?,?,?)").run(dup.id, JSON.stringify({ ...(prev ? JSON.parse(prev.data) : {}), ...patch }), Date.now(), u.id);
            report.updated++;
          } else report.duplicates.push(`${name} (matches ${dup.name})`);
          continue;
        }
        if (dup) { report.duplicates.push(`${name} (already imported)`); continue; }
        const bat = Math.max(20, Math.min(95, Number(r.batRating) || (role === "Bowler" ? 30 : 55)));
        const bowl = Math.max(20, Math.min(95, Number(r.bowlRating) || (role === "Bowler" ? 58 : role === "All-rounder" ? 52 : 25)));
        const overall = role === "Batter" || role === "Wicket-keeper" ? bat : role === "Bowler" ? bowl : 0.62 * Math.max(bat, bowl) + 0.38 * Math.min(bat, bowl);
        const data = {
          name, fullName: clean(r.fullName || name, 60), country: clean(r.country || "India", 40), role, bowlType: /spin/i.test(r.bowlType || r.bowling || "") ? "Spin" : role === "Batter" || role === "Wicket-keeper" ? null : "Pace",
          batting: clean(r.batting, 30) || null, bowling: clean(r.bowling, 40) || null, capped: bool(r.capped), overseas: r.overseas != null ? bool(r.overseas) : clean(r.country || "India") !== "India",
          dob: /^\d{4}-\d{2}-\d{2}$/.test(r.dob || "") ? r.dob : null, basePrice: Math.max(0.2, Math.min(2, Number(r.basePrice) || 0.3)),
          ratings: { bat, bowl, overall: Math.round(overall * 10) / 10, limited: true }, provenance: `Imported by ${u.username} on ${new Date().toISOString().slice(0, 10)} (user-supplied ratings, no verified stats)`,
          customPhoto: /^https:\/\//.test(r.photo || "") ? r.photo : null,
        };
        const pid = "c-" + uid(8);
        ins.run(pid, JSON.stringify(data), Date.now(), u.id);
        existing.set(norm(name), { ...(data as any), id: pid, custom: true });
        report.created++;
      } catch (e: any) { report.errors.push(`Row ${i + 2}: ${e.message}`); }
    }
    audit("players", u.id, "import", { format, ...report, duplicates: report.duplicates.length, errors: report.errors.length });
    rebuild(); clearSimCache();
    res.json(report);
  });
  app.delete("/api/players/:id", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const own = db.prepare("SELECT by FROM custom_players WHERE pid=?").get((req.params.id as string)) as any;
    if (own && own.by && own.by !== u.id) return res.status(403).json({ message: "Only the user who imported this player can delete them" });
    const r = db.prepare("DELETE FROM custom_players WHERE pid=?").run((req.params.id as string));
    if (!r.changes) return res.status(400).json({ message: "Only imported custom players can be deleted" });
    rebuild(); res.json({ ok: true });
  });

  // ------------- rooms -------------
  app.post("/api/rooms", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const mode = MODES.find((m) => m.id === req.body?.mode)?.id;
    if (!mode) return res.status(400).json({ message: "Unknown mode" });
    const r = createRoom(u.id, mode, req.body?.settings || {}, clean(req.body?.name, 60) || undefined, req.body?.universe === "real2026" ? "real2026" : "auction");
    if (req.body?.team) r.handle(u.id, { type: "pickTeam", teamId: req.body.team });
    res.json({ code: r.s.code });
  });
  app.get("/api/rooms/public", (_req, res) => res.json(listPublicRooms()));
  app.get("/api/rooms/mine", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; res.json(roomsForUser(u.id)); });
  const roomOr404 = (req: Request, res: Response): Room | null => { const r = getRoom((req.params.code as string)); if (!r) { res.status(404).json({ message: "Room not found" }); return null; } return r; };
  app.get("/api/rooms/:code", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; const r = roomOr404(req, res); if (!r) return; r.join(u.id); res.json(r.view(u.id)); });
  app.post("/api/rooms/:code/action", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return; const r = roomOr404(req, res); if (!r) return;
    r.join(u.id);
    const out = r.handle(u.id, req.body || {});
    if (!out.ok) return res.status(400).json({ message: out.error });
    res.json({ ok: true });
  });
  app.get("/api/rooms/:code/audit", (req: AuthedReq, res) => {
    const r = roomOr404(req, res); if (!r) return;
    const rows = db.prepare("SELECT ts, actor, action, data FROM audit WHERE code=? ORDER BY id DESC LIMIT 300").all(r.s.code) as any[];
    const blind = r.s.mode === "blind" && r.s.status === "auction";
    res.json(rows.map((x) => ({ ...x, actor: x.actor.startsWith("ai:") || x.actor === "system" ? x.actor : getUser(x.actor)?.username || x.actor, data: blind && ["sold"].includes(x.action) ? "(sealed)" : JSON.parse(x.data) })));
  });
  app.get("/api/rooms/:code/match/:season/:n", (req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    const m = getMatch(r.s.code, +(req.params.season as string), +(req.params.n as string));
    if (!m) return res.status(404).json({ message: "Match not played yet" });
    res.json(m);
  });
  app.get("/api/rooms/:code/predict", (req, res) => { const r = roomOr404(req, res); if (!r) return; res.json({ kind: "model prediction", note: "Monte-Carlo estimate from simulated head-to-heads. Not a guaranteed outcome.", table: r.predict() }); });

  function analysis(r: Room, tid: string) {
    const t = r.team(tid)!;
    const tl = r.tl(t);
    const all = r.s.teams.map((x) => r.tl(x));
    const rating = teamRating(tl, r.look);
    const comp = composition(tl, r.look);
    const nd = needs(tl, r.look, r.rules);
    const xi = bestXI(t.squad.map((x) => x.pid), r.look, 4);
    const cap = captainPick(xi.xi, r.look);
    const grade = auctionGrade(tl, all, r.look);
    const rivals = r.s.teams.filter((x) => x.id !== tid).map((x) => ({ id: x.id, short: x.short, rating: teamRating(r.tl(x), r.look).overall, purse: r.s.mode === "blind" && r.s.status === "auction" ? null : x.purse, squad: x.squad.length }));
    const value = t.squad.map((s) => { const p = r.look(s.pid)!; const fv = fairValue(p.ratings.overall, r.s.settings.purse); return { pid: s.pid, name: p.name, price: s.price, fair: fv, ratio: s.price ? round2(fv / s.price) : null, how: s.how }; }).sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
    const weak: string[] = [];
    if (rating.spin < 55) weak.push(`Spin: best spin options average ${rating.spin} (calculated). Target a front-line spinner.`);
    if (rating.pace < 55) weak.push(`Pace: pace attack averages ${rating.pace}. A death-overs specialist would help.`);
    if (rating.keeping < 50) weak.push(`Keeping: no strong wicket-keeper batter (${rating.keeping}).`);
    if (rating.batting < 60) weak.push(`Top-order batting averages ${rating.batting}.`);
    if (comp.overseas < 4) weak.push(`Only ${comp.overseas} overseas players; XI may not use all 4 overseas slots.`);
    if (rating.bench < 45) weak.push(`Thin bench (${rating.bench}); injuries would expose the XI.`);
    const combos = [
      { label: "Batting-heavy (6 batters, 5 bowlers)", xi: xi.xi },
      { label: "Extra bowler (7 bowling options)", xi: bestXI(t.squad.map((x) => x.pid).sort((a, b) => (r.look(b)?.ratings.bowl || 0) - (r.look(a)?.ratings.bowl || 0)), r.look, 4).xi },
    ];
    const profile = ownerProfile(tid, r.s.bidLog, r.s.sales.filter((x) => x.team !== "?").map((x) => ({ team: x.team, pid: x.pid, price: x.price, base: x.base })), r.look, r.s.settings.purse);
    return {
      kinds: { rating: "calculated metric", grade: "calculated metric", predictions: "model prediction" },
      rating, composition: comp, needs: nd, xi, captain: cap, grade, rivals, value, weaknesses: weak, combos, profile,
      explanation: `Ratings combine historical IPL data (Cricsheet, 2008-2026) into calculated scores. Batting uses the top 7 batters of the auto-selected XI; bowling uses the best 5 bowling options; financial efficiency compares spend against calculated fair values.`,
    };
  }
  app.get("/api/rooms/:code/analysis/:team", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return; const r = roomOr404(req, res); if (!r) return;
    const t = r.team((req.params.team as string)); if (!t) return res.status(404).json({ message: "No team" });
    const mine = r.teamOf(u.id)?.id === t.id;
    if (r.s.mode === "blind" && r.s.status === "auction" && !mine) return res.status(403).json({ message: "Rival squads are sealed until revealed in a Blind Auction" });
    res.json(analysis(r, t.id));
  });
  app.get("/api/rooms/:code/rankings", (req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    if (r.s.mode === "blind" && r.s.status === "auction") return res.status(403).json({ message: "Power rankings unlock when the blind auction ends" });
    const se = r.s.season;
    const out = r.s.teams.map((t) => {
      const rt = teamRating(r.tl(t), r.look);
      const row = se?.table.find((x) => x.team === t.id);
      const form = row && row.p ? Math.max(0, Math.min(100, 50 + (row.w - row.l) * 6 + row.nrr * 10 + row.form.slice(-3).filter((f) => f === "W").length * 5)) : null;
      const components = { batting: rt.batting, bowling: rt.bowling, allround: rt.allround, bench: rt.bench, balance: rt.overseasBalance, versatility: rt.versatility, financial: rt.financial, form };
      const score = form == null ? rt.overall : Math.round((rt.overall * 0.7 + form * 0.3) * 10) / 10;
      return { team: t.id, name: t.name, short: t.short, score, components, strengths: rt.strengths, weaknesses: rt.weaknesses, explanation: `${t.short}: squad rating ${rt.overall}${form != null ? `, season form ${form.toFixed(0)} (${row!.w}-${row!.l}, NRR ${row!.nrr})` : ""}. ${rt.strengths.length ? "Leads on " + rt.strengths.join(", ") + "." : ""} ${rt.weaknesses.length ? "Concern: " + rt.weaknesses.join(", ") + "." : ""}` };
    }).sort((a, b) => b.score - a.score);
    res.json({ kind: "calculated metric", rankings: out });
  });
  app.post("/api/rooms/:code/whatif", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return; const r = roomOr404(req, res); if (!r) return;
    const moves = (req.body?.moves || []).slice(0, 10) as { pid: string; to: string | null; price?: number }[];
    // Work on a deep clone: actual room history is never modified
    const teams: TeamLike[] = JSON.parse(JSON.stringify(r.s.teams.map((t) => r.tl(t))));
    const log: string[] = [];
    for (const m of moves) {
      const from = teams.find((t) => t.squad.some((x) => x.pid === m.pid));
      const to = teams.find((t) => t.id === m.to);
      const price = round2(Number(m.price) || from?.squad.find((x) => x.pid === m.pid)?.price || getSummary(m.pid)?.basePrice || 0.3);
      if (from) { const s = from.squad.find((x) => x.pid === m.pid)!; from.squad = from.squad.filter((x) => x.pid !== m.pid); from.purse += s.price; }
      if (to) { to.squad.push({ pid: m.pid, price, how: "whatif" }); to.purse -= price; }
      log.push(`${getSummary(m.pid)?.name}: ${from?.id || "pool"} → ${to?.id || "released"} at ${price} cr`);
    }
    const before = r.s.teams.map((t) => ({ team: t.id, rating: teamRating(r.tl(t), r.look).overall }));
    const after = teams.map((t) => ({ team: t.id, rating: teamRating(t, r.look).overall, purse: round2(t.purse) }));
    const affected = new Set(moves.flatMap((m) => [m.to, r.owned(m.pid)?.id]).filter(Boolean) as string[]);
    const lineup = (t: TeamLike): Lineup => { const b = bestXI(t.squad.map((x) => x.pid), r.look, r.s.settings.format && r.s.settings.format !== "ipl" ? 11 : 4); const T = r.team(t.id)!; return { id: t.id, name: T.name, short: T.short, xi: b.xi, bowling: b.bowling }; };
    const h2h: any[] = [];
    const aff = [...affected].slice(0, 2);
    for (const a of aff) for (const t of teams) if (t.id !== a && t.squad.length >= 11) {
      const A = teams.find((x) => x.id === a)!;
      if (A.squad.length < 11) continue;
      const qf = { format: r.s.settings.format || "ipl" } as any;
      const p = quickPredict(lineup(A), lineup(t), 30, qf);
      const p0 = r.team(a)!.squad.length >= 11 && r.team(t.id)!.squad.length >= 11 ? quickPredict(r.lineupFor(a), r.lineupFor(t.id), 30, qf) : null;
      h2h.push({ team: a, vs: t.id, winAfter: Math.round(p.aWin * 100), winBefore: p0 ? Math.round(p0.aWin * 100) : null });
    }
    const out = { kind: "simulated scenario", note: "What-If results are a sandbox copy. The real auction and tournament history are unchanged.", moves: log, before, after, h2h };
    db.prepare("INSERT INTO scenarios (user_id, code, data, created) VALUES (?,?,?,?)").run(u.id, r.s.code, JSON.stringify({ label: clean(req.body?.label, 60) || log.join("; ").slice(0, 60), ...out }), Date.now());
    res.json(out);
  });
  app.get("/api/scenarios", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; res.json((db.prepare("SELECT id, code, data, created FROM scenarios WHERE user_id=? ORDER BY id DESC LIMIT 50").all(u.id) as any[]).map((x) => ({ ...x, data: JSON.parse(x.data) }))); });

  // ------------- exhibition simulation -------------
  function lineupFrom(src: any): Lineup | null {
    if (!src) return null;
    if (src.kind === "real2026" && FRANCHISE_BY_ID[src.team]) return realLineup(src.team);
    if (src.kind === "room") { const r = getRoom(src.code); const t = r?.team(src.team); if (r && t && t.squad.length >= 11) return r.lineupFor(t.id); }
    if (src.kind === "custom" && Array.isArray(src.xi) && src.xi.length === 11 && src.xi.every((p: string) => getSummary(p))) {
      const b = bestXI(src.xi, getSummary, 11);
      return { id: clean(src.id || "XI", 8), name: clean(src.name || "Custom XI"), short: clean(src.short || "XI", 5), xi: b.xi, bowling: b.bowling, color: src.color };
    }
    return null;
  }
  app.post("/api/sim/match", (req, res) => {
    const A = lineupFrom(req.body?.a), B = lineupFrom(req.body?.b);
    if (!A || !B) return res.status(400).json({ message: "Pick two valid teams with at least 11 players" });
    if (A.id === B.id) B.id = B.id + "2";
    const style = (Object.keys(COMMENTARY_STYLES) as any[]).includes(req.body?.style) ? req.body.style : "pro";
    const pitch = Object.keys(PITCHES).includes(req.body?.pitch) ? req.body.pitch : "balanced";
    const format = ["ipl", "t20i", "odi", "test"].includes(req.body?.format) ? req.body.format : "ipl";
    const m = simulateMatch(A, B, { venue: req.body?.venue, pitch, style, seed: req.body?.seed, format });
    const u = auth(req as AuthedReq); if (u) grantAchievement(u.id, "first_match");
    res.json(m);
  });
  app.post("/api/sim/predict", (req, res) => {
    const A = lineupFrom(req.body?.a), B = lineupFrom(req.body?.b);
    if (!A || !B) return res.status(400).json({ message: "Pick two valid teams" });
    if (A.id === B.id) B.id = B.id + "2";
    const format = ["ipl", "t20i", "odi", "test"].includes(req.body?.format) ? req.body.format : "ipl";
    const p = quickPredict(A, B, 120, { venue: req.body?.venue, pitch: req.body?.pitch, format });
    const ra = teamRating({ id: A.id, name: A.name, purse: 0, startPurse: 120, squad: A.xi.map((pid) => ({ pid, price: 0, how: "" })) }, getSummary);
    const rb = teamRating({ id: B.id, name: B.name, purse: 0, startPurse: 120, squad: B.xi.map((pid) => ({ pid, price: 0, how: "" })) }, getSummary);
    res.json({ kind: "model prediction", ...p, a: A.short, b: B.short, explanation: `${p.n} simulated matches. ${A.short} XI batting ${ra.batting} / bowling ${ra.bowling}; ${B.short} XI batting ${rb.batting} / bowling ${rb.bowling} (calculated). Win share ${Math.round(p.aWin * 100)}%–${Math.round(p.bWin * 100)}%. This is a probability, not a guaranteed result.` });
  });

  // ------------- records -------------
  let realRecords: any = null;
  app.get("/api/records/real", (_req, res) => {
    if (!realRecords) {
      const P = Object.values<any>(Object.fromEntries(allSummaries().filter((s) => !s.custom).map((s) => [s.id, getPlayer(s.id)])));
      const top = (f: (p: any) => number | null, fmt: (p: any) => string, k = 10) => P.map((p) => ({ p, v: f(p) })).filter((x) => x.v != null && !isNaN(x.v as number)).sort((a, b) => (b.v as number) - (a.v as number)).slice(0, k).map((x) => ({ pid: x.p.id, name: x.p.name, value: fmt(x.p), v: x.v }));
      realRecords = {
        kind: "historical statistics", source: "Cricsheet IPL ball-by-ball data 2008-2026 (ODC-BY). Computed by IPL Auction Arena.", generated: DATA_META.generated,
        lists: {
          "Most runs": top((p) => p.ipl?.bat?.runs || 0, (p) => `${p.ipl.bat.runs}`),
          "Most wickets": top((p) => p.ipl?.bowl?.wkts || 0, (p) => `${p.ipl.bowl.wkts}`),
          "Most sixes": top((p) => p.ipl?.bat?.s6 || 0, (p) => `${p.ipl.bat.s6}`),
          "Most fours": top((p) => p.ipl?.bat?.f4 || 0, (p) => `${p.ipl.bat.f4}`),
          "Highest score": top((p) => p.ipl?.bat?.hs || 0, (p) => `${p.ipl.bat.hs}${p.ipl.bat.hsno ? "*" : ""}`),
          "Most hundreds": top((p) => p.ipl?.bat?.c100 || 0, (p) => `${p.ipl.bat.c100}`),
          "Most fifties": top((p) => p.ipl?.bat?.c50 || 0, (p) => `${p.ipl.bat.c50}`),
          "Best strike rate (min 1000 balls)": top((p) => (p.ipl?.bat?.balls >= 1000 ? p.ipl.bat.runs / p.ipl.bat.balls * 100 : null), (p) => (p.ipl.bat.runs / p.ipl.bat.balls * 100).toFixed(1)),
          "Best economy (min 1200 balls)": top((p) => (p.ipl?.bowl?.balls >= 1200 ? -p.ipl.bowl.runs / p.ipl.bowl.balls * 6 : null), (p) => (p.ipl.bowl.runs / p.ipl.bowl.balls * 6).toFixed(2)),
          "Best bowling figures": top((p) => (p.ipl?.bowl?.best?.[0] ? p.ipl.bowl.best[0] * 1000 - p.ipl.bowl.best[1] : null), (p) => `${p.ipl.bowl.best[0]}/${p.ipl.bowl.best[1]}`),
          "Most matches": top((p) => p.ipl?.matches || 0, (p) => `${p.ipl.matches}`),
          "Most Player of the Match awards": top((p) => p.ipl?.pom || 0, (p) => `${p.ipl.pom}`),
          "Most catches (fielder)": top((p) => p.ipl?.catches || 0, (p) => `${p.ipl.catches}`),
          "Most stumpings": top((p) => p.ipl?.stumpings || 0, (p) => `${p.ipl.stumpings}`),
          "Most expensive auction buys": P.flatMap((p) => (p.auction || []).filter((a: any) => a.type === "auction" && a.priceCr).map((a: any) => ({ pid: p.id, name: p.name, value: `₹${a.priceCr} cr · ${a.team} · ${a.year}`, v: a.priceCr }))).sort((a: any, b: any) => b.v - a.v).slice(0, 10),
        },
      };
    }
    res.json(realRecords);
  });
  app.get("/api/records/game", (_req, res) => {
    const rows = db.prepare("SELECT * FROM game_records ORDER BY value DESC LIMIT 400").all() as any[];
    const by = (k: string) => rows.filter((r) => r.kind === k).slice(0, 10).map((r) => ({ ...r, name: r.pid ? getSummary(r.pid)?.name : null, room: getRoom(r.code)?.s.name || r.code }));
    const titles = db.prepare("SELECT owner, COUNT(*) c FROM game_records WHERE kind='title' AND owner IS NOT NULL GROUP BY owner ORDER BY c DESC LIMIT 10").all() as any[];
    const champions = (db.prepare("SELECT * FROM game_records WHERE kind='title' ORDER BY ts DESC LIMIT 20").all() as any[]).map((r) => ({ ...r, ownerName: r.owner ? getUser(r.owner)?.username : "AI", room: getRoom(r.code)?.s.name || r.code }));
    let biggest: any[] = [];
    for (const r of allRooms()) for (const s of r.s.sales) if (s.team !== "?" && s.revealed) biggest.push({ pid: s.pid, name: getSummary(s.pid)?.name, team: s.team, price: s.price, room: r.s.name });
    biggest = biggest.sort((a, b) => b.price - a.price).slice(0, 10);
    res.json({ kind: "simulated / in-game records", note: "In-game records come only from IPL Auction Arena auctions and simulated matches. They are kept separate from real IPL history.", innings: by("innings"), bowling: by("bowling"), totals: by("team_total"), champions, hallOfFame: titles.map((t) => ({ owner: getUser(t.owner)?.username, titles: t.c })), biggestBuys: biggest });
  });

  // ------------- social -------------
  app.get("/api/users/:username", (req: AuthedReq, res) => {
    const me = auth(req);
    const u = db.prepare("SELECT * FROM users WHERE username=?").get((req.params.username as string)) as UserRow | undefined;
    if (!u) return res.status(404).json({ message: "No such user" });
    const friend = me ? db.prepare("SELECT status FROM friends WHERE user_id=? AND friend_id=?").get(me.id, u.id) as any : null;
    const canSee = u.privacy === "public" || me?.id === u.id || (u.privacy === "friends" && friend?.status === "accepted");
    const ach = db.prepare("SELECT key, ts FROM achievements WHERE user_id=?").all(u.id);
    res.json({ user: publicUser(u), private: !canSee, stats: canSee ? ownerStats(u.id) : null, achievements: canSee ? ach : [], friend: friend?.status || null });
  });
  app.get("/api/friends", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const rows = db.prepare("SELECT friend_id, status FROM friends WHERE user_id=?").all(u.id) as any[];
    const online = new Set<string>();
    for (const r of allRooms()) for (const [k] of r.sockets) online.add(k);
    res.json(rows.map((r) => ({ ...publicUser(getUser(r.friend_id)), status: r.status, online: online.has(r.friend_id) })));
  });
  app.post("/api/friends", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const f = db.prepare("SELECT * FROM users WHERE username=?").get(clean(req.body?.username, 20)) as UserRow | undefined;
    if (!f || f.id === u.id) return res.status(404).json({ message: "User not found" });
    const back = db.prepare("SELECT status FROM friends WHERE user_id=? AND friend_id=?").get(f.id, u.id) as any;
    if (back?.status === "pending") {
      db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run(f.id, u.id);
      db.prepare("INSERT OR REPLACE INTO friends VALUES (?,?,?,?)").run(u.id, f.id, "accepted", Date.now());
    } else {
      db.prepare("INSERT OR IGNORE INTO friends VALUES (?,?,?,?)").run(u.id, f.id, "requested", Date.now());
      db.prepare("INSERT OR IGNORE INTO friends VALUES (?,?,?,?)").run(f.id, u.id, "pending", Date.now());
    }
    res.json({ ok: true });
  });
  app.post("/api/friends/:id/accept", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const r = db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=? AND status='pending'").run(u.id, (req.params.id as string));
    if (!r.changes) return res.status(400).json({ message: "No pending request" });
    db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run((req.params.id as string), u.id);
    res.json({ ok: true });
  });
  app.delete("/api/friends/:id", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    db.prepare("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)").run(u.id, (req.params.id as string), (req.params.id as string), u.id);
    res.json({ ok: true });
  });
  app.post("/api/invites", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const r = getRoom(String(req.body?.code || "")); if (!r) return res.status(404).json({ message: "Room not found" });
    const ok = db.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='accepted'").get(u.id, req.body?.to);
    if (!ok) return res.status(403).json({ message: "You can only invite friends" });
    db.prepare("INSERT INTO invites (from_id, to_id, room_code, created) VALUES (?,?,?,?)").run(u.id, req.body.to, r.s.code, Date.now());
    res.json({ ok: true });
  });
  app.get("/api/invites", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const rows = db.prepare("SELECT * FROM invites WHERE to_id=? ORDER BY id DESC LIMIT 20").all(u.id) as any[];
    res.json(rows.map((r) => ({ ...r, from: getUser(r.from_id)?.username, room: getRoom(r.room_code)?.summary() || null })));
  });
  app.post("/api/invites/:id/seen", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; db.prepare("UPDATE invites SET seen=1 WHERE id=? AND to_id=?").run((req.params.id as string), u.id); res.json({ ok: true }); });

  app.get("/api/achievements", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const mine = db.prepare("SELECT key, ts, room FROM achievements WHERE user_id=?").all(u.id) as any[];
    const nu = getUser(u.id)!;
    res.json({ all: ACHIEVEMENTS, mine, xp: nu.xp, level: levelOf(nu.xp), nextLevelXp: Math.pow(levelOf(nu.xp), 2) * 100, stats: ownerStats(u.id), note: "XP and achievements are cosmetic and never affect auction purses, bids or fairness." });
  });

  // leagues
  app.get("/api/leagues", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const rows = (db.prepare("SELECT * FROM leagues").all() as any[]).filter((l) => JSON.parse(l.members).includes(u.id));
    res.json(rows.map((l) => {
      const members = JSON.parse(l.members) as string[];
      const board = members.map((m) => { const st = ownerStats(m); const usr = getUser(m); const gradePts = st.grades.reduce((a, g) => a + ({ "A+": 10, A: 8, "B+": 6, B: 5, "C+": 3, C: 2, D: 0 } as any)[g], 0); return { id: m, username: usr?.username, xp: usr?.xp || 0, level: levelOf(usr?.xp || 0), ...st, points: st.titles * 25 + gradePts + Math.floor((usr?.xp || 0) / 100) }; }).sort((a, b) => b.points - a.points);
      return { id: l.id, name: l.name, code: l.code, owner: getUser(l.owner)?.username, board, scoring: "Points = 25 per simulated title + auction grade points (A+ 10 … D 0) + 1 per 100 XP" };
    }));
  });
  app.post("/api/leagues", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const name = clean(req.body?.name, 40); if (!name) return res.status(400).json({ message: "Name required" });
    const id = uid(8), code = uid(6).toUpperCase();
    db.prepare("INSERT INTO leagues (id, name, owner, members, created, code) VALUES (?,?,?,?,?,?)").run(id, name, u.id, JSON.stringify([u.id]), Date.now(), code);
    res.json({ id, code });
  });
  app.post("/api/leagues/join", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const l = db.prepare("SELECT * FROM leagues WHERE code=?").get(clean(req.body?.code, 10).toUpperCase()) as any;
    if (!l) return res.status(404).json({ message: "League not found" });
    const m = JSON.parse(l.members); if (!m.includes(u.id)) m.push(u.id);
    db.prepare("UPDATE leagues SET members=? WHERE id=?").run(JSON.stringify(m.slice(0, 50)), l.id);
    res.json({ ok: true });
  });

  // watchlist / scouting
  app.get("/api/watchlist", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; res.json(db.prepare("SELECT pid, note FROM watchlist WHERE user_id=?").all(u.id)); });
  app.post("/api/watchlist", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    if (!getSummary(req.body?.pid)) return res.status(404).json({ message: "Player not found" });
    db.prepare("INSERT OR REPLACE INTO watchlist (user_id, pid, note) VALUES (?,?,?)").run(u.id, req.body.pid, clean(req.body?.note, 200));
    const c = (db.prepare("SELECT COUNT(*) c FROM watchlist WHERE user_id=?").get(u.id) as any).c;
    if (c >= 10) grantAchievement(u.id, "scout");
    res.json({ ok: true });
  });
  app.delete("/api/watchlist/:pid", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; db.prepare("DELETE FROM watchlist WHERE user_id=? AND pid=?").run(u.id, (req.params.pid as string)); res.json({ ok: true }); });

  // ------------- career mode (simulated) -------------
  function careerSeason(c: any) {
    const last = c.seasons[c.seasons.length - 1];
    const year = last ? last.year + 1 : 2027;
    const s = getSummary(c.pid)!;
    const age = (ageOn(s.dob, year) ?? 27);
    let adj = last ? last.adj : 1;
    const dev = age < 24 ? 0.05 : age < 28 ? 0.025 : age < 32 ? 0 : age < 35 ? -0.03 : -0.06;
    adj = Math.max(0.6, Math.min(1.35, adj + dev + (last?.formBonus || 0)));
    const my = realLineup(c.team);
    if (!my.xi.includes(c.pid)) {
      const same = [...my.xi].reverse().find((p) => getSummary(p)?.role === s.role && (!s.overseas || getSummary(p)?.overseas || my.xi.filter((x) => getSummary(x)?.overseas).length < 4)) || my.xi[my.xi.length - 1];
      my.xi = my.xi.map((p) => (p === same ? c.pid : p));
      my.bowling = bestXI(my.xi, getSummary, 11).bowling;
    }
    const st = { m: 0, runs: 0, balls: 0, outs: 0, hs: 0, f4: 0, s6: 0, wkts: 0, bb: 0, br: 0, wins: 0, pom: 0 };
    const opps = FRANCHISES.filter((f) => f.id !== c.team).map((f) => f.id);
    for (let i = 0; i < 14; i++) {
      const opp = realLineup(opps[i % opps.length]);
      const m = simulateMatch(i % 2 ? my : opp, i % 2 ? opp : my, { seed: hash(`${c.id}:${year}:${i}`), commentary: false, adj: { [c.pid]: adj }, venue: i % 2 ? FRANCHISE_BY_ID[c.team].home : FRANCHISE_BY_ID[opp.id].home });
      st.m++;
      if (m.winner === c.team) st.wins++;
      if (m.pom?.pid === c.pid) st.pom++;
      for (const inn of m.innings) {
        const b = inn.batting.find((x) => x.pid === c.pid && x.out !== "dnb"); if (b) { st.runs += b.runs; st.balls += b.balls; st.f4 += b.f4; st.s6 += b.s6; if (b.out !== "not out") st.outs++; st.hs = Math.max(st.hs, b.runs); }
        const w = inn.bowling.find((x) => x.pid === c.pid); if (w) { st.wkts += w.wkts; st.bb += w.balls; st.br += w.runs; }
      }
    }
    const rating = Math.round(Math.max(30, Math.min(99, s.ratings.overall * (0.75 + 0.25 * adj))) * 10) / 10;
    const sr = st.balls ? st.runs / st.balls * 100 : 0;
    const formBonus = (st.balls > 150 && sr > 150) || st.wkts >= 18 ? 0.015 : (st.balls > 100 && sr < 120) || (st.bb > 200 && st.wkts < 8) ? -0.015 : 0;
    const events: string[] = [];
    if (st.pom >= 2) events.push(`${st.pom} Player of the Match awards`);
    if (st.runs >= 500) events.push("500-run season");
    if (st.wkts >= 20) events.push("20-wicket season");
    if (dev < 0) events.push("Age-related decline applied");
    return { year, age, team: c.team, adj: Math.round(adj * 1000) / 1000, formBonus, rating, value: fairValue(rating), stats: st, events, simulated: true };
  }
  app.get("/api/careers", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; res.json((db.prepare("SELECT * FROM careers WHERE user_id=? ORDER BY id DESC").all(u.id) as any[]).map((c) => ({ id: c.id, pid: c.pid, ...JSON.parse(c.data) }))); });
  app.post("/api/careers", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const s = getSummary(req.body?.pid); if (!s) return res.status(404).json({ message: "Pick a player" });
    const team = FRANCHISE_BY_ID[req.body?.team] ? req.body.team : s.team2026 || "MI";
    const r = db.prepare("INSERT INTO careers (user_id, pid, data, created) VALUES (?,?,?,?)").run(u.id, s.id, JSON.stringify({ team, seasons: [], retired: false }), Date.now());
    res.json({ id: r.lastInsertRowid });
  });
  app.post("/api/careers/:id/next", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const row = db.prepare("SELECT * FROM careers WHERE id=? AND user_id=?").get((req.params.id as string), u.id) as any;
    if (!row) return res.status(404).json({ message: "Career not found" });
    const c = { id: row.id, pid: row.pid, ...JSON.parse(row.data) };
    if (c.retired) return res.status(400).json({ message: "Player has retired" });
    if (req.body?.team && FRANCHISE_BY_ID[req.body.team]) c.team = req.body.team;
    if (req.body?.retire) c.retired = true;
    else {
      const season = careerSeason(c);
      c.seasons.push(season);
      if (season.age >= 41 || c.seasons.length >= 15) c.retired = true;
    }
    db.prepare("UPDATE careers SET data=? WHERE id=?").run(JSON.stringify({ team: c.team, seasons: c.seasons, retired: c.retired }), row.id);
    res.json(c);
  });

  // ------------- custom tournament builder (simulated) -------------
  app.get("/api/tournaments", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; res.json((db.prepare("SELECT id, data, created FROM custom_tournaments WHERE user_id=? ORDER BY id DESC LIMIT 30").all(u.id) as any[]).map((x) => { const d = JSON.parse(x.data); return { id: x.id, created: x.created, name: d.name, champion: d.season.champion, teams: d.season.teams.length }; })); });
  app.get("/api/tournaments/:id", (req: AuthedReq, res) => { const u = need(req, res); if (!u) return; const x = db.prepare("SELECT data FROM custom_tournaments WHERE id=? AND user_id=?").get((req.params.id as string), u.id) as any; if (!x) return res.status(404).json({ message: "Not found" }); res.json(JSON.parse(x.data)); });
  app.post("/api/tournaments", (req: AuthedReq, res) => {
    const u = need(req, res); if (!u) return;
    const srcs = (req.body?.teams || []).slice(0, 10);
    const lineups: Record<string, Lineup> = {};
    for (const [i, src] of srcs.entries()) {
      const l = lineupFrom(src);
      if (!l) return res.status(400).json({ message: `Team ${i + 1} is invalid or has fewer than 11 players` });
      let id = l.id; let k = 2; while (lineups[id]) id = `${l.id}${k++}`;
      lineups[id] = { ...l, id, short: id === l.id ? l.short : `${l.short}${k - 1}` };
    }
    if (Object.keys(lineups).length < 2) return res.status(400).json({ message: "Pick at least 2 teams" });
    const name = clean(req.body?.name, 50) || "Custom Cup";
    const fmt = req.body?.format === "single" ? "single" : "double";
    const playoffs = [0, 2, 4].includes(req.body?.playoffs) ? req.body.playoffs : 4;
    const pitch = Object.keys(PITCHES).includes(req.body?.pitch) ? req.body.pitch : "balanced";
    const ids = Object.keys(lineups);
    const venues = Object.fromEntries(ids.map((id) => [id, FRANCHISE_BY_ID[id.replace(/\d+$/, "")]?.home || "Neutral venue"]));
    const season = makeSeason(ids, 2026, { format: fmt, playoffs: ids.length >= 4 ? playoffs : Math.min(playoffs, 2) as any, pitch, venues, label: name });
    const code = `T${uid(6)}`;
    let guard = 0;
    while (season.status !== "complete" && guard++ < 200) if (!playNext(code, 1, season, (t) => lineups[t])) break;
    const data = { name, code, season, lineups, simulated: true };
    const r = db.prepare("INSERT INTO custom_tournaments (user_id, data, created) VALUES (?,?,?)").run(u.id, JSON.stringify(data), Date.now());
    res.json({ id: r.lastInsertRowid, ...data });
  });
  app.get("/api/tournaments/:code/match/:n", (req, res) => {
    const m = getMatch((req.params.code as string), 1, +(req.params.n as string));
    if (!m) return res.status(404).json({ message: "Match not found" });
    res.json(m);
  });

  return httpServer;
}
