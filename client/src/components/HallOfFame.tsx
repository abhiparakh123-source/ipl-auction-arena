import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, MapPin, Calendar, Crown } from "lucide-react";
import { usePlayers, teamColor } from "@/lib/data";
import { PlayerAvatar, Emblem, Kind } from "@/components/game";
import { sfx } from "@/lib/sound";

// Franchises that no longer exist keep their historical colours (Deccan Chargers, Rising Pune Supergiant, etc.)
export const DEFUNCT = { teams: [
  { id: "DCH", name: "Deccan Chargers", short: "DCH", primary: "#1C3F7A", secondary: "#C9CED6" },
  { id: "RPS", name: "Rising Pune Supergiant", short: "RPS", primary: "#5B2C83", secondary: "#E64B8B" },
  { id: "GL", name: "Gujarat Lions", short: "GL", primary: "#E04F16", secondary: "#F2C230" },
  { id: "PWI", name: "Pune Warriors India", short: "PWI", primary: "#2F6FB5", secondary: "#9AD2F2" },
  { id: "KTK", name: "Kochi Tuskers Kerala", short: "KTK", primary: "#E86A1C", secondary: "#6B3A87" },
] };
export const hofColor = (id?: string | null) => { const d = DEFUNCT.teams.find((t) => t.id === id); return d ? { ...d } : teamColor(id); };
export const brightOf = (c: { primary: string; secondary: string }) => (["#1B2133", "#0B1F4E", "#1C3F7A"].includes(c.primary) ? c.secondary : c.primary);

export interface HofSeason {
  year: number; matches: number;
  final: { date: string; venue: string; city: string; winner: string; runnerUp: string; winnerId: string; runnerUpId: string; by: { runs?: number; wickets?: number }; scores: Record<string, { runs: number; wkts: number; balls: number }>; pom: { name: string; pid: string | null }[]; source: string };
  orange: { name: string; pid: string | null; runs: number }; purple: { name: string; pid: string | null; wkts: number }; sixes: { name: string; pid: string | null; n: number };
}
export function useHof() { return useQuery<any>({ queryKey: ["/api/halloffame"], staleTime: Infinity }); }

const ov = (b: number) => `${Math.floor(b / 6)}${b % 6 ? "." + (b % 6) : ""}`;
const margin = (by: any) => (by?.runs ? `${by.runs} run${by.runs > 1 ? "s" : ""}` : by?.wickets ? `${by.wickets} wicket${by.wickets > 1 ? "s" : ""}` : "");
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function Trophy({ size = 120, glow = "#F5C542", className = "" }: { size?: number; glow?: string; className?: string }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className={className} aria-label="Trophy illustration">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset=".35" stopColor="#F5C542" /><stop offset=".7" stopColor="#B8860B" /><stop offset="1" stopColor="#FFE08A" /></linearGradient>
        <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9A92B" /><stop offset="1" stopColor="#7A5A0C" /></linearGradient>
        <radialGradient id="tgl" cx=".5" cy=".4" r=".6"><stop offset="0" stopColor={glow} stopOpacity=".55" /><stop offset="1" stopColor={glow} stopOpacity="0" /></radialGradient>
        <clipPath id="tcl"><path d="M28 10 H72 C72 40 66 56 50 62 C34 56 28 40 28 10 Z" /></clipPath>
      </defs>
      <circle cx="50" cy="45" r="50" fill="url(#tgl)" />
      <path d="M28 16 C14 16 12 34 30 42" fill="none" stroke="url(#tg)" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 16 C86 16 88 34 70 42" fill="none" stroke="url(#tg)" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 10 H72 C72 40 66 56 50 62 C34 56 28 40 28 10 Z" fill="url(#tg)" />
      <g clipPath="url(#tcl)"><rect className="trophy-glint" x="-30" y="0" width="16" height="70" fill="#fff" opacity=".55" transform="skewX(-20)" /></g>
      <path d="M44 62 H56 L54 78 H46 Z" fill="url(#tg2)" />
      <ellipse cx="50" cy="80" rx="14" ry="4" fill="url(#tg)" />
      <path d="M32 84 H68 L72 104 H28 Z" fill="url(#tg2)" />
      <rect x="24" y="104" width="52" height="8" rx="2" fill="url(#tg)" />
      <path d="M50 22 l3 6 6.5 1 -4.7 4.6 1.1 6.5 -5.9 -3.1 -5.9 3.1 1.1 -6.5 -4.7 -4.6 6.5 -1 z" fill="#FFF8DC" opacity=".85" />
    </svg>
  );
}

