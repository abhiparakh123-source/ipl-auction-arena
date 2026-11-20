import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRoom, rulesOf, tlOf } from "./ctx";
import { Panel, PlayerAvatar, RoleChip, Emblem, Kind, Bar, Stat, Explain } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtCr, nextBid, round2 } from "@shared/game";
import { lotAdvice } from "@shared/analytics";
import { graphicsLevel, session, updateSettings } from "@/lib/store";
import { sfx, cheer, crowdIntensity, audioState, onAudioState, unlockAudio, testVoice } from "@/lib/sound";
import { useAuctionCommentary } from "@/lib/auctionCommentary";
import { StageHero } from "@/components/StageHero";
import { photoUrl, teamColor, num } from "@/lib/data";
import { Newsroom } from "./Feeds";
import type { StageInfo } from "@/components/Arena3D";
import { Pause, Play, SkipForward, Undo2, Square, Gavel, Timer, RotateCcw, Eye, Volume2, Mic } from "lucide-react";

const Arena3D = lazy(() => import("@/components/Arena3D"));

function useNow(ms = 100) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
export function incrementFor(st: any, cur: number | null, base: number) {
  if (cur == null) return round2(base);
  if (st.settings.customIncrement) return round2(cur + st.settings.customIncrement);
  return nextBid(cur, base, { increments: [{ upTo: 1, step: 0.05 }, { upTo: 2, step: 0.1 }, { upTo: Infinity, step: 0.2 }] }, st.settings.incrementMultiplier);
}

function Backdrop2D({ glow }: { glow: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `radial-gradient(ellipse at 70% -10%, ${glow}55, transparent 55%), radial-gradient(ellipse at 15% 110%, #4D7CFF44, transparent 60%), linear-gradient(180deg, #071233, #02040c)` }}>
      <div className="absolute inset-0 stage-beams" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 grid-floor opacity-60" />
    </div>
  );
}

