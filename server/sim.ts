// SIMULATED match engine. Outcomes are model-generated from real Cricsheet phase distributions,
// never recorded as historical statistics.
import { BASELINE, INTL_META, getPlayer, getSummary } from "./data";
import { PITCHES, FORMATS, type Pitch, type CommentaryStyle, type Format } from "@shared/game";
import { isBowlOpt } from "@shared/analytics";

export interface Lineup { id: string; name: string; short: string; xi: string[]; bowling?: string[]; captain?: string; keeper?: string; impact?: { in: string; out: string } | null; color?: string }
export interface SimOpts { venue?: string; pitch?: Pitch; seed?: number; style?: CommentaryStyle; commentary?: boolean; adj?: Record<string, number>; homeTeam?: string; format?: Format }

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Phase = "pp" | "mid" | "death";
// Per-format phase boundaries (overs within an innings) and real Cricsheet outcome distributions.
const PHASE_CUT: Record<Format, [number, number]> = { ipl: [6, 15], t20i: [6, 15], odi: [10, 40], test: [20, 80] };
const phaseFor = (fmt: Format, over: number): Phase => { const [a, b] = PHASE_CUT[fmt]; return over < a ? "pp" : over < b ? "mid" : "death"; };
const DISTS: Record<Format, Record<Phase, Record<string, number>>> = {
  ipl: BASELINE.phase, t20i: INTL_META.baseline.t20i.phase, odi: INTL_META.baseline.odi.phase, test: INTL_META.baseline.test.phase,
};
const LEAGUES: Record<Format, Record<Phase, { rpb: number; w: number }>> = {} as any;
for (const fmt of Object.keys(DISTS) as Format[]) {
  LEAGUES[fmt] = {} as any;
  for (const ph of ["pp", "mid", "death"] as Phase[]) {
    const d = DISTS[fmt][ph];
    let legal = 0, runs = 0;
    for (const k of ["0", "1", "2", "3", "4", "5", "6", "W", "bye"]) {
      legal += d[k] || 0;
      if (/^\d$/.test(k)) runs += +k * d[k];
    }
    LEAGUES[fmt][ph] = { rpb: runs / legal, w: (d.W || 0) / legal };
  }
}
// Scoring calibration per format so simulated averages track the real baselines.
const CAL: Record<Format, number> = { ipl: 1.035, t20i: 1.035, odi: 1.03, test: 1.03 };
const WCAL: Record<Format, number> = { ipl: 1, t20i: 1, odi: 0.9, test: 0.8 };
const K: Record<Format, [number, number]> = { ipl: [120, 260], t20i: [120, 260], odi: [240, 500], test: [400, 900] };
const phaseData = (p: any, fmt: Format, kind: "bat" | "bowl") => (fmt === "ipl" ? (kind === "bat" ? p?.ipl?.phaseBat : p?.ipl?.phaseBowl) : (kind === "bat" ? p?.intl?.[fmt]?.pb : p?.intl?.[fmt]?.pw));
const VENUE_AVG = Object.values<number>(BASELINE.venueFirstInnings).reduce((a, b) => a + b, 0) / Object.keys(BASELINE.venueFirstInnings).length;

interface Factor { sr: number; out: number }
const cache = new Map<string, any>();
function batFactor(pid: string, ph: Phase, adj = 1, fmt: Format = "ipl"): Factor {
  const key = `b${fmt}${pid}${ph}`;
  let f = cache.get(key);
  if (!f) {
    const p = getPlayer(pid);
    const s = getSummary(pid);
    const L = LEAGUES[fmt][ph];
    const d = phaseData(p, fmt, "bat")?.[ph];
    const tail = s?.role === "Bowler";
    const priorSR = tail ? 0.75 : s?.custom ? 0.8 + (s.ratings.bat - 40) / 100 : 1.0;
    const priorOut = tail ? (fmt === "test" ? 2.6 : 1.7) : 1.05;
    const [k, k2] = K[fmt];
    const runs = d?.runs || 0, balls = d?.balls || 0, outs = d?.outs || 0;
    const sr = (runs + k * L.rpb * priorSR) / (balls + k) / L.rpb;
    const out = (outs + k2 * L.w * priorOut) / (balls + k2) / L.w;
    f = { sr, out };
    cache.set(key, f);
  }
  return { sr: f.sr * adj, out: f.out / adj };
}
function bowlFactor(pid: string, ph: Phase, adj = 1, fmt: Format = "ipl"): Factor {
  const key = `w${fmt}${pid}${ph}`;
  let f = cache.get(key);
  if (!f) {
    const p = getPlayer(pid);
    const s = getSummary(pid);
    const L = LEAGUES[fmt][ph];
    const d = phaseData(p, fmt, "bowl")?.[ph];
    const part = s?.role === "Batter" || s?.role === "Wicket-keeper";
    const priorE = part ? 1.18 : 1.03;
    const priorW = part ? 0.6 : 0.95;
    const [k, k2] = fmt === "ipl" || fmt === "t20i" ? [150, 300] : K[fmt];
    const runs = d?.runs || 0, balls = d?.balls || 0, w = d?.wkts || 0;
    f = { sr: (runs + k * L.rpb * priorE) / (balls + k) / L.rpb, out: (w + k2 * L.w * priorW) / (balls + k2) / L.w };
    cache.set(key, f);
  }
  return { sr: f.sr / adj, out: f.out * adj };
}
export function clearSimCache() { cache.clear(); }

