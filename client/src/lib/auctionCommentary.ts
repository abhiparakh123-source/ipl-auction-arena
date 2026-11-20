// Live auction commentary. Lines are generated in the browser from server-authoritative room state.
// Player numbers quoted are historical career figures for the room's format (Cricsheet). Valuation remarks use the calculated fair-value model.
// Everything else (tone, excitement) is generated flavour and is labelled "Generated" in the UI.
import { useEffect, useRef, useState } from "react";
import { fmtCr } from "@shared/game";
import { fairValue } from "@shared/analytics";
import { teamColor } from "@/lib/data";
import { session } from "@/lib/store";
import { speak, say, sayThen } from "@/lib/sound";

export interface CLine { id: number; text: string; ts: number; tone: "intro" | "bid" | "hot" | "result" | "info"; team?: string | null }
type Style = "pro" | "energetic" | "tactical" | "friends";
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const crSpoken = (x: number) => (x >= 1 ? `${Number(x.toFixed(2))} crore` : `${Math.round(x * 100)} lakh`);

function careerLine(p: any) {
  const lbl = p.fmtStats?.fmt ? ({ t20i: "T20I", odi: "ODI", test: "Test" } as any)[p.fmtStats.fmt] : "IPL";
  if (!p.matches) return `${p.name} has no ${lbl} appearances in the Cricsheet record.`;
  const bowler = p.role === "Bowler" || (p.wkts > 30 && p.runs < 800);
  const tail = lbl === "Test" ? (p.avg ? ` at an average of ${p.avg}` : "") : (p.sr ? ` at a strike rate of ${p.sr}` : "");
  if (bowler) return `${p.matches} ${lbl} matches, ${p.wkts} wickets${p.econ ? ` at an economy of ${p.econ}` : ""}.`;
  return `${p.matches} ${lbl} matches, ${p.runs} runs${tail}${p.wkts > 10 ? `, plus ${p.wkts} wickets` : ""}.`;
}

const T = {
  intro: {
    pro: (p: any, base: string) => [`Next up, ${p.name}. ${p.role}, ${p.country}. Base price ${base}.`, `${p.name} walks onto the block. ${p.role} from ${p.country}, starting at ${base}.`],
    energetic: (p: any, base: string) => [`Here we go! ${p.name} is on the block! Base ${base}, let's see who wants him!`, `Big moment, folks! ${p.name}, ${p.role}, opening at ${base}!`],
    tactical: (p: any, base: string) => [`${p.name}, ${p.role}${p.overseas && !p.fmtStats ? ", overseas slot" : ""}. Base ${base}. Watch the teams short in this role.`, `Lot features ${p.name}. ${p.role}, base ${base}. Squad needs will drive this one.`],
    friends: (p: any, base: string) => [`Okay, ${p.name} is up. Base ${base}. Who's going to blink first?`, `Ooh, ${p.name}. ${base} to start. Wallets out, everyone.`],
  },
  open: {
    pro: (t: string, a: string) => [`${t} open the bidding at ${a}.`, `First paddle up from ${t}, ${a}.`],
    energetic: (t: string, a: string) => [`${t} are straight in at ${a}!`, `Boom, ${t} get us going at ${a}!`],
    tactical: (t: string, a: string) => [`${t} move first at ${a}. Early intent.`, `${t} open at ${a}; that fits a gap in their squad.`],
    friends: (t: string, a: string) => [`${t} couldn't wait. ${a}.`, `And ${t} are in at ${a}, no hesitation.`],
  },
  raise: {
    pro: (t: string, a: string) => [`${t}, ${a}.`, `${a} from ${t}.`, `${t} raise to ${a}.`],
    energetic: (t: string, a: string) => [`${t} hit back, ${a}!`, `${a}! ${t} are not letting go!`, `Up it goes, ${a}, ${t}!`],
    tactical: (t: string, a: string) => [`${t} to ${a}.`, `${t} answer at ${a}.`],
    friends: (t: string, a: string) => [`${t} again, ${a}.`, `${t} said no thank you, ${a}.`],
  },
};