function BidControls({ secs }: { secs: number }) {
  const { st, act, myTeam, look } = useRoom();
  const lot = st.lot;
  const p = look(lot.pid)!;
  const amt = incrementFor(st, lot.bid, lot.base);
  const [custom, setCustom] = useState("");
  const [sealed, setSealed] = useState("");
  const [busy, setBusy] = useState(false);
  const leading = lot.leader === myTeam?.id;
  const bid = async (a: number) => {
    if (busy) return; setBusy(true);
    const r = await act("bid", { seq: lot.seq, amount: a });
    if (r.ok) sfx.bid(true);
    setBusy(false);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if ((e.key === "b" || e.key === " ") && lot.phase === "bidding" && myTeam && !leading) { e.preventDefault(); bid(amt); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [lot.seq, lot.bid, lot.phase, leading, amt]);
  if (!myTeam) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Eye className="h-4 w-4" />Spectating — take an open franchise in the lobby to bid.</div>;
  if (lot.phase === "intro") return <div className="text-sm text-cyan-200">Player introduction — bidding opens in <b className="tnum">{Math.max(0, Math.ceil(secs))}s</b>.</div>;
  if (lot.phase === "result") return <div className="text-sm text-muted-foreground">Next player coming up…</div>;
  if (lot.phase === "sealed") {
    if (lot.mySealed != null) return <div className="text-sm text-emerald-300">Sealed bid submitted: {lot.mySealed ? fmtCr(lot.mySealed) : "pass"}. {lot.sealedCount}/{st.teams.length} franchises have bid.</div>;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" step={0.05} min={lot.base} value={sealed} onChange={(e) => setSealed(e.target.value)} placeholder={`Min ${lot.base}`} className="w-36 tnum" data-testid="input-sealed" />
        <Button onClick={() => act("sealed", { seq: lot.seq, amount: Number(sealed) })} disabled={!sealed} data-testid="button-sealed">Submit sealed bid</Button>
        <Button variant="outline" onClick={() => act("sealed", { seq: lot.seq, amount: null })} data-testid="button-sealed-pass">Pass</Button>
        <span className="text-xs text-muted-foreground">One bid only. Highest wins; ties go to the earliest bid. {lot.sealedCount}/{st.teams.length} in.</span>
      </div>
    );
  }
  if (lot.phase.startsWith("rtm")) {
    const mineRtm = lot.rtmTeam === myTeam.id, mineLead = lot.leader === myTeam.id;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-violet-200">Right-to-Match: {teamColor(lot.rtmTeam, st).short} {lot.phase === "rtm" ? "deciding" : lot.phase === "rtm-raise" ? `matched — ${teamColor(lot.leader, st).short} may raise` : "deciding on the raised price"}.</span>
        {lot.phase === "rtm" && mineRtm && <><Button onClick={() => act("rtm", { use: true })} data-testid="button-rtm-use">Use RTM at {fmtCr(lot.bid)}</Button><Button variant="outline" onClick={() => act("rtm", { use: false })} data-testid="button-rtm-decline">Decline</Button></>}
        {lot.phase === "rtm-raise" && mineLead && <><Input type="number" step={0.05} value={custom} onChange={(e) => setCustom(e.target.value)} className="w-32" placeholder="Final raise" data-testid="input-rtm-raise" /><Button onClick={() => act("rtm", { amount: Number(custom) })} data-testid="button-rtm-raise">Raise</Button><Button variant="outline" onClick={() => act("rtm", { amount: null })} data-testid="button-rtm-noraise">No raise</Button></>}
        {lot.phase === "rtm-final" && mineRtm && <><Button onClick={() => act("rtm", { use: true })} data-testid="button-rtm-match">Match {fmtCr(lot.bid)}</Button><Button variant="outline" onClick={() => act("rtm", { use: false })} data-testid="button-rtm-let-go">Let go</Button></>}
      </div>
    );
  }
  const jumps = [incrementFor(st, amt, lot.base), incrementFor(st, incrementFor(st, amt, lot.base), lot.base)].map((x) => round2(x + 0)).slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="lg" disabled={leading || busy} onClick={() => bid(amt)} className={`min-w-[200px] h-14 text-lg font-display ${leading ? "" : "gold-glow bg-gradient-to-b from-amber-300 to-amber-500 text-black hover:from-amber-200 pulse-ring"}`} data-testid="button-bid">
        <Gavel className="h-5 w-5 mr-2" />{leading ? "You lead" : `Bid ${fmtCr(amt)}`}
      </Button>
      {!leading && jumps.map((j) => <Button key={j} variant="outline" onClick={() => bid(j)} disabled={busy} className="tnum" data-testid={`button-jump-${j}`}>{fmtCr(j)}</Button>)}
      <div className="flex gap-1.5">
        <Input type="number" step={0.05} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom ₹ cr" className="w-28 tnum" data-testid="input-custom-bid" onKeyDown={(e) => e.key === "Enter" && custom && bid(Number(custom))} />
        <Button variant="outline" disabled={!custom || leading} onClick={() => bid(Number(custom))} data-testid="button-custom-bid">Bid</Button>
      </div>
      <span className="text-[11px] text-muted-foreground hidden md:inline">Press B or Space to bid. {p.overseas && !p.fmtStats ? "Overseas player." : ""}</span>
    </div>
  );
}