const nm = (pid: string) => getSummary(pid)?.name || pid;
const sur = (pid: string) => { const n = nm(pid).split(" "); return n.length > 1 ? n[n.length - 1] : n[0]; };

// ---------------- Commentary (all labelled simulated) ----------------
const T: Record<CommentaryStyle, Record<string, string[]>> = {
  pro: {
    "0": ["{b} to {s}, defended back down the pitch.", "{b} to {s}, beaten outside off. Dot ball.", "{b} to {s}, pushed to cover, no run."],
    "1": ["{b} to {s}, worked into the leg side for a single.", "{b} to {s}, dabbed to third for one.", "{b} to {s}, driven to long-off, they take one."],
    "2": ["{b} to {s}, placed into the gap, they come back for two.", "{b} to {s}, clipped wide of deep square, two runs."],
    "3": ["{b} to {s}, chased down just inside the rope, three taken."],
    "4": ["{b} to {s}, FOUR. Driven crisply through the covers.", "{b} to {s}, FOUR. Pulled in front of square.", "{b} to {s}, FOUR. Late cut, beats short third."],
    "6": ["{b} to {s}, SIX. Lofted cleanly over long-on.", "{b} to {s}, SIX. Picked up off the pads over fine leg.", "{b} to {s}, SIX. Into the second tier."],
    W: ["{b} to {s}, OUT. {how}. {s} departs for {r} ({bb}).", "{b} to {s}, WICKET. {how}. A big moment in this innings."],
    wd: ["{b} to {s}, wide down the leg side."], nb: ["{b} to {s}, no-ball. Free hit coming up."], bye: ["{b} to {s}, beats everyone, byes."],
    RO: ["{b} to {s}, RUN OUT. Mix-up in the middle, {s} is short of the crease."],
  },
  energetic: {
    "0": ["Dot! {b} wins that one against {s}!", "Nothing doing for {s}! Tight from {b}!"],
    "1": ["Quick single, {s} keeps it ticking!", "Just a nudge and they scamper through!"],
    "2": ["Running hard! Two for {s}!", "They push for the second and make it easily!"],
    "3": ["Three! Fantastic running between the wickets!"],
    "4": ["BANG! FOUR! {s} absolutely creams it!", "Cracking shot! That races away to the fence!", "FOUR! {b} gets punished!"],
    "6": ["BOOM! That is HUGE from {s}! SIX!", "Out of the park! {s} launches {b} into orbit!", "MAXIMUM! The crowd goes wild!"],
    W: ["GONE! {how}! {b} strikes and {s} has to walk for {r}!", "WICKET! What a moment! {how}!"],
    wd: ["Wide! {b} loses his radar there!"], nb: ["No-ball! FREE HIT incoming!"], bye: ["Byes! Through the keeper!"],
    RO: ["RUN OUT! Chaos in the middle! {s} is gone!"],
  },
  tactical: {
    "0": ["{b} hits a hard length; {s} has no room to free the arms. Dot.", "Good change of pace from {b}, {s} mistimes. Pressure builds."],
    "1": ["{s} rotates strike against the field set deep, single.", "Soft hands from {s}, uses the angle for one."],
    "2": ["{s} targets the bigger side of the ground, two.", "Gap exploited between deep point and third man, two."],
    "3": ["Long boundary on that side pays off for the batting side, three."],
    "4": ["{s} manipulates the field, FOUR through the vacant region.", "Length too full from {b}; {s} drives for FOUR."],
    "6": ["{s} pre-meditates, clears the front leg, SIX over the short side.", "Slot ball, {s} hits through the line for SIX."],
    W: ["The plan works: {how}. {s} out for {r} from {bb}.", "Wicket from the matchup {b} wanted: {how}."],
    wd: ["Missed the wide-line yorker, wide called."], nb: ["Overstepped; tactical cost of a free hit."], bye: ["Keeper unsighted, byes conceded."],
    RO: ["Poor communication: run out. {s} has to go."],
  },
  friends: {
    "0": ["{s} blocks it like it owes him money. Dot.", "Nothing. {b} is laughing at {s} right now."],
    "1": ["One run. Very responsible. Very boring.", "{s} takes a single and pretends that was the plan."],
    "2": ["Two runs, and somebody's uncle is shouting 'run faster'."],
    "3": ["Three runs! Cardio session for both batters."],
    "4": ["FOUR! {s} said 'not today, {b}'.", "Boundary! Somebody check on {b}'s confidence."],
    "6": ["SIX! That ball has a passport now.", "SIX! {s} has sent it to the parking lot."],
    W: ["OUT! {how}. {s} walks off thinking about life choices. {r} runs.", "Gone! {b} does the celebration he practised in the mirror."],
    wd: ["Wide. {b}, the stumps are over there."], nb: ["No-ball! Free hit, everyone get excited."], bye: ["Byes. Keeper was checking his phone."],
    RO: ["Run out! Classic 'yes-no-sorry'."],
  },
};
function line(style: CommentaryStyle, k: string, r: () => number, v: Record<string, string | number>) {
  const arr = T[style][k] || T.pro[k] || [""];
  let s = arr[Math.floor(r() * arr.length)];
  for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(String(b));
  return s;
}

