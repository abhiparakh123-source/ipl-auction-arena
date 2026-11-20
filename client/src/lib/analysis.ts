// Client-side mirror of the server's team analysis, used for the real 2026 squads
// (read-only reference data). Room analysis always comes from the authoritative server.
import type { PlayerSummary } from "@shared/game";
import { FRANCHISES, round2 } from "@shared/game";
import { teamRating, composition, needs, bestXI, captainPick, auctionGrade, fairValue, type TeamLike, type Lookup } from "@shared/analytics";

export function realTeams(list: PlayerSummary[]): TeamLike[] {
  return FRANCHISES.map((f) => {
    const squad = list.filter((p) => p.team2026 === f.id).map((p) => ({ pid: p.id, price: p.price2026 || 0, how: "2026 squad" }));
    const spent = squad.reduce((a, s) => a + s.price, 0);
    return { id: f.id, name: f.name, purse: round2(Math.max(0, 120 - spent)), startPurse: 120, squad };
  });
}

export function analyzeLocal(teams: TeamLike[], tid: string, look: Lookup, rules = { squadMin: 18, squadMax: 25, overseasMax: 8, purse: 120 }) {
  const t = teams.find((x) => x.id === tid)!;
  const rating = teamRating(t, look);
  const comp = composition(t, look);
  const nd = needs(t, look, rules);
  const xi = bestXI(t.squad.map((x) => x.pid), look, 4);
  const cap = captainPick(xi.xi, look);
  const grade = auctionGrade(t, teams, look);
  const rivals = teams.filter((x) => x.id !== tid).map((x) => ({ id: x.id, short: x.id, rating: teamRating(x, look).overall, purse: x.purse, squad: x.squad.length }));
  const value = t.squad.map((s) => { const p = look(s.pid)!; const fv = fairValue(p.ratings.overall, rules.purse); return { pid: s.pid, name: p.name, price: s.price, fair: fv, ratio: s.price ? round2(fv / s.price) : null, how: s.how }; }).sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  const weak: string[] = [];
  if (rating.spin < 55) weak.push(`Spin: best spin options average ${rating.spin} (calculated). A front-line spinner would help.`);
  if (rating.pace < 55) weak.push(`Pace: pace attack averages ${rating.pace}. A death-overs specialist would help.`);
  if (rating.keeping < 50) weak.push(`Keeping: no strong wicket-keeper batter (${rating.keeping}).`);
  if (rating.batting < 60) weak.push(`Top-order batting averages ${rating.batting}.`);
  if (comp.overseas < 4) weak.push(`Only ${comp.overseas} overseas players; XI may not use all 4 overseas slots.`);
  if (rating.bench < 45) weak.push(`Thin bench (${rating.bench}); injuries would expose the XI.`);
  const combos = [
    { label: "Batting-heavy (6 batters, 5 bowlers)", xi: xi.xi },
    { label: "Extra bowler (7 bowling options)", xi: bestXI(t.squad.map((x) => x.pid).sort((a, b) => (look(b)?.ratings.bowl || 0) - (look(a)?.ratings.bowl || 0)), look, 4).xi },
  ];
  return { rating, composition: comp, needs: nd, xi, captain: cap, grade, rivals, value, weaknesses: weak, combos, profile: null as any, explanation: "Ratings combine historical IPL data (Cricsheet, 2008-2026) into calculated scores. Batting uses the top 7 batters of the auto-selected XI; bowling uses the best 5 bowling options." };
}
