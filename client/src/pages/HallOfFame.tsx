import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { usePlayers, num } from "@/lib/data";
import { PlayerAvatar, Emblem, Panel, Kind } from "@/components/game";
import { SeasonSlideshow, Trophy, useHof, hofColor, brightOf, DEFUNCT } from "@/components/HallOfFame";
import { sfx } from "@/lib/sound";
import { Sparkles, RotateCw } from "lucide-react";

function Cabinet({ onPick, active }: { onPick: (t: string | null) => void; active: string | null }) {
  const hof = useHof();
  const titles: { team: string; n: number; years: number[] }[] = hof.data?.titles || [];
  const max = Math.max(1, ...titles.map((t) => t.n));
  return (
    <Panel title="Trophy cabinet" kind="historical" right={<span className="text-[11px] text-muted-foreground">Tap a franchise to replay its title wins</span>}>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {titles.map((t, k) => {
          const c = hofColor(t.team); const on = active === t.team;
          return (
            <motion.button key={t.team} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.05 }}
              onClick={() => { sfx.click(); onPick(on ? null : t.team); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${on ? "border-amber-300/60" : "border-white/10 hover:border-white/25"}`}
              style={{ background: `linear-gradient(100deg, ${c.primary}55, rgba(5,10,25,.6) 60%)` }} data-testid={`button-cabinet-${t.team}`}>
              <div className="flex items-center gap-3">
                <Emblem id={t.team} room={DEFUNCT.teams.some((d) => d.id === t.team) ? DEFUNCT : undefined} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold leading-tight text-sm sm:text-base">{c.name}</div>
                  <div className="text-[11px] text-white/60 tnum">{t.years.join(" · ")}</div>
                </div>
                <div className="font-display text-3xl font-bold gold-text tnum">{t.n}</div>
              </div>
              <div className="mt-2 flex gap-1">{Array.from({ length: t.n }).map((_, j) => <motion.div key={j} whileHover={{ y: -4, rotate: -6 }} className="trophy-mini"><Trophy size={18} glow={brightOf(c)} /></motion.div>)}</div>
              <div className="absolute bottom-0 left-0 h-0.5 bg-amber-300/70 transition-all" style={{ width: `${(t.n / max) * 100}%` }} />
            </motion.button>
          );
        })}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">Deccan Chargers (2009) is listed separately from Sunrisers Hyderabad: they were different franchises.</div>
    </Panel>
  );
}

function Leaders() {
  const hof = useHof(); const { look } = usePlayers();
  const [tab, setTab] = useState<"runs" | "wkts" | "sixes">("runs");
  const rows: { name: string; pid: string | null; v: number }[] = hof.data?.allTime?.[tab] || [];
  const max = rows[0]?.v || 1;
  const label = { runs: "Runs", wkts: "Wickets", sixes: "Sixes" }[tab];
  const col = { runs: "#FF9F2E", wkts: "#B07CFF", sixes: "#22E4FF" }[tab];
  return (
    <Panel title="All-time IPL leaders" kind="historical" right={
      <div className="flex rounded-full border border-white/10 p-0.5">{(["runs", "wkts", "sixes"] as const).map((k) => <button key={k} onClick={() => { setTab(k); sfx.click(); }} className={`px-3 py-1 text-xs rounded-full ${tab === k ? "bg-white/10 text-white" : "text-muted-foreground"}`} data-testid={`tab-leaders-${k}`}>{({ runs: "Runs", wkts: "Wickets", sixes: "Sixes" })[k]}</button>)}</div>}>
      <div className="space-y-2">
        {rows.map((r, k) => { const p = r.pid ? look(r.pid) : null; return (
          <Link key={tab + r.name} href={p ? `/players/${p.id}` : "#"} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]" data-testid={`row-leader-${k}`}>
            <span className={`w-6 text-center font-display tnum ${k < 3 ? "gold-text text-lg" : "text-muted-foreground"}`}>{k + 1}</span>
            {p ? <PlayerAvatar p={p} size={38} rounded="rounded-lg" /> : <div className="h-[38px] w-[38px] rounded-lg bg-white/5" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2"><span className="font-medium truncate">{p?.name || r.name}</span><span className="font-display tnum">{r.v.toLocaleString("en-IN")}</span></div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-1"><motion.div key={tab} initial={{ width: 0 }} animate={{ width: `${(r.v / max) * 100}%` }} transition={{ duration: 0.8, delay: k * 0.04, ease: "easeOut" }} className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${col}, ${col}88)` }} /></div>
            </div>
          </Link>
        ); })}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">{label} across IPL 2008-2026, computed from Cricsheet ball-by-ball data.</div>
    </Panel>
  );
}