// --------------- Core innings ---------------
interface BatRow { pid: string; runs: number; balls: number; f4: number; s6: number; dots: number; out: string | null; outKind?: string; bowler?: string; fielder?: string }
interface BowlRow { pid: string; balls: number; runs: number; wkts: number; dots: number; wd: number; nb: number; maidens: number; f4: number; s6: number }
export interface Innings {
  team: string; bowlingTeam: string; runs: number; wkts: number; balls: number; extras: { wd: number; nb: number; b: number; lb: number };
  batting: BatRow[]; bowling: BowlRow[]; fow: { score: number; wkt: number; pid: string; over: string }[]; partnerships: { a: string; b: string; runs: number; balls: number }[];
  overs: { over: number; runs: number; wkts: number; bowler: string; total: number }[]; target?: number; f4: number; s6: number; catches: Record<string, number>; stumpings: Record<string, number>;
  commentary: { ball: string; text: string; kind: string }[]; allOut: boolean; declared?: boolean;
}

function planBowler(over: number, opts: string[], used: Record<string, number>, last: string | null, r: () => number, ph: Phase, maxOvers: number, totalOvers: number, fmt: Format = "ipl") {
  if (maxOvers >= 999) {
    // Tests: no quota. Spread the work with a fatigue penalty; never the same bowler in consecutive overs.
    const sc = (pid: string) => { const f = bowlFactor(pid, ph, 1, fmt); return (f.out * 1.2 - f.sr) - ((used[pid] || 0) / (over + 1)) * 2.2 + r() * 0.3; };
    const c = opts.filter((o) => o !== last);
    return (c.length ? c : opts).sort((a, b) => sc(b) - sc(a))[0];
  }
  const remainingAfter = totalOvers - over - 1;
  const feasible = (pick: string) => {
    if ((used[pick] || 0) >= maxOvers || pick === last) return false;
    const caps = opts.map((o) => maxOvers - (used[o] || 0) - (o === pick ? 1 : 0));
    const sum = caps.reduce((a, b) => a + Math.max(0, b), 0);
    const mx = Math.max(...caps);
    return sum >= remainingAfter && mx <= Math.ceil(remainingAfter / 2) + (remainingAfter % 2 === 0 ? 0 : 0) + 1;
  };
  const score = (pid: string) => {
    const f = bowlFactor(pid, ph, 1, fmt);
    return (f.out * 1.2 - f.sr) + r() * 0.25;
  };
  let cands = opts.filter(feasible);
  if (!cands.length) cands = opts.filter((o) => (used[o] || 0) < maxOvers && o !== last);
  if (!cands.length) cands = opts.filter((o) => o !== last);
  return cands.sort((a, b) => score(b) - score(a))[0];
}

function pickWeighted(d: Record<string, number>, r: () => number) {
  let t = 0;
  for (const v of Object.values(d)) t += v;
  let x = r() * t;
  for (const [k, v] of Object.entries(d)) { x -= v; if (x <= 0) return k; }
  return "0";
}

