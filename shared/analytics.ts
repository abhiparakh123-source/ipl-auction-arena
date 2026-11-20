// Calculated metrics & model predictions. All outputs are labelled by kind for the UI.
import type { PlayerSummary } from "./game";
import { ageOn } from "./game";

export interface SquadEntry { pid: string; price: number; how: string; season?: number }
export type Lookup = (id: string) => PlayerSummary | undefined;

export interface TeamLike { id: string; name: string; purse: number; startPurse: number; squad: SquadEntry[] }
export interface RulesLike { squadMin: number; squadMax: number; overseasMax: number; purse: number; reserveRule?: boolean }

export const isBowlOpt = (p: PlayerSummary) => p.role === "Bowler" || (p.role === "All-rounder" && p.ratings.bowl >= 50) || p.ratings.bowl >= 62;
export const isBatOpt = (p: PlayerSummary) => p.role !== "Bowler" || p.ratings.bat >= 60;

export function composition(team: TeamLike, look: Lookup) {
  const ps = team.squad.map((s) => ({ s, p: look(s.pid)! })).filter((x) => x.p);
  const c = { total: ps.length, indian: 0, overseas: 0, batters: 0, bowlers: 0, allrounders: 0, keepers: 0, pace: 0, spin: 0, capped: 0, uncapped: 0, spent: 0, avgPrice: 0, maxBuy: null as any, minBuy: null as any, avgAge: 0 };
  let ages = 0, agesN = 0;
  for (const { s, p } of ps) {
    if (p.overseas) c.overseas++; else c.indian++;
    if (p.role === "Batter") c.batters++;
    if (p.role === "Bowler") c.bowlers++;
    if (p.role === "All-rounder") c.allrounders++;
    if (p.role === "Wicket-keeper") c.keepers++;
    if (isBowlOpt(p) && p.bowlType === "Pace") c.pace++;
    if (isBowlOpt(p) && p.bowlType === "Spin") c.spin++;
    if (p.capped) c.capped++; else c.uncapped++;
    c.spent += s.price;
    if (!c.maxBuy || s.price > c.maxBuy.price) c.maxBuy = { pid: s.pid, name: p.name, price: s.price };
    if (!c.minBuy || s.price < c.minBuy.price) c.minBuy = { pid: s.pid, name: p.name, price: s.price };
    const a = ageOn(p.dob);
    if (a) { ages += a; agesN++; }
  }
  c.avgPrice = ps.length ? c.spent / ps.length : 0;
  c.avgAge = agesN ? +(ages / agesN).toFixed(1) : 0;
  return c;
}

export function bestXI(pids: string[], look: Lookup, overseasXI = 4, forced?: { include?: string[]; exclude?: string[] }) {
  const ex = new Set(forced?.exclude || []);
  const ps = pids.map(look).filter((p): p is PlayerSummary => !!p && !ex.has(p.id));
  const chosen: PlayerSummary[] = [];
  let os = 0;
  const can = (p: PlayerSummary) => !chosen.includes(p) && (!p.overseas || os < overseasXI);
  const add = (p?: PlayerSummary) => { if (p && can(p)) { chosen.push(p); if (p.overseas) os++; } };
  for (const id of forced?.include || []) add(ps.find((p) => p.id === id));
  // keeper
  if (!chosen.some((p) => p.role === "Wicket-keeper")) add([...ps].filter((p) => p.role === "Wicket-keeper").sort((a, b) => b.ratings.bat - a.ratings.bat).find(can));
  // 5 bowling options
  const bowlers = [...ps].filter(isBowlOpt).sort((a, b) => b.ratings.bowl - a.ratings.bowl);
  for (const b of bowlers) { if (chosen.filter(isBowlOpt).length >= 5) break; add(b); }
  // at least one spinner if available
  if (!chosen.some((p) => isBowlOpt(p) && p.bowlType === "Spin")) add(bowlers.find((b) => b.bowlType === "Spin" && can(b)));
  // fill with best batters, then best overall
  const bats = [...ps].filter((p) => p.role !== "Bowler").sort((a, b) => b.ratings.bat - a.ratings.bat);
  for (const b of bats) { if (chosen.length >= 11) break; add(b); }
  const rest = [...ps].sort((a, b) => b.ratings.overall - a.ratings.overall);
  for (const b of rest) { if (chosen.length >= 11) break; add(b); }
  // batting order: openers/top by bat rating, bowlers last
  const order = [...chosen].sort((a, b) => batOrderScore(b) - batOrderScore(a));
  const bowlingOrder = [...chosen].filter(isBowlOpt).sort((a, b) => b.ratings.bowl - a.ratings.bowl).slice(0, 6);
  return { xi: order.map((p) => p.id), bowling: bowlingOrder.map((p) => p.id), overseas: os };
}
function batOrderScore(p: PlayerSummary) {
  const roleAdj = p.role === "Bowler" ? -40 : p.role === "All-rounder" ? -6 : 0;
  return p.ratings.bat + roleAdj + (p.ppShare || 0) * 45 - (p.deathShare || 0) * 35;
}