function LegendCard({ p, k }: { p: any; k: number }) {
  const [flip, setFlip] = useState(false);
  const c = hofColor(p.teams?.[p.teams.length - 1] || p.team2026);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (k % 6) * 0.05 }} className="[perspective:1000px]">
      <motion.button onClick={() => { setFlip(!flip); sfx.click(); }} animate={{ rotateY: flip ? 180 : 0 }} transition={{ duration: 0.6, type: "spring", stiffness: 90, damping: 14 }}
        className="relative block w-full aspect-[3/4] [transform-style:preserve-3d] text-left" data-testid={`card-legend-${p.id}`} aria-label={`${p.name}: tap to flip`}>
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 [backface-visibility:hidden]" style={{ background: `linear-gradient(160deg, ${c.primary}, #060a18 70%)` }}>
          <PlayerAvatar p={p} size={400} rounded="rounded-none" className="!w-full !h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
          <div className="absolute inset-0 holo-shine opacity-70 pointer-events-none" />
          <div className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-amber-200 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />Legend</div>
          <div className="absolute inset-x-0 bottom-0 p-2.5">
            <div className="font-display font-semibold leading-tight text-sm sm:text-base">{p.name}</div>
            <div className="text-[10px] text-white/60">{p.firstSeason}-{p.lastSeason} · {p.role}</div>
          </div>
          <RotateCw className="absolute right-2 top-2 h-3.5 w-3.5 text-white/50" />
        </div>
        <div className="absolute inset-0 rounded-2xl border border-amber-300/30 p-3 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col" style={{ background: `radial-gradient(ellipse at 50% 0%, ${c.primary}aa, #060a18 70%)` }}>
          <div className="font-display font-semibold leading-tight">{p.name}</div>
          <div className="text-[10px] text-white/60 mb-2">{p.country} · {(p.teams || []).join(", ")}</div>
          <div className="grid grid-cols-2 gap-1.5 text-center">
            {[["Matches", p.matches], ["Runs", p.runs], ["SR", num(p.sr, 1)], ["Wkts", p.wkts], ["Avg", num(p.avg, 1)], ["Econ", num(p.econ, 2)]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-black/40 border border-white/10 py-1"><div className="text-[8px] uppercase tracking-widest text-white/50">{l}</div><div className="font-display text-sm tnum">{v as any}</div></div>
            ))}
          </div>
          <Link href={`/players/${p.id}`} className="mt-auto text-[11px] text-cyan-300 hover:underline" onClick={(e) => e.stopPropagation()}>Full profile →</Link>
          <div className="text-[8px] text-white/40 mt-1">IPL career, Cricsheet</div>
        </div>
      </motion.button>
    </motion.div>
  );
}

export default function HallOfFamePage() {
  const [team, setTeam] = useState<string | null>(null);
  const { list } = usePlayers();
  const hof = useHof();
  const legends = useMemo(() => list.filter((p: any) => p.legend && p.matches >= 60).sort((a: any, b: any) => (b.runs + b.wkts * 25) - (a.runs + a.wkts * 25)).slice(0, 18), [list]);
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-8 hof-hero">
        <div className="absolute inset-0 stage-beams opacity-80" />
        <div className="absolute inset-0 hof-sparkle" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="trophy-float"><Trophy size={92} /></div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/90">19 seasons · 2008 to 2026</div>
            <h1 className="font-display text-4xl md:text-6xl font-semibold leading-[1]"><span className="gold-text">Hall of Fame</span></h1>
            <p className="mt-2 text-sm text-white/70 max-w-2xl">Every IPL final, its champion and the season's standout players. Swipe, use the arrows or your keyboard, or pick a year from the timeline. Tap a player to open their profile.</p>
          </div>
        </div>
      </section>
      <SeasonSlideshow filterTeam={team} onFilterClear={() => setTeam(null)} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Cabinet onPick={setTeam} active={team} />
        <Leaders />
      </div>
      <Panel title="Legends wall" kind="historical" right={<span className="text-[11px] text-muted-foreground">Tap a card to flip it</span>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">{legends.map((p, k) => <LegendCard key={p.id} p={p} k={k} />)}</div>
        <div className="mt-3 text-[11px] text-muted-foreground">Legends are players whose last IPL season was before 2026 and who played 60+ matches, ranked by combined career contribution. Photos are licensed Wikimedia Commons images where available; others show a kit illustration.</div>
      </Panel>
      <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2"><Kind k="historical" />
        Source: <a className="underline" href="https://cricsheet.org/downloads/ipl_json.zip" target="_blank" rel="noreferrer">Cricsheet IPL ball-by-ball data</a> (ODC-BY). {hof.data?.meta?.notes} See the <a className="underline" href="https://en.wikipedia.org/wiki/2026_Indian_Premier_League_final" target="_blank" rel="noreferrer">2026 final on Wikipedia</a> and the <a className="underline" href="https://www.cricinfo.com/series/ipl-2026-1510719/royal-challengers-bengaluru-vs-gujarat-titans-final-1535465/match-report" target="_blank" rel="noreferrer">ESPNcricinfo match report</a>.
      </div>
    </div>
  );
}