interface InnExtra { declare?: (runs: number, wkts: number, oversBowled: number) => boolean; superOver?: boolean; matchBallsLeft?: number }
function innings(bat: Lineup, bowl: Lineup, bowlOpts: string[], o: Required<Pick<SimOpts, "pitch" | "style">> & SimOpts, r: () => number, target: number | null, totalOvers = 20, maxWkts = 10, maxOvers = 4, ex: InnExtra = {}): Innings {
  const fmt: Format = o.format || "ipl";
  const FD = FORMATS[fmt];
  const DIST = DISTS[fmt];
  const testFmt = fmt === "test";
  const pitch = PITCHES[o.pitch];
  const venueF = o.venue && BASELINE.venueFirstInnings[o.venue] ? BASELINE.venueFirstInnings[o.venue] / VENUE_AVG : 1;
  const runF = pitch.runs * venueF;
  const order = [...bat.xi];
  const rows: BatRow[] = order.map((pid) => ({ pid, runs: 0, balls: 0, f4: 0, s6: 0, dots: 0, out: null }));
  const brow: Record<string, BowlRow> = {};
  const inn: Innings = { team: bat.id, bowlingTeam: bowl.id, runs: 0, wkts: 0, balls: 0, extras: { wd: 0, nb: 0, b: 0, lb: 0 }, batting: rows, bowling: [], fow: [], partnerships: [], overs: [], target: target ?? undefined, f4: 0, s6: 0, catches: {}, stumpings: {}, commentary: [], allOut: false };
  let striker = 0, non = 1, next = 2;
  let pship = { a: order[0], b: order[1], runs: 0, balls: 0 };
  const used: Record<string, number> = {};
  let last: string | null = null;
  let freeHit = false;
  const keeper = bowl.keeper || bowl.xi.find((p) => getSummary(p)?.role === "Wicket-keeper") || bowl.xi[0];
  const fielders = bowl.xi;
  for (let ov = 0; ov < totalOvers; ov++) {
    if (inn.wkts >= maxWkts || (target != null && inn.runs >= target)) break;
    if (ex.declare && ov > 0 && ex.declare(inn.runs, inn.wkts, ov)) { inn.declared = true; break; }
    const ph = ex.superOver ? "death" : phaseFor(fmt, ov);
    const bw = planBowler(ov, bowlOpts, used, last, r, ph, maxOvers, totalOvers, fmt);
    used[bw] = (used[bw] || 0) + 1;
    last = bw;
    const B = (brow[bw] ||= { pid: bw, balls: 0, runs: 0, wkts: 0, dots: 0, wd: 0, nb: 0, maidens: 0, f4: 0, s6: 0 });
    const bType = getSummary(bw)?.bowlType;
    const typeF = bType === "Spin" ? pitch.spin : pitch.pace;
    let legal = 0, overRuns = 0, overW = 0, bowlerRunsOver = 0;
    while (legal < 6) {
      if (inn.wkts >= maxWkts || (target != null && inn.runs >= target)) break;
      const sp = order[striker];
      const bf = batFactor(sp, ph, o.adj?.[sp] ?? 1, fmt);
      const wf = bowlFactor(bw, ph, o.adj?.[bw] ?? 1, fmt);
      let m = Math.pow(bf.sr * wf.sr * runF * CAL[fmt], 1.2);
      let wm = bf.out * wf.out * typeF / Math.sqrt(runF) * WCAL[fmt];
      // Test pitches wear: spin grows more dangerous later in the match.
      if (testFmt && ex.matchBallsLeft != null && bType === "Spin") wm *= 1 + Math.max(0, (2700 - ex.matchBallsLeft) / 2700) * 0.35;
      if (target != null && !testFmt) {
        const ballsLeft = totalOvers * 6 - inn.balls;
        const need = target - inn.runs;
        const rrr = ballsLeft > 0 ? (need / ballsLeft) * 6 : 99;
        const hi = FD.par * 1.05, lo = FD.par * 0.82;
        if (rrr > hi) { m *= 1 + Math.min(0.3, (rrr - hi) * 0.04 * (8.6 / FD.par)); wm *= 1 + Math.min(0.8, (rrr - hi) * 0.09 * (8.6 / FD.par)); }
        if (ballsLeft <= totalOvers * 1.5 && 10 - inn.wkts >= 5) { m *= 1.08; wm *= 1.2; }
        else if (rrr < lo) { wm *= 0.85; m *= 0.95; }
      } else if (target != null && testFmt) {
        const ballsLeft = totalOvers * 6 - inn.balls;
        const need = target - inn.runs;
        const rpo = ballsLeft > 0 ? (need / ballsLeft) * 6 : 99;
        if (rpo > 4.2) { m *= 0.85; wm *= 0.62; } // batting for the draw
        else if (rpo > 3.2) { m *= 1.0; wm *= 0.9; }
        else if (rpo < 2.5) { m *= 1.08; wm *= 1.05; }
      } else if (testFmt && ex.declare && inn.runs > 250) { m *= 1.06; }
      if (inn.wkts >= 7) wm *= 1.1;
      const d = { ...DIST[ph] };
      d["4"] *= m * m; d["6"] *= m * m * (ph === "pp" ? 1 : 1.05); d["2"] *= m; d["3"] *= m;
      d["0"] /= m; d.W *= wm; d.RO *= 1;
      if (freeHit) { d.W = 0; }
      const k = pickWeighted(d, r);
      const label = `${ov}.${legal + 1}`;
      const sRow = rows[striker];
      const vv: Record<string, string | number> = { b: sur(bw), s: sur(sp) };
      let kind = k;
      let text = "";
      if (k === "wd") {
        inn.runs += 1; inn.extras.wd++; B.runs += 1; B.wd++; overRuns++; bowlerRunsOver++; pship.runs++;
        text = line(o.style, "wd", r, vv);
      } else if (k === "nb") {
        inn.runs += 1; inn.extras.nb++; B.runs += 1; B.nb++; overRuns++; bowlerRunsOver++; pship.runs++;
        // runs off the bat on the no-ball
        const off = pickWeighted({ "0": 0.45, "1": 0.3, "4": 0.15, "6": 0.1 }, r);
        const n = +off;
        inn.runs += n; B.runs += n; sRow.runs += n; sRow.balls++; overRuns += n; bowlerRunsOver += n; pship.runs += n; pship.balls++;
        if (n === 4) { sRow.f4++; inn.f4++; B.f4++; } if (n === 6) { sRow.s6++; inn.s6++; B.s6++; }
        text = line(o.style, "nb", r, vv) + (n ? ` ${n} off the bat.` : "");
        freeHit = true;
        if (n % 2 === 1) [striker, non] = [non, striker];
      } else {
        legal++; inn.balls++; B.balls++; sRow.balls++; pship.balls++;
        const wasFree = freeHit; freeHit = false;
        if (k === "W" || k === "RO") {
          let how = "";
          let outPid = sp;
          if (k === "RO") {
            const f = fielders[Math.floor(r() * fielders.length)];
            how = `run out (${sur(f)})`;
            if (r() < 0.4) outPid = order[non];
          } else {
            const x = r();
            const spin = bType === "Spin";
            if (x < 0.6) {
              const ck = r() < 0.12 ? keeper : r() < 0.05 ? bw : fielders[Math.floor(r() * fielders.length)];
              how = ck === bw ? `c & b ${sur(bw)}` : `c ${ck === keeper ? "†" : ""}${sur(ck)} b ${sur(bw)}`;
              inn.catches[ck] = (inn.catches[ck] || 0) + 1;
              rows.find((x) => x.pid === outPid)!.fielder = ck;
            } else if (x < 0.78) how = `b ${sur(bw)}`;
            else if (x < 0.93) how = `lbw b ${sur(bw)}`;
            else if (spin && x < 0.985) { how = `st †${sur(keeper)} b ${sur(bw)}`; inn.stumpings[keeper] = (inn.stumpings[keeper] || 0) + 1; }
            else how = `c ${sur(fielders[Math.floor(r() * fielders.length)])} b ${sur(bw)}`;
            B.wkts++; overW++;
          }
          sRow.dots++; B.dots++;
          const oRow = rows.find((x) => x.pid === outPid)!;
          oRow.out = how; oRow.outKind = k === "RO" ? "runout" : "bowler"; oRow.bowler = k === "RO" ? undefined : bw;
          inn.wkts++;
          inn.fow.push({ score: inn.runs, wkt: inn.wkts, pid: outPid, over: `${ov}.${legal}` });
          inn.partnerships.push(pship);
          text = line(o.style, k, r, { ...vv, s: sur(outPid), how, r: oRow.runs, bb: oRow.balls });
          kind = "W";
          if (inn.wkts < maxWkts && next < order.length) {
            if (outPid === order[striker]) striker = next; else non = next;
            next++;
            pship = { a: order[striker], b: order[non], runs: 0, balls: 0 };
          } else if (inn.wkts < maxWkts) { inn.wkts = maxWkts; }
          void wasFree;
        } else if (k === "bye") {
          const n = r() < 0.8 ? 1 : 4;
          inn.runs += n; inn.extras[r() < 0.5 ? "b" : "lb"] += n; overRuns += n; pship.runs += n; B.dots++;
          text = line(o.style, "bye", r, vv) + ` ${n} run${n > 1 ? "s" : ""}.`;
          if (n % 2 === 1) [striker, non] = [non, striker];
        } else {
          const n = +k;
          inn.runs += n; sRow.runs += n; B.runs += n; overRuns += n; bowlerRunsOver += n; pship.runs += n;
          if (n === 0) { sRow.dots++; B.dots++; }
          if (n === 4) { sRow.f4++; inn.f4++; B.f4++; } if (n === 6) { sRow.s6++; inn.s6++; B.s6++; }
          text = line(o.style, String(n), r, vv);
          if (n % 2 === 1) [striker, non] = [non, striker];
        }
      }
      if (o.commentary !== false && (!testFmt || !/^[0123]$/.test(kind))) inn.commentary.push({ ball: label, text, kind });
    }
    if (legal === 6 && bowlerRunsOver === 0) B.maidens++;
    inn.overs.push({ over: ov + 1, runs: overRuns, wkts: overW, bowler: bw, total: inn.runs });
    [striker, non] = [non, striker];
  }
  if (pship.balls > 0 || pship.runs > 0) inn.partnerships.push(pship);
  inn.allOut = inn.wkts >= maxWkts;
  inn.bowling = Object.values(brow);
  // keep only batters who batted
  const batted = new Set<string>([order[0], order[1], ...inn.fow.map((f) => f.pid)]);
  for (let i = 0; i < Math.min(next, order.length); i++) batted.add(order[i]);
  inn.batting = rows.map((x) => (batted.has(x.pid) ? x : { ...x, out: "dnb" }));
  for (const x of inn.batting) if (x.out === null) x.out = "not out";
  return inn;
}