export function captainPick(xi: string[], look: Lookup) {
  const ps = xi.map(look).filter(Boolean) as PlayerSummary[];
  const score = (p: PlayerSummary) => p.matches * 0.08 + p.ratings.overall * 0.6 + (p.capped ? 6 : 0) + (ageOn(p.dob) ? Math.min(8, Math.max(0, (ageOn(p.dob)! - 24))) : 0);
  const s = [...ps].sort((a, b) => score(b) - score(a));
  return { captain: s[0]?.id, vice: s[1]?.id, reason: s[0] ? `${s[0].name}: ${s[0].matches} IPL matches, overall rating ${s[0].ratings.overall}${s[0].capped ? ", international experience" : ""}.` : "" };
}

export interface TeamRating {
  batting: number; bowling: number; pace: number; spin: number; allround: number; keeping: number; bench: number; overseasBalance: number;
  versatility: number; financial: number; overall: number; strengths: string[]; weaknesses: string[];
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const topN = (a: number[], n: number) => [...a].sort((x, y) => y - x).slice(0, n);

export function teamRating(team: TeamLike, look: Lookup, overseasXI = 4): TeamRating {
  const pids = team.squad.map((s) => s.pid);
  const ps = pids.map(look).filter(Boolean) as PlayerSummary[];
  const { xi } = bestXI(pids, look, overseasXI);
  const xiP = xi.map(look).filter(Boolean) as PlayerSummary[];
  const fill = (arr: number[], n: number, v: number) => { const a = topN(arr, n); while (a.length < n) a.push(v); return a; };
  const batting = avg(fill(xiP.map((p) => p.ratings.bat), 7, 30));
  const bowling = avg(fill(xiP.filter(isBowlOpt).map((p) => p.ratings.bowl), 5, 25));
  const pace = avg(fill(ps.filter((p) => isBowlOpt(p) && p.bowlType === "Pace").map((p) => p.ratings.bowl), 4, 25));
  const spin = avg(fill(ps.filter((p) => isBowlOpt(p) && p.bowlType === "Spin").map((p) => p.ratings.bowl), 2, 25));
  const allround = avg(fill(ps.filter((p) => p.role === "All-rounder").map((p) => p.ratings.overall), 3, 30));
  const keeping = avg(fill(ps.filter((p) => p.role === "Wicket-keeper").map((p) => p.ratings.bat), 1, 20));
  const benchP = ps.filter((p) => !xi.includes(p.id)).map((p) => p.ratings.overall);
  const bench = avg(fill(benchP, 6, 30));
  const os = ps.filter((p) => p.overseas).length;
  const overseasBalance = Math.max(0, 100 - Math.abs(os - 7) * 9 - (xiP.filter((p) => p.overseas).length < 4 ? 8 : 0));
  const roles = new Set(ps.map((p) => p.role)).size;
  const multi = ps.filter((p) => p.ratings.bat >= 55 && p.ratings.bowl >= 55).length;
  const versatility = Math.min(100, roles * 14 + multi * 7 + (pace > 50 && spin > 50 ? 12 : 0));
  const spent = team.squad.reduce((a, s) => a + s.price, 0);
  const value = ps.reduce((a, p) => a + fairValue(p.ratings.overall, team.startPurse), 0);
  const financial = spent > 0 ? Math.max(0, Math.min(100, 50 + (value / spent - 1) * 45)) : 50;
  const overall = Math.round(
    (batting * 0.27 + bowling * 0.27 + allround * 0.1 + keeping * 0.06 + bench * 0.1 + overseasBalance * 0.06 + versatility * 0.06 + financial * 0.08) * 10,
  ) / 10;
  const r = { batting, bowling, pace, spin, allround, keeping, bench, overseasBalance, versatility, financial, overall };
  const labels: Record<string, string> = { batting: "Batting depth", bowling: "Bowling attack", pace: "Pace battery", spin: "Spin options", allround: "All-rounders", keeping: "Wicket-keeping", bench: "Bench strength", overseasBalance: "Overseas balance", versatility: "Versatility", financial: "Financial efficiency" };
  const entries = Object.entries(r).filter(([k]) => k !== "overall") as [string, number][];
  const strengths = entries.filter(([, v]) => v >= 72).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => labels[k]);
  const weaknesses = entries.filter(([, v]) => v < 55).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => labels[k]);
  const round = (x: number) => Math.round(x * 10) / 10;
  return { ...(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v)])) as any), strengths, weaknesses };
}

