import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel } from "lucide-react";
import { fmtCr, FORMATS, type Format } from "@shared/game";
import { photoUrl, teamColor } from "@/lib/data";
import { Emblem, JerseyArt } from "@/components/game";
import type { StageInfo } from "@/components/Arena3D";

function Portrait({ p, st, glow }: { p: any; st: any; glow: string }) {
  const url = photoUrl(p);
  const [err, setErr] = useState(false);
  const tid = p.team2026 || p.teams?.[p.teams.length - 1] || null;
  const c = teamColor(tid, st);
  const rating = Math.round(p.ratings.overall);
  return (
    <motion.div key={p.id} initial={{ opacity: 0, y: 30, rotateY: -25, scale: 0.9 }} animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 110, damping: 16 }}
      className="relative shrink-0 w-[34vw] max-w-[250px] min-w-[118px] sm:w-[200px] md:w-[230px] lg:w-[250px] aspect-[3/4] rounded-[18px] p-[2px]"
      style={{ background: `linear-gradient(150deg, ${c.primary}, rgba(255,255,255,.55) 35%, ${c.secondary} 60%, ${glow})`, boxShadow: `0 0 0 1px rgba(255,255,255,.08), 0 18px 60px -10px ${glow}aa, 0 0 80px -20px ${glow}` }}>
      <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-[#060a18]">
        {url && !err ? (
          <>
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, ${c.primary}66, #060a18 70%)` }} />
            <img src={url} alt={p.name} onError={() => setErr(true)} className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />
          </>
        ) : (
          <JerseyArt p={p} room={st} w="100%" h="100%" />
        )}
        <div className="absolute inset-0 holo-shine pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-black/55 backdrop-blur px-2 py-1 leading-none border border-white/10">
          <span className="font-display text-xl sm:text-2xl font-bold gold-text tnum">{rating}</span>
          <span className="text-[8px] tracking-[0.2em] text-white/60 mt-0.5">RATING</span>
        </div>
        {tid && <div className="absolute right-2 top-2"><Emblem id={tid} room={st} size={26} /></div>}
        <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/60 truncate">{p.role}</div>
          <div className="font-display text-sm sm:text-lg font-semibold leading-tight truncate">{p.name}</div>
          {url && !err && p.photoCredit && <div className="text-[8px] text-white/45 truncate" title={p.photoCredit}>Photo: {p.photoCredit}</div>}
          {(!url || err) && <div className="text-[8px] text-white/45 truncate">Kit illustration · no licensed photo</div>}
        </div>
      </div>
    </motion.div>
  );
}