export function bowlingOptions(l: Lineup, max = 7) {
  const base = (l.bowling && l.bowling.length >= 5 ? l.bowling : l.xi.filter((p) => { const s = getSummary(p); return s && isBowlOpt(s); }));
  let opts = base.filter((p) => l.xi.includes(p) || p === l.impact?.in);
  if (opts.length < 5) {
    const extra = l.xi.filter((p) => !opts.includes(p)).sort((a, b) => (getSummary(b)?.ratings.bowl || 0) - (getSummary(a)?.ratings.bowl || 0));
    opts = [...opts, ...extra.slice(0, 5 - opts.length)];
  }
  if (opts.length < 6) {
    const sixth = l.xi.filter((p) => !opts.includes(p)).sort((a, b) => (getSummary(b)?.ratings.bowl || 0) - (getSummary(a)?.ratings.bowl || 0))[0];
    if (sixth) opts.push(sixth);
  }
  return opts.slice(0, max);
}

export interface MatchResult {
  simulated: true; seed: number; venue: string; pitch: Pitch; style: CommentaryStyle; toss: { winner: string; decision: "bat" | "bowl" };
  teams: [Pick<Lineup, "id" | "name" | "short" | "color">, Pick<Lineup, "id" | "name" | "short" | "color">]; xi: Record<string, string[]>;
  innings: Innings[]; superOver?: Innings[]; winner: string | null; margin: string; pom: { pid: string; reason: string } | null; checks: { ok: boolean; issues: string[] };
  impact: Record<string, { in: string; out: string } | null>; format: Format; draw?: boolean;
}