// Fair market value (calculated) for a given overall rating, scaled by purse size.
export function fairValue(overall: number, purse = 120) {
  const v = 0.3 * Math.exp((overall - 50) / 10.7);
  return Math.round(Math.min(30, v) * (purse / 120) * 100) / 100;
}

export const ROLE_TEMPLATE = { Batter: 6, "Wicket-keeper": 2, "All-rounder": 5, Pace: 5, Spin: 3 };
export function needs(team: TeamLike, look: Lookup, rules: RulesLike) {
  const c = composition(team, look);
  const ratio = rules.squadMin / 18;
  const want = Object.fromEntries(Object.entries(ROLE_TEMPLATE).map(([k, v]) => [k, Math.max(1, Math.round(v * ratio))])) as Record<string, number>;
  const have: Record<string, number> = { Batter: c.batters, "Wicket-keeper": c.keepers, "All-rounder": c.allrounders, Pace: 0, Spin: 0 };
  for (const s of team.squad) {
    const p = look(s.pid);
    if (p && p.role === "Bowler") have[p.bowlType === "Spin" ? "Spin" : "Pace"]++;
  }
  const gaps = Object.fromEntries(Object.keys(want).map((k) => [k, Math.max(0, want[k] - have[k])]));
  const slots = rules.squadMax - c.total;
  const minNeeded = Math.max(0, rules.squadMin - c.total);
  const reserve = rules.reserveRule ? Math.max(0, minNeeded - 1) * 0.3 : 0;
  const maxBid = Math.max(0, team.purse - reserve);
  return { gaps, have, want, slots, minNeeded, overseasLeft: rules.overseasMax - c.overseas, maxBid: Math.round(maxBid * 100) / 100, perSlot: minNeeded ? team.purse / minNeeded : team.purse };
}
export function slotKey(p: PlayerSummary) {
  return p.role === "Bowler" ? (p.bowlType === "Spin" ? "Spin" : "Pace") : p.role;
}

// Validate a purchase against rules. Returns reason string if invalid.
export function purchaseBlock(team: TeamLike, p: PlayerSummary, price: number, look: Lookup, rules: RulesLike): string | null {
  const c = composition(team, look);
  if (c.total >= rules.squadMax) return `Squad full (${rules.squadMax})`;
  if (p.overseas && c.overseas >= rules.overseasMax) return `Overseas limit reached (${rules.overseasMax})`;
  if (price > team.purse + 1e-9) return `Insufficient purse (${team.purse.toFixed(2)} cr left)`;
  if (rules.reserveRule) {
    const minNeededAfter = Math.max(0, rules.squadMin - c.total - 1);
    if (team.purse - price < minNeededAfter * 0.3 - 1e-9) return `Must keep ₹${(minNeededAfter * 0.3).toFixed(2)} cr to complete minimum squad`;
  }
  return null;
}

export function lotAdvice(p: PlayerSummary, currentBid: number | null, nextAmt: number, team: TeamLike, teams: TeamLike[], look: Lookup, rules: RulesLike) {
  const fv = fairValue(p.ratings.overall, rules.purse);
  const n = needs(team, look, rules);
  const key = slotKey(p);
  const need = (n.gaps[key] || 0) > 0;
  const demand = teams.filter((t) => {
    const nn = needs(t, look, rules);
    return t.id !== team.id && nn.maxBid >= nextAmt && (nn.gaps[key] || 0) > 0 && (!p.overseas || nn.overseasLeft > 0) && nn.slots > 0;
  });
  const recommendedMax = Math.round(Math.min(n.maxBid, fv * (need ? 1.3 : 0.85)) * 100) / 100;
  const block = purchaseBlock(team, p, nextAmt, look, rules);
  const flags: string[] = [];
  if (currentBid != null && currentBid < fv * 0.7) flags.push("Potential bargain");
  if (currentBid != null && currentBid > fv * 1.6) flags.push("Overpayment warning");
  if (n.perSlot < 0.5 && n.minNeeded > 0) flags.push("Budget pressure");
  const reason = [
    `Calculated fair value ${fv.toFixed(2)} cr from overall rating ${p.ratings.overall}.`,
    need ? `You still need ${n.gaps[key]} more ${key.toLowerCase()} option(s).` : `Your ${key.toLowerCase()} slots are already covered.`,
    `${demand.length} rival franchise(s) need this role and can afford ${nextAmt.toFixed(2)} cr.`,
    `Survival: ${n.minNeeded} slot(s) to minimum squad, ${n.perSlot.toFixed(2)} cr per slot.`,
  ];
  const verdict = block ? "Cannot bid" : nextAmt <= recommendedMax ? (need ? "Bid" : "Optional") : "Hold";
  return { fairValue: fv, recommendedMax, need, demand: demand.length, demandTeams: demand.map((t) => t.id), flags, reason, verdict, block, survival: n };
}

