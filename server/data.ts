import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import type { PlayerSummary, RoomSettings, Role, IntlFormat } from "@shared/game";

const dataDir = fs.existsSync(path.resolve(process.cwd(), "server/data")) ? path.resolve(process.cwd(), "server/data") : path.resolve(process.cwd(), "data");
const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
export const DATA_META = raw.meta;
export const HALL_OF_FAME = JSON.parse(fs.readFileSync(path.join(dataDir, "halloffame.json"), "utf8"));
export const BASELINE = JSON.parse(fs.readFileSync(path.join(dataDir, "baseline.json"), "utf8"));

export type FullPlayer = any;
const BASE: Record<string, FullPlayer> = {};
for (const p of raw.players) BASE[p.id] = p;

// ---------- International (T20I / ODI / Test) data: Cricsheet ball-by-ball, full members ----------
const intlRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "intl.json"), "utf8"));
export const INTL_META = intlRaw.meta;
export const INTL_FORMATS: IntlFormat[] = ["t20i", "odi", "test"];
for (const r of Object.values<any>(intlRaw.players)) {
  if (BASE[r.id]) {
    const b0 = BASE[r.id];
    const lastIntl = Math.max(...Object.values<any>(r.fmt).map((x) => x.last || 0));
    const fix: any = {};
    // Cricsheet's international record corrects a few IPL-metadata gaps: a player who represented another nation but was stored as "India",
    // and full internationals missing a "capped" flag. Indians whose last international was 5+ years ago stay uncapped (IPL rule).
    if (b0.country === "India" && r.country && r.country !== "India") { fix.country = r.country; fix.overseas = true; }
    const nation = fix.country || b0.country;
    if (!b0.capped && (nation !== "India" || lastIntl >= 2021)) fix.capped = true;
    BASE[r.id] = { ...b0, ...fix, intl: r.fmt };
    continue;
  }
  const best = Object.values<any>(r.fmt).sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  BASE[r.id] = {
    id: r.id, name: r.name, fullName: r.fullName, country: r.country, role: r.role, bowlType: r.bowlType, bowlTypeEstimated: r.bowlTypeEstimated, dob: r.dob,
    photo: r.photo || null, wiki: r.wiki, qid: r.qid, capped: true, overseas: r.country !== "India", intlOnly: true, intl: r.fmt,
    ratings: { ...best.ratings, limited: false }, basePrice: best.base, retired: !Object.values<any>(r.fmt).some((x) => x.active), status: "International (non-IPL)",
  };
}
export function intlStats(p: FullPlayer, fmt: IntlFormat) {
  const f = p?.intl?.[fmt];
  if (!f) return null;
  return {
    matches: f.m, runs: f.runs, wkts: f.wk,
    sr: f.balls >= 30 ? +(f.runs / f.balls * 100).toFixed(1) : null,
    avg: f.outs > 0 ? +(f.runs / f.outs).toFixed(1) : null,
    econ: f.wb >= 60 ? +(f.wr / f.wb * 6).toFixed(2) : null,
    hs: f.hs, c100: f.c100, c50: f.c50, w5: f.w5, best: f.best, first: f.first, last: f.last, active: f.active, fmt,
  };
}
/** Room-level override for international modes: ratings + headline numbers come from that format only. */
export function intlOverride(p: FullPlayer, fmt: IntlFormat) {
  const f = p?.intl?.[fmt];
  if (!f) return null;
  return { ...f.ratings, _stats: intlStats(p, fmt) };
}

let PLAYERS: Record<string, FullPlayer> = {};
let SUMMARY: PlayerSummary[] = [];
let SUMMARY_BY_ID: Record<string, PlayerSummary> = {};

function deepMerge(a: any, b: any) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") out[k] = deepMerge(a[k], b[k]);
    else out[k] = b[k];
  }
  return out;
}

export function rebuild() {
  PLAYERS = {};
  for (const id of Object.keys(BASE)) PLAYERS[id] = BASE[id];
  const overrides = db.prepare("SELECT pid, data FROM player_overrides").all() as { pid: string; data: string }[];
  const customs = db.prepare("SELECT pid, data FROM custom_players").all() as { pid: string; data: string }[];
  for (const c of customs) PLAYERS[c.pid] = { ...JSON.parse(c.data), id: c.pid, custom: true };
  for (const o of overrides) if (PLAYERS[o.pid]) PLAYERS[o.pid] = { ...deepMerge(PLAYERS[o.pid], JSON.parse(o.data)), edited: true };
  SUMMARY = Object.values(PLAYERS).map(summarize);
  SUMMARY_BY_ID = Object.fromEntries(SUMMARY.map((s) => [s.id, s]));
}