export function simulateMatch(A: Lineup, B: Lineup, opts: SimOpts = {}): MatchResult {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const r = rng(seed);
  const o = { pitch: opts.pitch || "balanced", style: opts.style || "pro", ...opts } as Required<Pick<SimOpts, "pitch" | "style">> & SimOpts;
  const fmt: Format = o.format || "ipl";
  if (fmt !== "ipl") { A = { ...A, impact: null }; B = { ...B, impact: null }; }
  if (fmt === "test") return simulateTest(A, B, o, r, seed);
  const FD = FORMATS[fmt];
  const OV = FD.overs!, BMAX = FD.bowlerMax!;
  const tossW = r() < 0.5 ? A : B;
  const chaseBias = fmt === "odi" ? 0.5 : 0.62; // T20 captains have chosen to bowl first in most recent games
  const decision: "bat" | "bowl" = r() < chaseBias ? "bowl" : "bat";
  const first = (tossW === A) === (decision === "bat") ? A : B;
  const second = first === A ? B : A;
  // Impact player: team batting first adds a bowler for the second innings; team chasing adds a batter.
  const firstBowlL: Lineup = { ...second, xi: second.xi };
  const in1 = innings(first, firstBowlL, bowlingOptions(second), o, r, null, OV, 10, BMAX);
  const firstAfter: Lineup = { ...first };
  if (first.impact && first.xi.includes(first.impact.out) && !first.xi.includes(first.impact.in)) firstAfter.xi = first.xi.map((p) => (p === first.impact!.out ? first.impact!.in : p));
  const secondBat: Lineup = { ...second };
  if (second.impact && second.xi.includes(second.impact.out) && !second.xi.includes(second.impact.in)) {
    // replace out player in batting order (out player already bowled in innings 1)
    const xi = second.xi.filter((p) => p !== second.impact!.out);
    const pos = Math.min(xi.length, Math.max(3, second.xi.indexOf(second.impact.out)));
    xi.splice(pos, 0, second.impact.in);
    secondBat.xi = xi;
  }
  const in2 = innings(secondBat, firstAfter, bowlingOptions(firstAfter), o, r, in1.runs + 1, OV, 10, BMAX);
  let winner: string | null = null, margin = "";
  let superOver: Innings[] | undefined;
  if (in2.runs > in1.runs) { winner = second.id; margin = `${second.short} won by ${10 - in2.wkts} wicket${10 - in2.wkts === 1 ? "" : "s"} (${OV * 6 - in2.balls} balls left)`; }
  else if (in1.runs > in2.runs) { winner = first.id; margin = `${first.short} won by ${in1.runs - in2.runs} run${in1.runs - in2.runs === 1 ? "" : "s"}`; }
  else {
    superOver = [];
    for (let k = 0; k < 3 && !winner; k++) {
      const top = (l: Lineup) => ({ ...l, xi: [...l.xi].sort((a, b) => (getSummary(b)?.ratings.bat || 0) - (getSummary(a)?.ratings.bat || 0)).slice(0, 3) });
      const bestBowler = (l: Lineup) => [bowlingOptions(l).sort((a, b) => (getSummary(b)?.ratings.bowl || 0) - (getSummary(a)?.ratings.bowl || 0))[0]];
      const s1 = innings(top(secondBat), firstAfter, bestBowler(firstAfter), { ...o, commentary: true }, r, null, 1, 2, 1, { superOver: true });
      const s2 = innings(top(firstAfter), secondBat, bestBowler(secondBat), { ...o, commentary: true }, r, s1.runs + 1, 1, 2, 1, { superOver: true });
      superOver.push(s1, s2);
      if (s2.runs > s1.runs) winner = first.id; else if (s1.runs > s2.runs) winner = second.id;
    }
    if (!winner) { const b1 = in1.f4 + in1.s6, b2 = in2.f4 + in2.s6; winner = b1 >= b2 ? first.id : second.id; }
    margin = `Match tied. ${winner === A.id ? A.short : B.short} won the Super Over`;
  }
  const { pom, issues } = pomAndChecks([in1, in2], winner, A, B, fmt);
  return {
    simulated: true, seed, venue: opts.venue || "Neutral venue", pitch: o.pitch, style: o.style, toss: { winner: tossW.id, decision },
    teams: [{ id: first.id, name: first.name, short: first.short, color: first.color }, { id: second.id, name: second.name, short: second.short, color: second.color }],
    xi: { [first.id]: first.xi, [second.id]: second.xi },
    innings: [in1, in2], superOver, winner, margin, pom, checks: { ok: issues.length === 0, issues },
    impact: { [A.id]: A.impact || null, [B.id]: B.impact || null }, format: fmt,
  };
}