export function useAuctionCommentary(st: any, look: (id: string) => any, myTeamId?: string | null) {
  const [lines, setLines] = useState<CLine[]>([]);
  const ref = useRef({ seq: -1, bids: 0, leader: null as string | null, bid: null as number | null, said: new Set<string>(), id: 0, result: "" });
  const settings = session.use((s) => s.settings);
  const style = (settings.commentary || "pro") as Style;
  const lot = st?.lot;

  const push = (text: string, tone: CLine["tone"], opts: { clip?: string; prio?: number; team?: string | null } = {}) => {
    const r = ref.current;
    const line = { id: ++r.id, text, ts: Date.now(), tone, team: opts.team };
    setLines((l) => [...l.slice(-39), line]);
    if (opts.clip) voice(opts.clip, opts.prio ?? 1);
  };

  // New lot
  useEffect(() => {
    if (!lot) return;
    const r = ref.current;
    if (lot.seq === r.seq) return;
    r.seq = lot.seq; r.bids = lot.history?.length || 0; r.leader = lot.leader; r.bid = lot.bid; r.said = new Set(); r.result = "";
    const p = look(lot.pid); if (!p) return;
    push(pick(T.intro[style](p, fmtCr(lot.base))), "intro");
    // Spoken: recorded auctioneer call, then the player's name via device speech where available
    if (on()) sayThen(Math.random() < 0.5 ? "a_next" : "a_next2", 3, () => { if (ref.current.seq === lot.seq) speak(`${p.name}. Base price, ${crSpoken(lot.base)}.`, "auctioneer", 2); });
    setTimeout(() => {
      if (ref.current.seq !== lot.seq) return;
      push(`On record: ${careerLine(p)}`, "info");
      const r26 = lot.real2026;
      if (r26 && st.universe !== "real2026") push(`For reference, in the real IPL 2026 auction cycle he was ${r26.how === "retained" ? `retained by ${r26.team}` : r26.how === "unsold" ? "unsold" : r26.team ? `bought by ${r26.team}${r26.price ? ` for ${fmtCr(r26.price)}` : ""}` : String(r26.how)}.`, "info");
    }, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot?.seq]);

  // Bids
  useEffect(() => {
    if (!lot || lot.seq !== ref.current.seq) return;
    const r = ref.current;
    const n = lot.history?.length || 0;
    if (n <= r.bids || lot.phase === "sealed") { r.bids = n; return; }
    const p = look(lot.pid); if (!p) return;
    const prevBid = r.bid, prevLeader = r.leader;
    r.bids = n; r.bid = lot.bid; r.leader = lot.leader;
    const t = teamColor(lot.leader, st);
    const tName = lot.leader === myTeamId ? "You" : t.short;
    const a = fmtCr(lot.bid);
    const bidders = new Set((lot.history || []).map((h: any) => h.team));
    const fv = fairValue(p.ratings.overall, st.settings.purse);
    const teamClip = TEAM_CLIP.has(lot.leader) && !st.settings?.customNames?.[lot.leader] ? "a_bid_" + lot.leader : "a_new";
    if (n === 1) push(pick(T.open[style](tName, a)), "bid", { team: lot.leader, clip: Math.random() < 0.5 ? "c_open" : teamClip, prio: 1 });
    else {
      const h = lot.history || []; const jump = h.length >= 2 ? h[h.length - 1].amount - h[h.length - 2].amount : 0; void prevBid;
      if (jump >= 1 && !r.said.has("jump" + n)) push(style === "tactical" ? `${t.short} jump ${fmtCr(jump)} in one go to ${a}. A signal to the room.` : `Massive jump! ${t.short} leap to ${a}!`, "hot", { team: lot.leader, clip: "c_jump", prio: 2 });
      else push(pick(T.raise[style](tName, a)), "bid", { team: lot.leader, clip: teamClip, prio: 1 });
      if (prevLeader && prevLeader !== lot.leader && n >= 6 && bidders.size === 2 && !r.said.has("war")) {
        r.said.add("war");
        const o = teamColor(prevLeader, st).short;
        push(`It's a two-way battle now, ${t.short} against ${o}.`, "hot", { clip: "c_war", prio: 2 });
      }
    }
    if (bidders.size >= 4 && !r.said.has("crowd")) { r.said.add("crowd"); push(`${bidders.size} franchises have raised a paddle for ${p.name}.`, "hot", { clip: "c_crowd", prio: 2 }); }
    if (fv > 0 && lot.bid >= fv * 1.5 && !r.said.has("over")) { r.said.add("over"); push(style === "friends" ? `That's well past the fair-value model's ${fmtCr(fv)}. Someone really wants him.` : `We're now 50% above the model's calculated fair value of ${fmtCr(fv)}.`, "info"); }
    if (lot.bid >= 10 && !r.said.has("10")) { r.said.add("10"); push(`Double figures! ${p.name} past 10 crore.`, "hot", { clip: "c_ten", prio: 2 }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot?.history?.length, lot?.seq]);

  // Going once / twice: driven from the caller with remaining seconds
  const countdown = (secs: number) => {
    if (!lot || lot.phase !== "bidding" || !lot.leader) return;
    const r = ref.current, s = Math.ceil(secs), key = `${lot.seq}:${r.bids}:`;
    const name = teamColor(lot.leader, st).short;
    if (s === 3 && !r.said.has(key + "once")) { r.said.add(key + "once"); push(`Going once, to ${name}...`, "hot", { clip: "a_once", prio: 3 }); }
    if (s === 2 && !r.said.has(key + "twice")) { r.said.add(key + "twice"); push(`Going twice...`, "hot", { clip: "a_twice", prio: 3 }); }
  };

  // Result
  useEffect(() => {
    if (!lot?.result) return;
    const r = ref.current, k = `${lot.seq}:${lot.result.kind}`;
    if (r.result === k) return; r.result = k;
    const p = look(lot.pid); if (!p) return;
    const res = lot.result;
    if (res.kind === "sold") {
      const t = teamColor(res.team, st);
      const fv = fairValue(p.ratings.overall, st.settings.purse);
      const rtm = res.how === "rtm" ? " using the Right-to-Match card" : "";
      push(`SOLD! ${p.name} goes to ${t.name}${rtm} for ${fmtCr(res.price)}.`, "result", { team: res.team });
      if (on()) sayThen(TEAM_CLIP.has(res.team) && !st.settings?.customNames?.[res.team] ? "a_soldto_" + res.team : "a_sold", 5, () => speak(`For ${crSpoken(res.price)}.`, "auctioneer", 2));
      const kind = res.price <= fv * 0.75 ? "value" : res.price >= fv * 1.6 ? "premium" : "fair";
      const verdict = kind === "value" ? `Value buy: below the model's fair value of ${fmtCr(fv)}.` : kind === "premium" ? `A premium: the model rated him around ${fmtCr(fv)}.` : `Close to the model's fair value of ${fmtCr(fv)}.`;
      setTimeout(() => push(verdict, "info", kind === "fair" ? {} : { clip: kind === "value" ? "c_value" : "c_premium", prio: 2 }), 3400);
    } else if (res.kind === "unsold") {
      push(`No takers. ${p.name} goes unsold at ${fmtCr(lot.base)}.`, "result");
      voice("a_unsold", 5);
    } else {
      push(`Hammer down on the sealed bids. Result revealed later.`, "result");
      voice("a_sealed", 5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot?.seq, lot?.result?.kind]);

  return { lines, countdown };
}

const TEAM_CLIP = new Set(["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"]);
function on() { const s = session.get().settings; return s.liveCommentary !== false && s.voice; }
function voice(key: string, prio: number) { if (on()) say(key, prio); }