export function summarize(p: FullPlayer): PlayerSummary {
  const b = p.ipl?.bat, w = p.ipl?.bowl;
  const photo = p.customPhoto || p.photo?.src || null;
  return {
    id: p.id, name: p.name, fullName: p.fullName || p.name, country: p.country || "India", role: p.role as Role, bowlType: p.bowlType || null,
    batting: p.batting || null, bowling: p.bowling || null, capped: !!p.capped, overseas: !!p.overseas, dob: p.dob || null,
    photo, photoCredit: p.customPhoto ? "Custom photo (user supplied)" : p.photo ? `${p.photo.artist || "Unknown"} · ${p.photo.license} · Wikimedia Commons` : null,
    basePrice: p.basePrice ?? 0.3,
    ratings: { bat: p.ratings?.bat ?? 40, bowl: p.ratings?.bowl ?? 30, overall: p.ratings?.overall ?? 40, form: p.ratings?.form ?? null, consistency: p.ratings?.consistency ?? null, limited: !!p.ratings?.limited },
    matches: p.ipl?.matches || 0, runs: b?.runs || 0, wkts: w?.wkts || 0,
    sr: b && b.balls >= 30 ? +(b.runs / b.balls * 100).toFixed(1) : null,
    avg: b && b.outs > 0 ? +(b.runs / b.outs).toFixed(1) : null,
    econ: w && w.balls >= 60 ? +(w.runs / w.balls * 6).toFixed(2) : null,
    team2026: p.squad2026?.team || null, price2026: p.squad2026?.priceCr ?? null,
    status: p.status || "", legend: !!p.legend, retired: !!p.retired, lastSeason: p.lastSeason ?? null, firstSeason: p.firstSeason ?? null,
    teams: p.ipl ? Object.keys(p.ipl.teams) : [], custom: !!p.custom, intlOnly: !!p.intlOnly,
    fmts: p.intl ? Object.fromEntries(Object.entries<any>(p.intl).map(([k, f]) => [k, { m: f.m, runs: f.runs, wkts: f.wk, overall: f.ratings.overall, active: f.active }])) : undefined,
    ppShare: b && b.balls >= 60 ? +((p.ipl.phaseBat?.pp?.balls || 0) / b.balls).toFixed(2) : 0,
    deathShare: b && b.balls >= 60 ? +((p.ipl.phaseBat?.death?.balls || 0) / b.balls).toFixed(2) : 0,
  };
}

rebuild();

export const getPlayer = (id: string) => PLAYERS[id];
export const getSummary = (id: string) => SUMMARY_BY_ID[id];
export const allSummaries = () => SUMMARY;
export const allPlayers = () => PLAYERS;

// ---------- Era-specific stats (Legends mode) ----------
const ERAS: Record<string, [number, number]> = { "2008-2012": [2008, 2012], "2013-2017": [2013, 2017], "2018-2022": [2018, 2022], "2023-2026": [2023, 2026], all: [2008, 2026] };
export function eraStats(p: FullPlayer, era: string) {
  const [a, b] = ERAS[era] || ERAS.all;
  const bat = { inn: 0, runs: 0, balls: 0, outs: 0, f4: 0, s6: 0, hs: 0, c100: 0, c50: 0 };
  const bowl = { inn: 0, balls: 0, runs: 0, wkts: 0 };
  let m = 0;
  for (const [y, s] of Object.entries<any>(p.ipl?.seasons || {})) {
    const yr = +y;
    if (yr < a || yr > b) continue;
    m += s.m;
    for (const k of ["inn", "runs", "balls", "outs", "f4", "s6", "c100", "c50"] as const) (bat as any)[k] += s.bat[k] || 0;
    bat.hs = Math.max(bat.hs, s.bat.hs || 0);
    for (const k of ["inn", "balls", "runs", "wkts"] as const) (bowl as any)[k] += s.bowl[k] || 0;
  }
  return { matches: m, bat, bowl };
}
export function eraRating(p: FullPlayer, era: string) {
  if (era === "all") return p.ratings;
  const e = eraStats(p, era);
  const k = 120;
  const sr = (e.bat.runs + 1.25 * k) / (e.bat.balls + k) * 100;
  const avg = (e.bat.runs + 40) / (e.bat.outs + 2);
  let bat = 40 + (sr - 115) * 0.5 + (avg - 18) * 0.9;
  bat = 45 + (bat - 45) * Math.min(1, e.bat.balls / 700 + 0.25);
  const ec = (e.bowl.runs + 8.0 * k / 6) / (e.bowl.balls + k) * 6;
  const bsr = (e.bowl.balls + 48) / (e.bowl.wkts + 2);
  let bowl = 45 + (8.6 - ec) * 9 + (26 - bsr) * 1.2;
  bowl = 45 + (bowl - 45) * Math.min(1, e.bowl.balls / 700 + 0.25);
  if (e.bat.balls < 30) bat = Math.min(bat, 40);
  if (e.bowl.balls < 30) bowl = Math.min(bowl, 30);
  const role = p.role;
  let ov = role === "Batter" ? bat : role === "Bowler" ? bowl : role === "Wicket-keeper" ? bat + 1 : 0.62 * Math.max(bat, bowl) + 0.38 * Math.min(bat, bowl) + 2;
  ov += Math.min(2.5, e.matches / 60);
  const c = (x: number) => Math.round(Math.max(20, Math.min(99, x)) * 10) / 10;
  return { ...p.ratings, bat: c(bat), bowl: c(bowl), overall: c(ov), era };
}