// --------------- Test match: four innings within five simulated days (450 overs) ---------------
function simulateTest(A: Lineup, B: Lineup, o: Required<Pick<SimOpts, "pitch" | "style">> & SimOpts, r: () => number, seed: number): MatchResult {
  const TOTAL = (FORMATS.test.days || 5) * (FORMATS.test.dayOvers || 90);
  let left = TOTAL; // overs remaining in the match
  const tossW = r() < 0.5 ? A : B;
  const decision: "bat" | "bowl" = r() < 0.8 ? "bat" : "bowl";
  const first = (tossW === A) === (decision === "bat") ? A : B;
  const second = first === A ? B : A;
  const inns: Innings[] = [];
  const play = (bat: Lineup, bowl: Lineup, target: number | null, declare?: InnExtra["declare"]) => {
    const i = innings(bat, bowl, bowlingOptions(bowl, 6), o, r, target, left, 10, 999, { declare, matchBallsLeft: left * 6 });
    left -= Math.ceil(i.balls / 6);
    inns.push(i);
    return i;
  };
  // Innings 1 and 2: bat long; declare only on a huge total.
  const i1 = play(first, second, null, (runs, w, ov) => runs >= 560 + (w <= 4 ? 60 : 0) || (runs >= 450 && ov >= 150) || left - ov < 150);
  let winner: string | null = null, margin = "", draw = false;
  if (left <= 0) { draw = true; }
  const i2 = draw ? null : play(second, first, null, (runs, _w, ov) => (runs - i1.runs >= 200 && runs >= 520) || (runs >= 450 && ov >= 160) || left - ov < 90);
  let i3: Innings | null = null, i4: Innings | null = null;
  if (i2 && left > 0) {
    const lead = i1.runs - i2.runs; // first team's lead
    // Third innings: build a lead, then declare leaving time to bowl the opponent out.
    i3 = play(first, second, null, (runs, _w, ov) => {
      const tot = lead + runs, rem = left - ov;
      return (tot >= 420 && rem <= 140) || (tot >= 330 && rem <= 105) || (tot >= 260 && rem <= 80) || tot >= 520;
    });
    const t = i1.runs + i3.runs - i2.runs;
    if (t < 0 && i3.allOut) { winner = second.id; margin = `${second.short} won by an innings and ${-t} run${-t === 1 ? "" : "s"}`; }
    else if (left > 0) {
      i4 = play(second, first, t + 1);
      if (i4.runs >= t + 1) { winner = second.id; margin = `${second.short} won by ${10 - i4.wkts} wicket${10 - i4.wkts === 1 ? "" : "s"}`; }
      else if (i4.allOut) {
        if (i4.runs === t) { margin = "Match tied"; }
        else { winner = first.id; margin = `${first.short} won by ${t - i4.runs} run${t - i4.runs === 1 ? "" : "s"}`; }
      } else draw = true;
    } else draw = true;
  } else draw = true;
  if (draw) { winner = null; margin = "Match drawn (simulated time ran out after 5 days)"; }
  const { pom, issues } = pomAndChecks(inns, winner, A, B, "test");
  if (TOTAL - left > TOTAL) issues.push("Test exceeded 450 overs");
  return {
    simulated: true, seed, venue: o.venue || "Neutral venue", pitch: o.pitch, style: o.style, toss: { winner: tossW.id, decision },
    teams: [{ id: first.id, name: first.name, short: first.short, color: first.color }, { id: second.id, name: second.name, short: second.short, color: second.color }],
    xi: { [first.id]: first.xi, [second.id]: second.xi },
    innings: inns, winner, margin, pom, checks: { ok: issues.length === 0, issues }, impact: { [A.id]: null, [B.id]: null }, format: "test", draw: draw || !winner,
  };
}

