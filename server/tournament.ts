// SIMULATED tournament engine: fixtures, points table, NRR, playoffs, awards.
import { db } from "./db";
import { simulateMatch, stripCommentary, type Lineup, type MatchResult } from "./sim";
import { getSummary } from "./data";
import { ageOn, FRANCHISE_BY_ID, FORMATS, type Pitch, type Format } from "@shared/game";

db.exec(`CREATE TABLE IF NOT EXISTS matches (code TEXT NOT NULL, season INTEGER NOT NULL, n INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(code, season, n));
CREATE TABLE IF NOT EXISTS game_records (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, season INTEGER, kind TEXT, value REAL, pid TEXT, team TEXT, owner TEXT, label TEXT, ts INTEGER);`);

export interface Fixture { n: number; home: string; away: string; venue: string; stage: "league" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final"; result?: { winner: string | null; margin: string; scores: Record<string, string>; pom?: { pid: string; reason: string } | null } }
export interface TableRow { team: string; p: number; w: number; l: number; nr: number; pts: number; rf: number; bf: number; ra: number; bb: number; nrr: number; form: string[] }
export interface PStat { pid: string; team: string; m: number; runs: number; balls: number; outs: number; f4: number; s6: number; hs: number; wkts: number; bb: number; br: number; dots: number; catches: number; stumpings: number; mvp: number; best: [number, number]; c50: number; c100: number }
export interface Season {
  year: number; label: string; format: "double" | "single"; playoffs: 4 | 2 | 0; pitch: Pitch; fixtures: Fixture[]; table: TableRow[]; stats: Record<string, PStat>;
  status: "league" | "playoffs" | "complete"; champion: string | null; runnerUp: string | null; awards: any | null; nextMatch: number; teams: string[]; simulated: true;
  matchFormat?: Format; finalVenue?: string;
}
const fmtOf = (s: Season): Format => s.matchFormat || "ipl";
const oversStr = (b: number) => `${Math.floor(b / 6)}.${b % 6}`;

export function makeSeason(teams: string[], year: number, opts: { format?: "double" | "single"; playoffs?: 4 | 2 | 0; pitch?: Pitch; venues?: Record<string, string>; label?: string; matchFormat?: Format; finalVenue?: string } = {}): Season {
  const fixtures: Fixture[] = [];
  const list = [...teams];
  if (list.length % 2) list.push("BYE");
  const n = list.length;
  const rounds: [string, string][][] = [];
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push(r % 2 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  const all = [...rounds];
  if ((opts.format || "double") === "double") for (const r of rounds) all.push(r.map(([a, b]) => [b, a]));
  let k = 1;
  const venue = (t: string) => opts.venues?.[t] || FRANCHISE_BY_ID[t]?.home || "Neutral venue";
  for (const r of all) for (const [h, a] of r) fixtures.push({ n: k++, home: h, away: a, venue: venue(h), stage: "league" });
  return {
    year, label: opts.label || `Season ${year}`, format: opts.format || "double", playoffs: opts.playoffs ?? (teams.length >= 4 ? 4 : 2), pitch: opts.pitch || "balanced",
    fixtures, table: teams.map((t) => ({ team: t, p: 0, w: 0, l: 0, nr: 0, pts: 0, rf: 0, bf: 0, ra: 0, bb: 0, nrr: 0, form: [] })), stats: {}, status: "league", champion: null, runnerUp: null, awards: null, nextMatch: 1, teams, simulated: true,
    matchFormat: opts.matchFormat || "ipl", finalVenue: opts.finalVenue,
  };
}

export function sortTable(t: TableRow[]) {
  for (const r of t) r.nrr = r.bf && r.bb ? Math.round(((r.rf / (r.bf / 6)) - (r.ra / (r.bb / 6))) * 1000) / 1000 : 0;
  return t.sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w);
}

function applyResult(s: Season, f: Fixture, m: MatchResult) {
  const fmt = fmtOf(s);
  const test = fmt === "test";
  const scores: Record<string, string> = {};
  for (const inn of m.innings) {
    const one = test ? `${inn.runs}${inn.allOut ? "" : `/${inn.wkts}`}${inn.declared ? "d" : ""}` : `${inn.runs}/${inn.wkts} (${oversStr(inn.balls)})`;
    scores[inn.team] = scores[inn.team] ? `${scores[inn.team]} & ${one}` : one;
  }
  f.result = { winner: m.winner, margin: m.margin, scores, pom: m.pom };
  if (f.stage === "league") {
    const quota = (FORMATS[fmt].overs || 0) * 6;
    for (const inn of m.innings) {
      const bt = s.table.find((r) => r.team === inn.team)!, bw = s.table.find((r) => r.team === inn.bowlingTeam)!;
      // NRR rule: all out counts as full quota. Tests use runs per over across all innings.
      const balls = !test && inn.allOut ? quota : Math.max(1, inn.balls);
      bt.rf += inn.runs; bt.bf += balls; bw.ra += inn.runs; bw.bb += balls;
    }
    for (const t of [f.home, f.away]) {
      const r = s.table.find((x) => x.team === t)!;
      r.p++;
      // Limited overs: win 2, no result/tie 1. Tests (WTC-style): win 12, draw 4.
      if (m.winner === t) { r.w++; r.pts += test ? 12 : 2; r.form.push("W"); } else if (m.winner == null) { r.nr++; r.pts += test ? 4 : 1; r.form.push(test ? "D" : "N"); } else { r.l++; r.form.push("L"); }
      r.form = r.form.slice(-5);
    }
    sortTable(s.table);
  }
  // player stats
  const ensure = (pid: string, team: string) => (s.stats[pid] ||= { pid, team, m: 0, runs: 0, balls: 0, outs: 0, f4: 0, s6: 0, hs: 0, wkts: 0, bb: 0, br: 0, dots: 0, catches: 0, stumpings: 0, mvp: 0, best: [0, 999], c50: 0, c100: 0 });
  for (const t of m.teams) for (const pid of m.xi[t.id]) ensure(pid, t.id).m++;
  for (const [tid, imp] of Object.entries(m.impact)) if (imp) ensure(imp.in, tid).m++;
  for (const inn of m.innings) {
    for (const b of inn.batting) {
      if (b.out === "dnb") continue;
      const p = ensure(b.pid, inn.team);
      p.runs += b.runs; p.balls += b.balls; p.f4 += b.f4; p.s6 += b.s6; if (b.out !== "not out") p.outs++;
      p.hs = Math.max(p.hs, b.runs); if (b.runs >= 100) p.c100++; else if (b.runs >= 50) p.c50++;
      p.mvp += b.f4 * 2.5 + b.s6 * 3.5;
    }
    for (const w of inn.bowling) {
      const p = ensure(w.pid, inn.bowlingTeam);
      p.wkts += w.wkts; p.bb += w.balls; p.br += w.runs; p.dots += w.dots; p.mvp += w.wkts * 3.5 + w.dots * 1;
      if (w.wkts > p.best[0] || (w.wkts === p.best[0] && w.runs < p.best[1])) p.best = [w.wkts, w.runs];
    }
    for (const [f, c] of Object.entries(inn.catches)) { const p = ensure(f, inn.bowlingTeam); p.catches += c; p.mvp += c * 2.5; }
    for (const [f, c] of Object.entries(inn.stumpings)) { const p = ensure(f, inn.bowlingTeam); p.stumpings += c; p.mvp += c * 2.5; }
  }
}

export function addPlayoffs(s: Season) {
  const top = s.table.map((r) => r.team);
  let n = s.fixtures.length + 1;
  const neutral = s.finalVenue || "Narendra Modi Stadium";
  if (s.playoffs === 4 && top.length >= 4) {
    s.fixtures.push({ n: n++, home: top[0], away: top[1], venue: (fmtOf(s) === "ipl" && FRANCHISE_BY_ID[top[0]]?.home) || neutral, stage: "Qualifier 1" });
    s.fixtures.push({ n: n++, home: top[2], away: top[3], venue: (fmtOf(s) === "ipl" && FRANCHISE_BY_ID[top[2]]?.home) || neutral, stage: "Eliminator" });
  } else if (s.playoffs === 2 || (s.playoffs === 4 && top.length >= 2)) {
    s.fixtures.push({ n: n++, home: top[0], away: top[1], venue: neutral, stage: "Final" });
  }
  s.status = s.playoffs ? "playoffs" : "complete";
  if (!s.playoffs) { s.champion = top[0]; s.runnerUp = top[1]; s.awards = awards(s); }
}

function progressPlayoffs(s: Season) {
  const get = (st: string) => s.fixtures.find((f) => f.stage === st);
  const q1 = get("Qualifier 1"), el = get("Eliminator"), q2 = get("Qualifier 2"), fi = get("Final");
  const loser = (f: Fixture) => (f.result!.winner === f.home ? f.away : f.home);
  let n = s.fixtures.length + 1;
  if (q1?.result && el?.result && !q2) s.fixtures.push({ n: n++, home: loser(q1), away: el.result.winner!, venue: s.finalVenue || "Narendra Modi Stadium", stage: "Qualifier 2" });
  const q2b = get("Qualifier 2");
  if (q1?.result && q2b?.result && !fi) s.fixtures.push({ n: n++, home: q1.result.winner!, away: q2b.result.winner!, venue: s.finalVenue || "Narendra Modi Stadium", stage: "Final" });
  const f2 = get("Final");
  if (f2?.result) { s.champion = f2.result.winner; s.runnerUp = loser(f2); s.status = "complete"; s.awards = awards(s); }
}

export type LineupFor = (team: string) => Lineup;

export function playNext(code: string, seasonNo: number, s: Season, lineupFor: LineupFor, style: any = "pro"): { fixture: Fixture; match: MatchResult } | null {
  if (s.status === "complete") return null;
  const f = s.fixtures.find((x) => !x.result);
  if (!f) {
    if (s.status === "league") { addPlayoffs(s); return playNext(code, seasonNo, s, lineupFor, style); }
    progressPlayoffs(s);
    if ((s.status as string) === "complete") return null;
    return playNext(code, seasonNo, s, lineupFor, style);
  }
  const seed = hash(`${code}:${seasonNo}:${f.n}`);
  const m = simulateMatch(lineupFor(f.home), lineupFor(f.away), { venue: f.venue, pitch: s.pitch, seed, style, format: fmtOf(s) });
  if (f.stage !== "league" && !m.winner) {
    // Drawn/tied knockout: the higher-placed side (listed first) advances, as in a drawn Test final.
    m.winner = f.home; m.margin = `${m.margin}. ${f.home} advance as the higher-placed side`;
  }
  applyResult(s, f, m);
  db.prepare("INSERT OR REPLACE INTO matches (code, season, n, data) VALUES (?,?,?,?)").run(code, seasonNo, f.n, JSON.stringify({ ...m, stage: f.stage, n: f.n }));
  records(code, seasonNo, m, fmtOf(s));
  s.nextMatch = f.n + 1;
  if (!s.fixtures.some((x) => !x.result)) {
    if (s.status === "league") addPlayoffs(s);
    else progressPlayoffs(s);
  }
  return { fixture: f, match: stripCommentary(m) };
}

export function getMatch(code: string, season: number, n: number) {
  const r = db.prepare("SELECT data FROM matches WHERE code=? AND season=? AND n=?").get(code, season, n) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : null;
}

function records(code: string, season: number, m: MatchResult, fmt: Format = "ipl") {
  const ins = db.prepare("INSERT INTO game_records (code, season, kind, value, pid, team, label, ts) VALUES (?,?,?,?,?,?,?,?)");
  const now = Date.now();
  const T = fmt === "test" ? { tot: 550, inn: 180, w: 6 } : fmt === "odi" ? { tot: 350, inn: 130, w: 5 } : { tot: 220, inn: 90, w: 4 };
  for (const inn of m.innings) {
    if (inn.runs >= T.tot) ins.run(code, season, "team_total", inn.runs, null, inn.team, `${inn.team} ${inn.runs}/${inn.wkts}`, now);
    for (const b of inn.batting) if (b.runs >= T.inn) ins.run(code, season, "innings", b.runs, b.pid, inn.team, `${b.runs}${b.out === "not out" ? "*" : ""} (${b.balls})`, now);
    for (const w of inn.bowling) if (w.wkts >= T.w) ins.run(code, season, "bowling", w.wkts * 1000 - w.runs, w.pid, inn.bowlingTeam, `${w.wkts}/${w.runs}`, now);
  }
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function awards(s: Season) {
  const st = Object.values(s.stats);
  const by = (f: (p: PStat) => number, filter: (p: PStat) => boolean = () => true) => st.filter(filter).sort((a, b) => f(b) - f(a)).slice(0, 5);
  const out = (p: PStat | undefined, v: string) => (p ? { pid: p.pid, team: p.team, value: v } : null);
  const orange = by((p) => p.runs + p.runs / Math.max(1, p.balls) / 100);
  const purple = by((p) => p.wkts * 1000 - (p.bb ? p.br / p.bb * 6 : 99));
  const sixes = by((p) => p.s6);
  const fours = by((p) => p.f4);
  const sr = by((p) => (p.balls ? p.runs / p.balls : 0), (p) => p.balls >= 100);
  const eco = by((p) => (p.bb ? -p.br / p.bb : -99), (p) => p.bb >= 120);
  const mvp = by((p) => p.mvp);
  const emerging = by((p) => p.mvp, (p) => { const sm = getSummary(p.pid); const a = ageOn(sm?.dob || null, s.year); return !!sm && a != null && a < 26 && sm.matches <= 25; });
  return {
    orangeCap: out(orange[0], `${orange[0]?.runs} runs`), purpleCap: out(purple[0], `${purple[0]?.wkts} wickets`),
    mostSixes: out(sixes[0], `${sixes[0]?.s6} sixes`), mostFours: out(fours[0], `${fours[0]?.f4} fours`),
    bestStrikeRate: out(sr[0], sr[0] ? `SR ${(sr[0].runs / sr[0].balls * 100).toFixed(1)}` : ""),
    bestEconomy: out(eco[0], eco[0] ? `Econ ${(eco[0].br / eco[0].bb * 6).toFixed(2)}` : ""),
    playerOfTournament: out(mvp[0], `${mvp[0]?.mvp.toFixed(1)} MVP pts`),
    emergingPlayer: out(emerging[0], emerging[0] ? `${emerging[0].mvp.toFixed(1)} MVP pts` : ""),
    leaders: { runs: orange.map((p) => ({ pid: p.pid, team: p.team, v: p.runs })), wkts: purple.map((p) => ({ pid: p.pid, team: p.team, v: p.wkts })), mvp: mvp.map((p) => ({ pid: p.pid, team: p.team, v: +p.mvp.toFixed(1) })) },
    note: "Simulated season awards. Emerging Player uses age under 26 and 25 or fewer real IPL matches before the season. MVP points follow the IPL-style formula (four 2.5, six 3.5, wicket 3.5, dot 1, catch/stumping 2.5).",
  };
}

// Fast Monte-Carlo tournament predictor from current table + remaining fixtures (model prediction)
export function predictTournament(s: Season, lineupFor: LineupFor, runs = 40) {
  const titles: Record<string, number> = {}, top4: Record<string, number> = {};
  for (const t of s.teams) { titles[t] = 0; top4[t] = 0; }
  // precompute head-to-head win probabilities via small simulations
  const pw: Record<string, number> = {};
  const key = (a: string, b: string) => `${a}|${b}`;
  const lp: Record<string, Lineup> = Object.fromEntries(s.teams.map((t) => [t, lineupFor(t)]));
  for (const a of s.teams) for (const b of s.teams) if (a < b) {
    let w = 0, d = 0; const N = fmtOf(s) === "test" ? 8 : fmtOf(s) === "odi" ? 14 : 24;
    for (let i = 0; i < N; i++) { const res = simulateMatch(lp[a], lp[b], { seed: hash(a + b) + i, commentary: false, pitch: s.pitch, format: fmtOf(s) }).winner; if (res === a) w++; else if (!res) d++; }
    // a draw counts as half a win for the head-to-head probability
    pw[key(a, b)] = (w + d / 2) / N; pw[key(b, a)] = 1 - (w + d / 2) / N;
  }
  let seed = 12345;
  const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < runs * 10; k++) {
    const pts: Record<string, number> = Object.fromEntries(s.table.map((r) => [r.team, r.pts + R() * 0.01 + r.nrr * 0.001]));
    for (const f of s.fixtures.filter((x) => x.stage === "league" && !x.result)) {
      const w = R() < pw[key(f.home, f.away)] ? f.home : f.away; pts[w] += 2;
    }
    const order = Object.entries(pts).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const q = order.slice(0, 4);
    q.forEach((t) => top4[t]++);
    const win = (a: string, b: string) => (R() < pw[key(a, b)] ? a : b);
    let ch: string;
    if (s.playoffs === 4 && q.length >= 4) { const q1 = win(q[0], q[1]); const e = win(q[2], q[3]); const q2 = win(q1 === q[0] ? q[1] : q[0], e); ch = win(q1, q2); }
    else if (q.length >= 2 && s.playoffs) ch = win(q[0], q[1]); else ch = q[0];
    titles[ch]++;
  }
  const N = runs * 10;
  return s.teams.map((t) => ({ team: t, title: Math.round(titles[t] / N * 1000) / 10, top4: Math.round(top4[t] / N * 1000) / 10 })).sort((a, b) => b.title - a.title);
}