// ---------- Pools ----------
function isActive(p: FullPlayer) {
  return !p.retired && (p.squad2026 || (p.lastSeason && p.lastSeason >= 2024));
}
const byRating = (a: PlayerSummary, b: PlayerSummary) => b.ratings.overall - a.ratings.overall;

export const MINI_2026_PURSE: Record<string, number> = { KKR: 64.3, CSK: 43.4, SRH: 25.5, LSG: 22.95, DC: 21.8, RCB: 16.4, RR: 16.05, GT: 12.9, PBKS: 11.5, MI: 2.75 };
export const MINI_2026_SOURCE = "Remaining purses after 2026 retentions: Cricbuzz auction tracker (combined ₹237.55 cr, matching Economic Times).";

export function mini2026Retained() {
  const out: Record<string, { pid: string; price: number }[]> = {};
  for (const p of Object.values(PLAYERS)) {
    const r = (p.auction || []).find((e: any) => e.year === 2026 && e.type === "retained");
    if (r && r.team) (out[r.team] ||= []).push({ pid: p.id, price: r.priceCr });
  }
  return out;
}

export function buildPool(s: RoomSettings): { pid: string; base: number; set: string }[] {
  let list: PlayerSummary[] = [];
  if (s.pool === "intl" && s.format && s.format !== "ipl") return buildIntlPool(s);
  const S = SUMMARY.filter((x) => (!x.custom || s.pool === "custom" || s.pool === "all") && (!x.intlOnly || s.pool === "custom"));
  switch (s.pool) {
    case "all": list = [...S]; break;
    case "marquee": list = S.filter((x) => isActive(PLAYERS[x.id]) && !x.ratings.limited).sort(byRating).slice(0, s.poolSize || 48); break;
    case "uncapped": list = S.filter((x) => !x.capped && !x.overseas && isActive(PLAYERS[x.id])); break;
    case "legends": list = S.filter((x) => (x.matches >= 25 && eraStats(PLAYERS[x.id], s.era).matches >= 12)); break;
    case "mini2026": {
      const ret = new Set(Object.values(mini2026Retained()).flat().map((r) => r.pid));
      list = S.filter((x) => {
        const p = PLAYERS[x.id];
        if (ret.has(x.id) || p.retired) return false;
        const a = p.auction || [];
        const sold26 = a.some((e: any) => e.year === 2026 && e.type === "auction");
        const in25 = a.some((e: any) => e.year === 2025);
        return sold26 || in25;
      });
      break;
    }
    case "custom": list = (s.customPool || []).map((id) => SUMMARY_BY_ID[id]).filter(Boolean); break;
    case "quick": list = S.filter((x) => isActive(PLAYERS[x.id]) && !x.ratings.limited).sort(byRating).slice(0, 140).sort(() => Math.random() - 0.5).slice(0, s.poolSize || 60); break;
    default: list = S.filter((x) => isActive(PLAYERS[x.id]));
  }
  if (s.pool === "legends") {
    list = list.map((x) => ({ ...x, ratings: { ...x.ratings, ...eraRating(PLAYERS[x.id], s.era) } }));
  }
  list.sort(byRating);
  if (s.poolSize && !["marquee", "quick"].includes(s.pool)) list = list.slice(0, s.poolSize);
  const baseFor = (x: PlayerSummary) => {
    if (s.mode === "marquee") return 2;
    if (s.pool === "mini2026") {
      const a = (PLAYERS[x.id].auction || []).find((e: any) => e.year === 2026 && e.type === "auction");
      if (a?.baseCr) return a.baseCr;
    }
    if (s.pool === "legends") {
      const o = x.ratings.overall;
      return o >= 86 ? 2 : o >= 80 ? 1.5 : o >= 75 ? 1.25 : o >= 70 ? 1 : o >= 64 ? 0.75 : o >= 57 ? 0.5 : 0.3;
    }
    return x.basePrice;
  };
  // Sets
  const cat = (x: PlayerSummary) => (x.role === "Batter" ? "BA" : x.role === "All-rounder" ? "AL" : x.role === "Wicket-keeper" ? "WK" : x.bowlType === "Spin" ? "SP" : "FA");
  const CAT_NAME: Record<string, string> = { BA: "batters", AL: "all-rounders", WK: "wicket-keepers", FA: "fast bowlers", SP: "spin bowlers" };
  const out: { pid: string; base: number; set: string }[] = [];
  let rest = [...list];
  if (s.marqueeSets) {
    const marquee = rest.filter((x) => x.capped || x.overseas).slice(0, 12);
    const ids = new Set(marquee.map((m) => m.id));
    marquee.forEach((x, i) => out.push({ pid: x.id, base: Math.max(baseFor(x), 2), set: i < 6 ? "Marquee Set 1 (M1)" : "Marquee Set 2 (M2)" }));
    rest = rest.filter((x) => !ids.has(x.id));
  }
  if (["marquee", "quick"].includes(s.pool) || s.mode === "blind") {
    rest.forEach((x, i) => out.push({ pid: x.id, base: baseFor(x), set: s.mode === "blind" ? `Stage ${Math.floor(i / 10) + 1}` : s.pool === "marquee" ? "Marquee" : "Quick Set" }));
    return out;
  }
  const groups: Record<string, PlayerSummary[]> = {};
  for (const x of rest) (groups[(x.capped || x.overseas ? "" : "U") + cat(x)] ||= []).push(x);
  const order = ["BA", "AL", "WK", "FA", "SP"];
  let round = 1, any = true;
  while (any) {
    any = false;
    for (const pref of ["", "U"]) {
      for (const c of order) {
        const g = groups[pref + c];
        if (!g || !g.length) continue;
        const chunk = g.splice(0, pref ? 8 : 6);
        any = true;
        const label = `${pref ? "Uncapped" : "Capped"} ${CAT_NAME[c]} (${pref}${c}${round})`;
        chunk.forEach((x) => out.push({ pid: x.id, base: baseFor(x), set: label }));
      }
    }
    round++;
  }
  return out;
}