function Ring({ secs, total, phase, paused }: { secs: number; total: number; phase: string; paused: boolean }) {
  const R = 26, C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, secs / Math.max(1, total)));
  const danger = phase === "bidding" && secs <= 3;
  const label = paused ? "Paused" : phase === "intro" ? "Intro" : phase === "sealed" ? "Sealed" : phase.startsWith("rtm") ? "RTM" : phase === "result" ? "Next" : "Hammer";
  return (
    <div className={`relative h-[62px] w-[62px] sm:h-[72px] sm:w-[72px] rounded-full bg-black/55 backdrop-blur border border-white/10 ${danger ? "timer-danger" : ""}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={danger ? "#FF5C8A" : "#22E4FF"} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset .12s linear", filter: `drop-shadow(0 0 6px ${danger ? "#FF5C8A" : "#22E4FF"})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-display text-xl sm:text-2xl font-bold tnum ${danger ? "text-rose-300" : "text-white"}`} data-testid="text-timer">{Math.max(0, Math.ceil(secs))}</span>
        <span className="text-[7px] sm:text-[8px] uppercase tracking-[0.18em] text-white/55 mt-0.5">{label}</span>
      </div>
    </div>
  );
}

function StatTile({ l, v }: { l: string; v: string | number }) {
  return <div className="rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur px-2 py-1 sm:px-2.5 sm:py-1.5 min-w-0"><div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-white/50">{l}</div><div className="font-display text-sm sm:text-base font-semibold tnum truncate">{v}</div></div>;
}

function SoldBurst({ st, color }: { st: any; color: string }) {
  const r = st.lot?.result;
  const bits = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ x: (Math.random() - 0.5) * 900, y: -Math.random() * 380 - 60, r: Math.random() * 540, d: 0.9 + Math.random() * 0.9, c: i % 3 === 0 ? "#F5C542" : i % 3 === 1 ? color : "#ffffff", w: 5 + Math.random() * 6 })), [st.lot?.seq, color]);
  if (!r) return null;
  const tc = r.team ? teamColor(r.team, st) : null;
  const tColor = tc ? (tc.primary === "#1B2133" ? "#DBBE6E" : tc.primary) : "#fff";
  return (
    <motion.div key={st.lot.seq} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center pointer-events-none overflow-hidden">
      <motion.div className="absolute inset-0" initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ background: r.kind === "sold" ? `linear-gradient(110deg, ${tColor}55, rgba(0,0,0,.55) 45%, ${tColor}40)` : "rgba(0,0,0,.55)" }} />
      {r.kind === "sold" && bits.map((b, i) => (
        <motion.span key={i} className="absolute left-1/2 top-1/2 rounded-[2px]" style={{ width: b.w, height: b.w * 0.45, background: b.c }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: b.x, y: [0, b.y, b.y + 420], rotate: b.r, opacity: [1, 1, 0] }} transition={{ duration: b.d + 0.8, ease: "easeOut" }} />
      ))}
      <div className="relative text-center px-4">
        {r.kind === "sold" && <motion.div initial={{ rotate: -60, y: -40, opacity: 0 }} animate={{ rotate: [-60, 10, 0], y: 0, opacity: 1 }} transition={{ duration: 0.4 }} className="mx-auto mb-1 w-fit"><Gavel className="h-10 w-10 sm:h-14 sm:w-14 text-amber-300 drop-shadow-[0_0_20px_rgba(245,197,66,.6)]" /></motion.div>}
        <div className={`stamp font-display text-6xl sm:text-8xl font-bold tracking-[0.08em] ${r.kind === "unsold" ? "text-rose-400" : "gold-text"}`} style={{ textShadow: r.kind === "unsold" ? "0 0 30px rgba(255,92,138,.5)" : "0 0 50px rgba(245,197,66,.55)" }} data-testid="text-lot-result">
          {r.kind === "sold" ? (r.how === "rtm" ? "RTM!" : "SOLD") : r.kind === "unsold" ? "UNSOLD" : "SEALED"}
        </div>
        {r.kind === "sold" && tc && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="mt-2 inline-flex items-center gap-2 sm:gap-3 rounded-2xl bg-black/55 backdrop-blur px-3 sm:px-4 py-2 border border-white/10">
            <Emblem id={r.team} room={st} size={36} />
            <div className="text-left"><div className="font-display text-base sm:text-xl font-semibold" style={{ color: tColor }}>{tc.name}</div><div className="font-display text-xl sm:text-2xl gold-text tnum">{fmtCr(r.price)}</div></div>
          </motion.div>
        )}
        {r.kind === "sealed" && <div className="mt-2 text-sm text-white/70">Blind auction: result revealed later</div>}
        {r.kind === "unsold" && <div className="mt-2 text-sm text-white/70">No bids at the base price</div>}
      </div>
    </motion.div>
  );
}

export function StageHero({ info, p, st, secs, total, line }: { info: StageInfo; p: any; st: any; secs: number; total: number; line?: { id: number; text: string; tone: string } | null }) {
  const lot = st.lot;
  const glow = info.leader?.primary && info.leader.primary !== "#1B2133" ? info.leader.primary : "#22E4FF";
  const amount = info.bid ?? info.base;
  const over = info.bid != null && info.base ? Math.round((info.bid / info.base - 1) * 100) : 0;
  const bowler = p.role === "Bowler" || (p.wkts > 30 && p.runs < 800);
  const F = FORMATS[(st.settings?.format || "ipl") as Format];
  const ML = `${F.short} M`;
  const test = F.id === "test";
  const stats: [string, string | number][] = p.matches ? (bowler
    ? [[ML, p.matches], ["Wkts", p.wkts], ["Econ", p.econ ?? "—"], ["Runs", p.runs]]
    : [[ML, p.matches], ["Runs", p.runs], [test ? "Avg" : "SR", test ? p.avg ?? "—" : p.sr ?? "—"], [p.wkts > 10 ? "Wkts" : test ? "100s" : "Avg", p.wkts > 10 ? p.wkts : test ? p.fmtStats?.c100 ?? "—" : p.avg ?? "—"]])
    : [[ML, 0], ["Status", "Uncapped/new"]];
  if (test && bowler && p.fmtStats) stats[2] = ["5W", p.fmtStats.w5 ?? 0];
  const span = F.id === "ipl" ? "IPL 2008-2026" : `${F.short} ${p.fmtStats?.first ?? ""}-${p.fmtStats?.last ?? ""}`;
  const ticker = `LOT ${lot.seq} · ROUND ${lot.round} · ${info.set.toUpperCase()} · BASE ${fmtCr(info.base)} · ${p.country.toUpperCase()} · ${p.role.toUpperCase()} · CAREER STATS: ${span} (CRICSHEET)`;
  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(2,4,12,.72) 0%, rgba(2,4,12,.25) 55%, rgba(2,4,12,.55) 100%), linear-gradient(0deg, rgba(2,4,12,.85), transparent 35%)" }} />
      <div className="relative flex items-start justify-between p-3 sm:p-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/55 backdrop-blur border border-white/10 px-2.5 py-1 text-[10px] sm:text-[11px] uppercase tracking-wider">Lot {lot.seq} · Round {lot.round}</span>
          <span className="rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-black" style={{ background: "linear-gradient(90deg,#FFE7A3,#F5C542)" }}>{info.set}</span>
          {st.paused && <span className="rounded-full bg-amber-500/90 text-black px-2.5 py-1 text-[11px] font-bold">PAUSED</span>}
        </div>
        <Ring secs={secs} total={total} phase={lot.phase} paused={!!st.paused} />
      </div>
      <div className="relative flex-1 min-h-0 flex items-center gap-3 sm:gap-6 px-3 sm:px-6 pb-9 sm:pb-10">
        <Portrait p={p} st={st} glow={glow} />
        <div className="min-w-0 flex-1">
          <motion.div key={p.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div className="text-[9px] sm:text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">{p.country}{F.id === "ipl" ? `${p.overseas ? " · Overseas" : ""}${p.capped ? " · Capped" : " · Uncapped"}` : ` · ${F.short} ${p.fmtStats?.active ? "active" : "career"}`}</div>
            <div className="font-display font-semibold leading-[0.95] tracking-tight text-[clamp(1.35rem,5.4vw,3.6rem)] break-words" style={{ textShadow: "0 4px 30px rgba(0,0,0,.6)" }}>{p.name}</div>
            <div className="mt-1 text-[11px] sm:text-sm text-white/65 truncate">{p.role}{p.batting ? ` · ${p.batting}` : ""}{p.bowling ? ` · ${p.bowling}` : ""}</div>
            <div className="mt-2 sm:mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-w-[420px]">{stats.map(([l, v], i) => <div key={l} className={i >= 2 ? "hidden sm:block" : ""}><StatTile l={l} v={v} /></div>)}</div>
          </motion.div>
          <div className="mt-2 sm:mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-amber-300/90">{info.bid != null ? "Current bid" : lot.phase === "sealed" ? "Sealed bids" : "Base price"}</div>
              <motion.div key={String(amount) + (info.leader?.short || "")} initial={{ scale: 1.18, filter: "brightness(1.8)" }} animate={{ scale: 1, filter: "brightness(1)" }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="origin-left font-display font-bold gold-text tnum leading-none text-[clamp(1.9rem,7vw,4.4rem)]" style={{ filter: "drop-shadow(0 0 18px rgba(245,197,66,.35))" }}>
                {lot.phase === "sealed" ? "Sealed" : fmtCr(amount)}
              </motion.div>
              {over > 0 && <div className="text-[10px] text-white/55 mt-0.5 tnum">+{over}% over base {fmtCr(info.base)}</div>}
            </div>
            <AnimatePresence mode="popLayout">
              {info.leader && (
                <motion.div key={info.leader.short} initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 rounded-xl pl-1.5 pr-3 py-1.5 border border-white/15" style={{ background: `linear-gradient(90deg, ${info.leader.primary}, ${info.leader.secondary}cc)`, boxShadow: `0 0 30px -6px ${info.leader.primary}` }}>
                  <Emblem id={lot.leader} room={st} size={28} />
                  <div className="leading-tight"><div className="text-[8px] uppercase tracking-widest text-white/75">Leading</div><div className="font-display font-semibold text-sm sm:text-base">{info.leader.short}</div></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-7 sm:h-8 overflow-hidden border-t border-white/10 bg-black/60 backdrop-blur flex items-center">
        <div className="shrink-0 h-full px-2.5 flex items-center text-[10px] font-bold tracking-widest text-black" style={{ background: "linear-gradient(90deg,#FF5C8A,#F5C542)" }}>LIVE</div>
        {line ? (
            <motion.div key={line.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}
              className={`min-w-0 flex-1 px-3 truncate text-[11px] sm:text-[13px] font-medium ${line.tone === "hot" ? "text-amber-200" : line.tone === "result" ? "text-white" : line.tone === "info" ? "text-cyan-100/85" : "text-white/90"}`} data-testid="text-commentary-caption">
              {line.text}
            </motion.div>
        ) : (
          <div className="flex whitespace-nowrap animate-[ticker_32s_linear_infinite] text-[10px] sm:text-[11px] tracking-[0.18em] text-white/75">
            <span className="px-6">{ticker}</span><span className="px-6">{ticker}</span>
          </div>
        )}
        {line && <span className="shrink-0 pr-2 text-[8px] uppercase tracking-widest text-white/40 hidden sm:inline">Generated commentary</span>}
      </div>
      <AnimatePresence><SoldBurst st={st} color={glow} /></AnimatePresence>
    </div>
  );
}