function pomAndChecks(all: Innings[], winner: string | null, A: Lineup, B: Lineup, fmt: Format) {
  const FD = FORMATS[fmt];
  // POM: MVP points + winning bonus
  const pts: Record<string, number> = {};
  for (const inn of all) {
    for (const b of inn.batting) if (b.out !== "dnb") pts[b.pid] = (pts[b.pid] || 0) + b.runs + b.f4 * 1 + b.s6 * 2 + (b.balls >= 10 ? (b.runs / b.balls * 100 - 130) * 0.1 : 0);
    for (const w of inn.bowling) pts[w.pid] = (pts[w.pid] || 0) + w.wkts * 22 + w.dots * 1 - Math.max(0, w.runs - w.balls * 1.4) * 0.5;
    for (const [f, c] of Object.entries(inn.catches)) pts[f] = (pts[f] || 0) + c * 8;
  }
  const winXI = new Set(winner === A.id ? [...A.xi, ...(A.impact ? [A.impact.in] : [])] : winner === B.id ? [...B.xi, ...(B.impact ? [B.impact.in] : [])] : []);
  for (const k of Object.keys(pts)) if (winXI.has(k)) pts[k] *= 1.15;
  const pomId = Object.entries(pts).sort((a, b) => b[1] - a[1])[0]?.[0];
  let pom = null;
  if (pomId) {
    const parts: string[] = [];
    for (const inn of all) {
      const b = inn.batting.find((x) => x.pid === pomId && x.out !== "dnb"); if (b) parts.push(`${b.runs}${b.out === "not out" ? "*" : ""} (${b.balls})`);
      const w = inn.bowling.find((x) => x.pid === pomId); if (w) parts.push(`${w.wkts}/${w.runs} (${Math.floor(w.balls / 6)}.${w.balls % 6})`);
    }
    pom = { pid: pomId, reason: parts.join(" & ") || "Fielding impact" };
  }
  // Invariant checks
  const issues: string[] = [];
  for (const inn of all) {
    const batRuns = inn.batting.reduce((a, b) => a + b.runs, 0);
    const ex = inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb;
    if (batRuns + ex !== inn.runs) issues.push(`${inn.team}: batting+extras ${batRuns + ex} != total ${inn.runs}`);
    const bowlRuns = inn.bowling.reduce((a, b) => a + b.runs, 0);
    if (bowlRuns + inn.extras.b + inn.extras.lb !== inn.runs) issues.push(`${inn.team}: bowling runs mismatch`);
    const bowlW = inn.bowling.reduce((a, b) => a + b.wkts, 0);
    const ro = inn.batting.filter((b) => b.outKind === "runout").length;
    if (bowlW + ro !== inn.wkts) issues.push(`${inn.team}: wickets mismatch`);
    if (FD.bowlerMax && inn.bowling.some((b) => b.balls > FD.bowlerMax! * 6)) issues.push(`${inn.team}: bowler exceeded ${FD.bowlerMax} overs`);
    if (FD.overs && inn.balls > FD.overs * 6) issues.push(`${inn.team}: too many balls`);
    if (inn.wkts > 10) issues.push(`${inn.team}: more than 10 wickets`);
  }
  return { pom, issues };
}

export function stripCommentary(m: MatchResult): MatchResult {
  return { ...m, innings: m.innings.map((i) => ({ ...i, commentary: [] })), superOver: m.superOver?.map((i) => ({ ...i, commentary: [] })) };
}

export function quickPredict(A: Lineup, B: Lineup, n = 150, opts: SimOpts = {}) {
  if (opts.format === "test") n = Math.min(n, 40); else if (opts.format === "odi") n = Math.min(n, 80);
  let a = 0, sa = 0, sb = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const m = simulateMatch(A, B, { ...opts, seed: 1000 + i * 7919, commentary: false });
    if (m.winner === A.id) a++; else if (!m.winner) d++;
    const ia = m.innings.find((x) => x.team === A.id), ib = m.innings.find((x) => x.team === B.id);
    sa += ia?.runs || 0; sb += ib?.runs || 0;
  }
  return { aWin: a / n, bWin: (n - a - d) / n, draw: d / n, avgA: Math.round(sa / n), avgB: Math.round(sb / n), n };
}