function TiltCard({ children, className = "", href, testid }: { children: React.ReactNode; className?: string; href?: string | null; testid?: string }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-12, 12]), { stiffness: 200, damping: 18 });
  const inner = (
    <motion.div className={`relative [transform-style:preserve-3d] ${className}`} style={{ rotateX: rx, rotateY: ry }}
      onPointerMove={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5); }}
      onPointerLeave={() => { x.set(0); y.set(0); }} whileTap={{ scale: 0.97 }} data-testid={testid}>
      {children}
    </motion.div>
  );
  return <div className="[perspective:900px]">{href ? <Link href={href}>{inner}</Link> : inner}</div>;
}

function AwardCard({ label, accent, person, value, look }: { label: string; accent: string; person: { name: string; pid: string | null }; value: string; look: (id: string) => any }) {
  const p = person.pid ? look(person.pid) : null;
  return (
    <TiltCard href={p ? `/players/${p.id}` : null} testid={`hof-award-${label.replace(/\W+/g, "-").toLowerCase()}`}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-2.5 sm:p-3 w-[132px] sm:w-[160px] cursor-pointer" style={{ boxShadow: `0 10px 40px -12px ${accent}` }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] mb-2 font-semibold" style={{ color: accent }}>{label}</div>
        <div className="relative mx-auto w-fit [transform:translateZ(30px)]">
          {p ? <PlayerAvatar p={p} size={96} rounded="rounded-xl" className="ring-1 ring-white/15" /> : <div className="h-24 w-24 rounded-xl bg-white/5 grid place-items-center text-2xl font-display">{person.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>}
        </div>
        <div className="mt-2 font-display text-sm sm:text-[15px] font-semibold leading-tight truncate">{p?.name || person.name}</div>
        <div className="font-display text-lg sm:text-xl tnum" style={{ color: accent }}>{value}</div>
        <div className="absolute inset-0 holo-shine pointer-events-none opacity-60" />
      </div>
    </TiltCard>
  );
}

function Confetti({ color, k }: { color: string; k: number }) {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ x: (Math.random() - 0.5) * 600, y: -Math.random() * 260 - 40, r: Math.random() * 600, c: i % 3 === 0 ? "#F5C542" : i % 3 === 1 ? color : "#fff", d: 1 + Math.random() })), [k, color]);
  return <div className="absolute left-[18%] top-[45%] pointer-events-none">{bits.map((b, i) => <motion.span key={k + "-" + i} className="absolute h-1.5 w-3 rounded-sm" style={{ background: b.c }} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: b.x, y: [0, b.y, b.y + 320], rotate: b.r, opacity: [1, 1, 0] }} transition={{ duration: b.d + 0.8, ease: "easeOut" }} />)}</div>;
}