export function auctionGrade(team: TeamLike, all: TeamLike[], look: Lookup, overseasXI = 4) {
  const ratings = all.map((t) => ({ id: t.id, r: teamRating(t, look, overseasXI) }));
  const mine = ratings.find((x) => x.id === team.id)!.r;
  const rank = [...ratings].sort((a, b) => b.r.overall - a.r.overall).findIndex((x) => x.id === team.id) + 1;
  const value = team.squad.reduce((a, s) => { const p = look(s.pid); return a + (p ? fairValue(p.ratings.overall, team.startPurse) - s.price : 0); }, 0);
  const score = mine.overall + Math.max(-8, Math.min(8, value / 4)) - (rank - 1) * 0.6;
  const grade = score >= 78 ? "A+" : score >= 73 ? "A" : score >= 68 ? "B+" : score >= 63 ? "B" : score >= 58 ? "C+" : score >= 52 ? "C" : "D";
  const verdict = `${team.name} rank #${rank} of ${all.length} on calculated squad rating (${mine.overall}). Net value vs calculated fair prices: ${value >= 0 ? "+" : ""}${value.toFixed(1)} cr. ${mine.strengths.length ? "Strengths: " + mine.strengths.join(", ") + "." : ""} ${mine.weaknesses.length ? "Concerns: " + mine.weaknesses.join(", ") + "." : ""}`;
  return { grade, score: Math.round(score * 10) / 10, rank, value: Math.round(value * 10) / 10, verdict, rating: mine };
}

export function ownerProfile(teamId: string, bidLog: { team: string; pid: string; amount: number; lot: number }[], purchases: { team: string; pid: string; price: number; base: number }[], look: Lookup, purse: number) {
  const myBids = bidLog.filter((b) => b.team === teamId);
  const lotsBid = new Set(myBids.map((b) => b.lot)).size;
  const totalLots = new Set(bidLog.map((b) => b.lot)).size || 1;
  const mine = purchases.filter((p) => p.team === teamId);
  const ps = mine.map((m) => ({ m, p: look(m.pid)! })).filter((x) => x.p);
  const spent = mine.reduce((a, m) => a + m.price, 0);
  const overpay = ps.length ? avg(ps.map(({ m, p }) => m.price / Math.max(0.2, fairValue(p.ratings.overall, purse)))) : 1;
  const overseasShare = spent ? ps.filter((x) => x.p.overseas).reduce((a, x) => a + x.m.price, 0) / spent : 0;
  const ages = ps.map((x) => ageOn(x.p.dob)).filter(Boolean) as number[];
  const avgAge = ages.length ? avg(ages) : 0;
  const prices = mine.map((m) => m.price);
  const top = prices.length ? Math.max(...prices) / Math.max(1, spent) : 0;
  const roleSpend: Record<string, number> = {};
  for (const { m, p } of ps) roleSpend[p.role] = (roleSpend[p.role] || 0) + m.price;
  const fav = Object.entries(roleSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const traits = {
    aggression: Math.round(Math.min(100, (lotsBid / totalLots) * 140)),
    spending: Math.round(Math.min(100, (spent / purse) * 100)),
    overseasFocus: Math.round(overseasShare * 100),
    youthPreference: avgAge ? Math.round(Math.max(0, Math.min(100, (32 - avgAge) * 12))) : 50,
    experiencePreference: ps.length ? Math.round(Math.min(100, avg(ps.map((x) => x.p.matches)) / 1.2)) : 0,
    riskTaking: Math.round(Math.min(100, top * 160)),
    budgetDiscipline: Math.round(Math.max(0, Math.min(100, 120 - overpay * 60))),
  };
  const archetype = traits.aggression > 70 && traits.spending > 85 ? "The Aggressor" : traits.budgetDiscipline > 70 ? "The Moneyballer" : traits.riskTaking > 55 ? "The Star Chaser" : traits.youthPreference > 65 ? "The Youth Scout" : "The Balanced Owner";
  return { traits, archetype, favouriteRole: fav, lotsBid, purchases: mine.length, spent: Math.round(spent * 100) / 100, avgOverpay: Math.round(overpay * 100) / 100, avgAge: Math.round(avgAge * 10) / 10 };
}

export function potential(p: PlayerSummary) {
  const a = ageOn(p.dob) || 27;
  const youth = Math.max(0, 27 - a) * 2.2;
  const form = p.ratings.form ? (p.ratings.form - p.ratings.overall) * 0.4 : 0;
  return Math.round(Math.min(99, p.ratings.overall + youth + form) * 10) / 10;
}