function buildIntlPool(s: RoomSettings): { pid: string; base: number; set: string }[] {
  const fmt = s.format as IntlFormat;
  type C = { id: string; role: Role; bowlType: string | null; ov: number; base: number };
  let list: C[] = [];
  for (const p of Object.values<any>(PLAYERS)) {
    const f = p.intl?.[fmt];
    if (!f || p.custom) continue;
    const india = (p.country || "India") === "India";
    if (s.intlPool === "india_now" && !(india && f.active)) continue;
    if (s.intlPool === "india_all" && !india) continue;
    if (s.intlPool === "world" && india) continue;
    list.push({ id: p.id, role: p.role, bowlType: p.bowlType || null, ov: f.ratings.overall, base: f.base });
  }
  list.sort((a, b) => b.ov - a.ov);
  const cap = s.poolSize || (s.intlPool === "allstars" ? 72 : s.intlPool === "world" ? 150 : 0);
  if (cap) list = list.slice(0, cap);
  const baseFor = (x: C) => (s.intlPool === "allstars" ? Math.max(1.5, x.base) : x.base);
  const cat = (x: C) => (x.role === "Batter" ? "BA" : x.role === "All-rounder" ? "AL" : x.role === "Wicket-keeper" ? "WK" : x.bowlType === "Spin" ? "SP" : "FA");
  const NAME: Record<string, string> = { BA: "Batters", AL: "All-rounders", WK: "Wicket-keepers", FA: "Fast bowlers", SP: "Spin bowlers" };
  const out: { pid: string; base: number; set: string }[] = [];
  if (s.intlPool === "allstars") { list.forEach((x, i) => out.push({ pid: x.id, base: baseFor(x), set: `All-Stars ${Math.floor(i / 12) + 1}` })); return out; }
  const groups: Record<string, C[]> = {};
  for (const x of list) (groups[cat(x)] ||= []).push(x);
  let round = 1, any = true;
  while (any) {
    any = false;
    for (const c of ["BA", "AL", "WK", "FA", "SP"]) {
      const g = groups[c];
      if (!g?.length) continue;
      any = true;
      g.splice(0, 6).forEach((x) => out.push({ pid: x.id, base: baseFor(x), set: `${NAME[c]} (${c}${round})` }));
    }
    round++;
  }
  return out;
}

export function playerDetail(id: string) {
  const p = PLAYERS[id];
  if (!p) return null;
  return { ...p, summary: SUMMARY_BY_ID[id] };
}