/** Interactive season-by-season slideshow of IPL champions (2008 onward). */
export function SeasonSlideshow({ compact = false, filterTeam = null as string | null, onFilterClear }: { compact?: boolean; filterTeam?: string | null; onFilterClear?: () => void }) {
  const hof = useHof();
  const { look } = usePlayers();
  const all: HofSeason[] = hof.data?.seasons || [];
  const seasons = useMemo(() => [...all].reverse().filter((s) => !filterTeam || s.final.winnerId === filterTeam), [all, filterTeam]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(false);
  const [prog, setProg] = useState(0);
  const timeline = useRef<HTMLDivElement>(null);
  const DUR = 6500;
  useEffect(() => { setI(0); }, [filterTeam]);
  const go = (n: number, d?: number) => { if (!seasons.length) return; const nx = (n + seasons.length) % seasons.length; setDir(d ?? (nx > i ? 1 : -1)); setI(nx); setProg(0); sfx.click(); };
  useEffect(() => {
    if (!auto || hover || seasons.length < 2) return;
    const t0 = Date.now() - prog * DUR;
    const t = setInterval(() => { const p = (Date.now() - t0) / DUR; if (p >= 1) { setDir(1); setI((x) => (x + 1) % seasons.length); setProg(0); } else setProg(p); }, 60);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, hover, i, seasons.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === "INPUT") return; if (e.key === "ArrowRight") go(i + 1, 1); if (e.key === "ArrowLeft") go(i - 1, -1); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  });
  useEffect(() => { const el = timeline.current?.querySelector(`[data-idx="${i}"]`) as HTMLElement | null; const tl = timeline.current; if (el && tl) tl.scrollTo({ left: el.offsetLeft - tl.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" }); }, [i]);
  if (hof.isLoading || !seasons.length) return <div className={`rounded-3xl glass ${compact ? "h-[420px]" : "h-[560px]"} grid place-items-center text-sm text-muted-foreground`}>{hof.isLoading ? "Loading the Hall of Fame…" : "No seasons for this franchise."}</div>;
  const s = seasons[Math.min(i, seasons.length - 1)];
  const f = s.final; const wc = hofColor(f.winnerId), rc = hofColor(f.runnerUpId); const accent = brightOf(wc);
  const ws = f.scores[f.winner], rs = f.scores[f.runnerUp];
  const titleNo = all.filter((x) => x.final.winnerId === f.winnerId && x.year <= s.year).length;
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-testid="hof-slideshow">
      <div className={`relative overflow-hidden rounded-3xl border border-white/10 ${compact ? "min-h-[560px] sm:min-h-[520px]" : "min-h-[640px] sm:min-h-[600px]"}`} style={{ background: "#03060f" }}>
        <AnimatePresence initial={false} custom={dir}>
          <motion.div key={s.year} custom={dir} className="absolute inset-0"
            initial={{ opacity: 0, x: dir * 80, scale: 1.04 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -dir * 80, scale: 0.98 }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} onDragEnd={(_, info) => { if (info.offset.x < -60) go(i + 1, 1); else if (info.offset.x > 60) go(i - 1, -1); }}>
            {/* backdrop */}
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 18% 40%, ${wc.primary}cc, transparent 58%), radial-gradient(ellipse at 90% 10%, ${wc.secondary}55, transparent 50%), radial-gradient(ellipse at 80% 100%, ${rc.primary}33, transparent 55%), linear-gradient(180deg,#050a1a,#02040b)` }} />
            <div className="absolute inset-0 stage-beams opacity-70" />
            <div className="absolute inset-0 hof-sparkle pointer-events-none" />
            <div className="absolute -right-4 sm:right-4 top-1/2 -translate-y-1/2 font-display font-bold leading-none select-none pointer-events-none text-[38vw] sm:text-[220px] md:text-[300px] text-transparent" style={{ WebkitTextStroke: `2px ${accent}40` }}>{s.year}</div>
            <Confetti color={accent} k={s.year} />
            {/* content */}
            <div className="relative h-full flex flex-col justify-center gap-5 px-5 pt-14 pb-6 sm:px-16 sm:pt-12 sm:pb-8">
              <div className="min-w-0 flex gap-4 sm:gap-6 items-center">
                <motion.div initial={{ y: 30, rotate: -8, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 120 }} className="shrink-0 trophy-float">
                  <div className="hidden sm:block"><Trophy size={compact ? 84 : 110} glow={accent} /></div><div className="sm:hidden"><Trophy size={56} glow={accent} /></div>
                </motion.div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.3em] text-amber-200/90"><Crown className="h-3.5 w-3.5" />IPL {s.year} champions{titleNo > 1 ? ` · title #${titleNo}` : " · first title"}</div>
                  <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-3 mt-1.5">
                    <Emblem id={f.winnerId} room={DEFUNCT.teams.some((t) => t.id === f.winnerId) ? DEFUNCT : undefined} size={compact ? 46 : 58} />
                    <h3 className="font-display font-semibold leading-[0.95] text-[clamp(1.45rem,4.2vw,3.1rem)] break-words hyphens-auto" style={{ textShadow: `0 4px 40px ${accent}66` }} data-testid="text-hof-champion">{f.winner}</h3>
                  </motion.div>
                  <div className="mt-3 text-sm sm:text-base text-white/80">beat <span className="font-semibold" style={{ color: brightOf(rc) }}>{f.runnerUp}</span> by {margin(f.by)}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm">
                    {[[f.runnerUp, rs, rc], [f.winner, ws, wc]].filter((x) => x[1]).map(([n, sc, c]: any) => (
                      <span key={n} className="rounded-lg bg-black/45 border border-white/10 px-2.5 py-1 tnum"><span className="font-semibold" style={{ color: brightOf(c) }}>{c.short}</span> {sc.runs}/{sc.wkts} <span className="text-white/50">({ov(sc.balls)} ov)</span></span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] sm:text-xs text-white/55">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.venue}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(f.date)} · {s.matches} matches</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5 sm:gap-3 justify-start overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
                {f.pom[0] && <AwardCard label="Player of the final" accent="#F5C542" person={f.pom[0]} value="Final MVP" look={look} />}
                <AwardCard label="Most runs" accent="#FF9F2E" person={s.orange} value={`${s.orange.runs} runs`} look={look} />
                <AwardCard label="Most wickets" accent="#B07CFF" person={s.purple} value={`${s.purple.wkts} wkts`} look={look} />
                {!compact && <AwardCard label="Most sixes" accent="#22E4FF" person={s.sixes} value={`${s.sixes.n} sixes`} look={look} />}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        {/* controls */}
        <button onClick={() => go(i - 1, -1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/50 backdrop-blur border border-white/15 grid place-items-center hover:bg-black/70" aria-label="Previous season" data-testid="button-hof-prev"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={() => go(i + 1, 1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/50 backdrop-blur border border-white/15 grid place-items-center hover:bg-black/70" aria-label="Next season" data-testid="button-hof-next"><ChevronRight className="h-5 w-5" /></button>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {filterTeam && <button onClick={onFilterClear} className="rounded-full bg-black/50 border border-white/15 px-2.5 py-1 text-[11px]" data-testid="button-hof-clear">Showing {hofColor(filterTeam).short} titles · clear</button>}
          <Kind k="historical" />
          <button onClick={() => setAuto(!auto)} className="h-8 w-8 rounded-full bg-black/50 border border-white/15 grid place-items-center" aria-label={auto ? "Pause slideshow" : "Play slideshow"} data-testid="button-hof-autoplay">{auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5 z-10"><div className="h-full" style={{ width: `${(auto ? prog : 0) * 100}%`, background: accent, transition: "width 60ms linear" }} /></div>
      </div>
      {/* timeline */}
      <div ref={timeline} className="relative mt-3 flex gap-1.5 overflow-x-auto scrollbar-thin pb-1" data-testid="hof-timeline">
        {seasons.map((x, k) => { const c = hofColor(x.final.winnerId); const on = k === i; return (
          <button key={x.year} data-idx={k} onClick={() => go(k)} className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition-all ${on ? "border-white/40 bg-white/10 scale-105" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"}`} data-testid={`button-hof-year-${x.year}`}>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: brightOf(c), boxShadow: on ? `0 0 10px ${brightOf(c)}` : "none" }} /><span className="font-display text-sm tnum">{x.year}</span></div>
            <div className="text-[10px] text-muted-foreground">{c.short}</div>
          </button>
        ); })}
      </div>
    </div>
  );
}