function Intelligence() {
  const { st, myTeam, look } = useRoom();
  const lot = st.lot; const p = look(lot?.pid);
  if (!lot || !p) return null;
  if (!myTeam) return <Panel title="Auction intelligence"><div className="text-sm text-muted-foreground">Take a franchise to see personalised advice.</div></Panel>;
  const rules = rulesOf(st);
  const teams = st.teams.filter((t: any) => t.purse != null).map(tlOf);
  const amt = incrementFor(st, lot.bid, lot.base);
  const adv = lotAdvice(p, lot.bid, amt, tlOf(myTeam), teams, look, rules);
  const vColor = adv.verdict === "Bid" ? "#7CFF6B" : adv.verdict === "Optional" ? "#3DD6F5" : adv.verdict === "Hold" ? "#F5C542" : "#FF5C8A";
  const n = adv.survival;
  return (
    <Panel title="Auction intelligence" kind="calculated" right={<Explain>Advice is computed in your browser from the shared rating model and live room state. It never places bids for you.</Explain>}>
      <div className="flex items-center gap-3 mb-3">
        <div className="font-display text-3xl font-bold" style={{ color: vColor }} data-testid="text-verdict">{adv.verdict}</div>
        <div className="text-xs text-muted-foreground leading-tight">{adv.block || (adv.verdict === "Bid" ? "Fits a need at a fair price" : adv.verdict === "Hold" ? "Price is above your recommended ceiling" : "Not a priority role")}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Fair value" value={fmtCr(adv.fairValue)} testid="stat-fair" />
        <Stat label="Your max" value={fmtCr(adv.recommendedMax)} testid="stat-max" />
        <Stat label="Demand" value={`${adv.demand} rivals`} testid="stat-demand" />
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>Demand meter</span><span>{adv.demandTeams.map((id: string) => st.teams.find((t: any) => t.id === id)?.short || id).join(" · ") || "none"}</span></div>
        <Bar value={adv.demand} max={Math.max(3, st.teams.length - 1)} color="linear-gradient(90deg,#22E4FF,#FF5C8A)" />
      </div>
      {adv.flags.length > 0 && <div className="flex flex-wrap gap-1.5 mb-3">{adv.flags.map((f) => <span key={f} className={`text-[11px] rounded-full px-2 py-0.5 border ${f.includes("bargain") ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}>{f}</span>)}</div>}
      <ul className="text-xs text-slate-300/85 space-y-1 mb-3">{adv.reason.map((r) => <li key={r}>• {r}</li>)}</ul>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Budget survival" value={`${fmtCr(n.perSlot)}/slot`} sub={`${n.minNeeded} slots to minimum`} />
        <Stat label="Squad completion" value={`${myTeam.squad.length}/${st.settings.squadMin}`} sub={st.settings.format && st.settings.format !== "ipl" ? `${Math.max(0, st.settings.squadMax - myTeam.squad.length)} slots left` : `${n.overseasLeft} overseas slots left`} />
      </div>
    </Panel>
  );
}

function PurseBoard() {
  const { st } = useRoom();
  const max = Math.max(...st.teams.map((t: any) => t.startPurse || st.settings.purse));
  return (
    <Panel title="Purse comparison" kind="live" bodyClass="p-3">
      <div className="space-y-1.5">
        {[...st.teams].sort((a: any, b: any) => (b.purse ?? -1) - (a.purse ?? -1)).map((t: any) => {
          return (
            <div key={t.id} className="flex items-center gap-2 text-xs" data-testid={`purse-${t.id}`}>
              <Emblem id={t.id} room={st} size={20} />
              <span className="w-10 font-semibold">{t.short}</span>
              <div className="flex-1"><Bar value={t.purse ?? 0} max={max} color={t.primary === "#1B2133" ? "#DBBE6E" : t.primary} /></div>
              <span className="w-16 text-right tnum">{t.purse == null ? "hidden" : fmtCr(t.purse)}</span>
              <span className="w-10 text-right tnum text-muted-foreground">{t.squad.length}/{st.settings.squadMax}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function HostControls() {
  const { st, act } = useRoom();
  const [timer, setTimer] = useState(String(st.settings.bidTimer));
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  const unsold = st.pool.filter((x: any) => x.status === "unsold");
  const { look } = useRoom();
  return (
    <Panel title="Host controls" right={<span className="text-[11px] text-muted-foreground">All actions are logged in Audit</span>}>
      <div className="flex flex-wrap gap-2">
        {st.paused ? <Button size="sm" onClick={() => act("resume")} data-testid="button-resume"><Play className="h-4 w-4 mr-1" />Resume</Button> : <Button size="sm" variant="outline" onClick={() => act("pause")} data-testid="button-pause"><Pause className="h-4 w-4 mr-1" />Pause</Button>}
        <Button size="sm" variant="outline" onClick={() => act("skip")} data-testid="button-skip"><SkipForward className="h-4 w-4 mr-1" />{st.lot?.leader ? "Hammer now" : "Skip lot"}</Button>
        <Button size="sm" variant="outline" onClick={() => act("undo")} data-testid="button-undo"><Undo2 className="h-4 w-4 mr-1" />Undo last sale</Button>
        <Button size="sm" variant="outline" className="text-rose-300" onClick={() => { if (!arm) { setArm(true); return; } setArm(false); act("endAuction"); }} title="Remaining players stay unsold" data-testid="button-end-auction"><Square className="h-4 w-4 mr-1" />{arm ? "Click again to end" : "End auction"}</Button>
        <div className="flex items-center gap-1.5 ml-auto">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <Input type="number" value={timer} onChange={(e) => setTimer(e.target.value)} className="w-16 h-8 tnum" data-testid="input-timer" />
          <Button size="sm" variant="ghost" onClick={() => act("timerSettings", { bidTimer: Number(timer) }, "Bid timer updated")} data-testid="button-timer">Set</Button>
        </div>
      </div>
      {unsold.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-muted-foreground mb-1.5">Unsold — re-auction next:</div>
          <div className="flex flex-wrap gap-1.5">
            {unsold.slice(0, 24).map((u: any) => <button key={u.pid} onClick={() => act("reauction", { pid: u.pid })} className="text-[11px] rounded-full border border-white/10 px-2 py-0.5 hover:bg-white/5 flex items-center gap-1" data-testid={`button-reauction-${u.pid}`}><RotateCcw className="h-3 w-3" />{look(u.pid)?.name}</button>)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function CommentaryFeed({ lines }: { lines: { id: number; text: string; tone: string; team?: string | null }[] }) {
  const { st } = useRoom();
  const set = session.use((s) => s.settings);
  const shown = [...lines].reverse().slice(0, 14);
  const [msg, setMsg] = useState("");
  return (
    <Panel title="Live commentary" kind="simulated" bodyClass="p-3" right={<div className="flex items-center gap-1.5">
      <button onClick={async () => setMsg(await testVoice())} className="text-[11px] rounded-full border border-white/10 px-2 py-0.5 hover:bg-white/5" data-testid="button-test-voice-room">Test</button>
      <button onClick={() => { unlockAudio(); updateSettings({ voice: !set.voice }); }} className={`flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5 ${set.voice ? "border-cyan-400/40 text-cyan-200" : "border-white/10 text-muted-foreground"}`} data-testid="button-toggle-voice">
        <Mic className="h-3 w-3" />{set.voice ? "Voice on" : "Voice off"}
      </button></div>}>
      {msg && <div className="mb-2 rounded-lg bg-cyan-400/10 border border-cyan-400/20 px-2 py-1.5 text-[11px] text-cyan-100" data-testid="text-voice-status">{msg}</div>}
      <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin" data-testid="feed-commentary">
        {shown.length === 0 && <div className="text-xs text-muted-foreground">The commentator calls each lot as it happens.</div>}
        <AnimatePresence initial={false}>
          {shown.map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 text-[13px] leading-snug ${i === 0 ? "" : "opacity-70"}`}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.team ? teamColor(l.team, st).primary : l.tone === "hot" ? "#F5C542" : l.tone === "result" ? "#FF5C8A" : "#22E4FF" }} />
              <span className={l.tone === "result" ? "font-semibold" : l.tone === "hot" ? "text-amber-100" : "text-slate-200/90"}>{l.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">Generated from live room events. Career figures are historical (Cricsheet); fair-value remarks are calculated estimates, not predictions of real prices.</div>
    </Panel>
  );
}

function LotHistory() {
  const { st } = useRoom();
  const h = [...(st.lot?.history || [])].reverse();
  return (
    <Panel title="Bid history" kind="live" bodyClass="p-3">
      <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
        {h.length === 0 && <div className="text-xs text-muted-foreground">{st.lot?.phase === "sealed" ? "Sealed bids are hidden until the hammer." : "No bids yet."}</div>}
        {h.map((b: any, i: number) => (
          <motion.div key={b.ts} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className={`flex items-center gap-2 text-sm ${i === 0 ? "text-white" : "text-slate-400"}`}>
            <Emblem id={b.team} room={st} size={18} /><span className="font-semibold w-12">{teamColor(b.team, st).short}</span><span className="tnum ml-auto">{fmtCr(b.amount)}</span>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

function PlayerFacts() {
  const { st, look } = useRoom();
  const p = look(st.lot?.pid); if (!p) return null;
  const r = st.lot.real2026;
  return (
    <Panel title="Player file" kind="historical" bodyClass="p-3">
      <div className="flex items-center gap-3 mb-2"><PlayerAvatar p={p} size={52} credit /><div className="min-w-0"><div className="font-semibold truncate">{p.fullName}</div><RoleChip p={p} /><div className="text-[11px] text-muted-foreground truncate">{p.batting || ""}{p.bowling ? ` · ${p.bowling}` : ""}</div></div></div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[["M", p.matches], ["Runs", p.runs], ["SR", num(p.sr, 1)], ["Wkts", p.wkts], ["Avg", num(p.avg, 1)], ["Econ", num(p.econ, 2)], ["Bat", p.ratings.bat.toFixed(0)], ["Bowl", p.ratings.bowl.toFixed(0)]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-white/[0.03] py-1"><div className="text-[9px] uppercase text-muted-foreground">{k}</div><div className="text-sm tnum font-semibold">{v as any}</div></div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">{st.settings.format && st.settings.format !== "ipl" ? `${({ t20i: "T20I", odi: "ODI", test: "Test" } as any)[st.settings.format]} record ${p.fmtStats?.first ?? ""}-${p.fmtStats?.last ?? ""} from Cricsheet ball-by-ball (coverage starts 2001-2005, so earlier careers are partial)` : "IPL career 2008-2026 (Cricsheet)"}. Bat/Bowl ratings are calculated metrics{st.mode === "legends" && st.settings.era !== "all" ? ` for the ${st.settings.era} era` : ""}.</div>
      {r && <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs"><span className="text-muted-foreground">Real IPL 2026: </span>{r.how === "retained" ? `retained by ${r.team} at ${fmtCr(r.price)}` : r.how === "unsold" ? "unsold" : r.team ? `${r.team} · ${fmtCr(r.price)} (${r.how})` : r.how}</div>}
    </Panel>
  );
}

function Upcoming() {
  const { st, look } = useRoom();
  const next = st.pool.filter((x: any) => x.status === "pending").slice(0, 8);
  const sold = st.sales.filter((x: any) => x.season === st.seasonNo).slice(-10).reverse();
  const done = st.pool.filter((x: any) => x.status !== "pending").length;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Panel title={`Up next · ${done}/${st.pool.length} done`} bodyClass="p-3">
        <div className="space-y-1.5">{next.map((x: any) => { const p = look(x.pid); return p ? <div key={x.pid} className="flex items-center gap-2 text-sm"><PlayerAvatar p={p} size={26} rounded="rounded-md" /><span className="truncate">{p.name}</span><span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[120px]">{x.set}</span><span className="tnum text-xs w-14 text-right">{fmtCr(x.base)}</span></div> : null; })}</div>
      </Panel>
      <Panel title="Sold timeline" kind="live" bodyClass="p-3">
        <div className="space-y-1.5">{sold.length === 0 && <div className="text-xs text-muted-foreground">No sales yet.</div>}{sold.map((x: any) => { const p = look(x.pid); return <div key={x.n} className="flex items-center gap-2 text-sm"><Emblem id={x.team === "?" ? null : x.team} room={st} size={20} /><span className="truncate">{p?.name}</span><span className="ml-auto tnum text-amber-200">{x.price == null ? "sealed" : fmtCr(x.price)}</span></div>; })}</div>
      </Panel>
    </div>
  );
}

export default function AuctionStage() {
  const { st, look, conn, myTeam, isHost } = useRoom();
  const offset = conn.store.use((s) => s.offset);
  const now = useNow(100);
  const lot = st.lot;
  const p = look(lot?.pid);
  const [strike, setStrike] = useState(0);
  const [crowd, setCrowd] = useState(0.1);
  const gfx = session.use((s) => s.settings.graphics);
  const level = useMemo(() => graphicsLevel(), [gfx]);
  const lastTick = useRef(-1);
  const secs = lot ? (st.paused ? (lot.pausedLeft ?? 0) / 1000 : (lot.endsAt - (now + offset)) / 1000) : 0;
  const { lines, countdown } = useAuctionCommentary(st, look, myTeam?.id);
  const [aud, setAud] = useState(audioState());
  useEffect(() => onAudioState(() => setAud(audioState())), []);
  useEffect(() => { const t = setInterval(() => setAud(audioState()), 1500); return () => clearInterval(t); }, []);
  useEffect(() => { if (!st.paused) countdown(secs); }, [Math.ceil(secs)]);
  useEffect(() => conn.onEvent((ev) => {
    if (ev.kind === "bid") { if (ev.team !== myTeam?.id) sfx.bid(false); setCrowd((c) => Math.min(1, c + 0.12)); }
    if (ev.kind === "lot") { sfx.reveal(); setCrowd(0.15); }
  }), [conn, myTeam?.id]);
  useEffect(() => {
    const r = lot?.result;
    if (!r) return;
    if (r.kind === "sold") { setStrike(Date.now()); sfx.sold(); setCrowd(1); }
    else if (r.kind === "unsold") { sfx.unsold(); setCrowd(0.05); }
    else { sfx.gavel(); setStrike(Date.now()); }
  }, [lot?.seq, lot?.result?.kind]);
  useEffect(() => { const t = setInterval(() => setCrowd((c) => Math.max(0.08, c * 0.93)), 400); return () => clearInterval(t); }, []);
  useEffect(() => { crowdIntensity(crowd); }, [crowd]);
  useEffect(() => {
    const s = Math.ceil(secs);
    if (lot?.phase === "bidding" && s <= 3 && s >= 1 && s !== lastTick.current) { lastTick.current = s; sfx.tick(); if (s === 1 && lot.bid) cheer(0.4); }
  }, [secs]);
  if (!lot || !p) return <Panel title="Auction"><div className="text-sm text-muted-foreground">Waiting for the next lot…</div><div className="mt-4"><Newsroom compact /></div></Panel>;
  const leaderC = lot.leader ? teamColor(lot.leader, st) : null;
  const info: StageInfo = {
    name: p.name, role: p.role, country: p.country, photo: photoUrl(p), set: lot.set, bid: lot.bid, base: lot.base, leader: leaderC, phase: lot.phase,
    result: lot.result ? { ...lot.result, color: lot.result.team ? teamColor(lot.result.team, st).primary : undefined } : null, rating: p.ratings.overall, secs: Math.max(0, secs),
  };
  const lastLine = lines.length && Date.now() - lines[lines.length - 1].ts < 9000 ? lines[lines.length - 1] : null;
  const total = lot.phase === "intro" ? st.settings.introTimer : st.settings.bidTimer + (lot.history.length ? 0 : 3);
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-4 min-w-0">
        <div className="relative rounded-2xl overflow-hidden glass h-[380px] sm:h-[430px] md:h-[480px] border border-white/10" data-testid="stage">
          <div className="absolute inset-0">
            {level === "off" ? <Backdrop2D glow={leaderC?.primary || "#22E4FF"} /> : (
              <Suspense fallback={<Backdrop2D glow={leaderC?.primary || "#22E4FF"} />}><Arena3D info={info} level={level} strike={strike} crowd={crowd} /></Suspense>
            )}
          </div>
          <StageHero info={info} p={p} st={st} secs={secs} total={total} line={lastLine} />
          {aud === "suspended" && (
            <button onClick={() => { unlockAudio(); setTimeout(() => setAud(audioState()), 200); }} className="absolute z-30 left-1/2 -translate-x-1/2 bottom-10 sm:bottom-12 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-white/20 px-3 py-1.5 text-xs hover:bg-black/80" data-testid="button-enable-sound">
              <Volume2 className="h-4 w-4 text-cyan-300" />Tap for sound and commentary
            </button>
          )}
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3"><div className="h-full transition-[width] duration-100 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (secs / Math.max(1, total)) * 100))}%`, background: secs <= 3 ? "#FF5C8A" : "linear-gradient(90deg,#22E4FF,#4D7CFF)" }} /></div>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{lot.bid != null ? "Current bid" : "Base price"}</div><div className="font-display text-3xl font-bold gold-text tnum" data-testid="text-current-bid">{lot.phase === "sealed" ? "Sealed" : fmtCr(lot.bid ?? lot.base)}</div></div>
            {leaderC && <div className="flex items-center gap-2"><Emblem id={lot.leader} room={st} size={34} /><div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Leading</div><div className="font-semibold" data-testid="text-leader">{leaderC.name}</div></div></div>}
            {myTeam && <div className="ml-auto text-right"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your purse</div><div className="font-display text-xl tnum" data-testid="text-my-purse">{fmtCr(myTeam.purse)}</div><div className="text-[11px] text-muted-foreground">{myTeam.squad.length}/{st.settings.squadMax} · {myTeam.squad.filter((x: any) => look(x.pid)?.overseas).length}/{st.settings.overseasMax} OS{st.settings.rtm ? ` · RTM ${myTeam.rtmLeft}` : ""}</div></div>}
          </div>
          <BidControls secs={secs} />
        </div>
        {isHost && <HostControls />}
        <Upcoming />
      </div>
      <div className="space-y-4">
        <Intelligence />
        <CommentaryFeed lines={lines} />
        <LotHistory />
        <PlayerFacts />
        <PurseBoard />
        <Newsroom compact />
        <div className="text-[11px] text-muted-foreground flex items-center gap-2"><Kind k="live" />Server-authoritative: bids, purses, ownership and timers are validated on the server.</div>
      </div>
    </div>
  );
}
