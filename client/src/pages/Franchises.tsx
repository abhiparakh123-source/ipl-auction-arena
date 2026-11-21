import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { usePlayers } from "@/lib/data";
import { realTeams, analyzeLocal } from "@/lib/analysis";
import { PageHeader, Panel, Emblem, PlayerAvatar, RoleChip, Stat, Kind, Explain, Bar } from "@/components/game";
import { FRANCHISES, FRANCHISE_BY_ID, fmtCr } from "@shared/game";
import { Button } from "@/components/ui/button";
import { useCreateRoom } from "@/pages/Home";
import { MapPin } from "lucide-react";

export default function Franchises() {
  const search = useSearch();
  const initial = new URLSearchParams(search).get("team");
  const [sel, setSel] = useState(initial && FRANCHISE_BY_ID[initial] ? initial : "CSK");
  const { list, look } = usePlayers();
  const teams = useMemo(() => realTeams(list), [list]);
  const f = FRANCHISE_BY_ID[sel];
  const t = teams.find((x) => x.id === sel);
  const a = useMemo(() => (t && t.squad.length ? analyzeLocal(teams, sel, look) : null), [teams, sel, look]);
  const ps = (t?.squad || []).map((s) => ({ s, p: look(s.pid)! })).filter((x) => x.p).sort((x, y) => y.s.price - x.s.price);
  const alumni = list.filter((p) => p.teams.includes(sel)).sort((x, y) => y.runs + y.wkts * 25 - (x.runs + x.wkts * 25)).slice(0, 10);
  const create = useCreateRoom();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Franchise Manager" title="All 10 franchises" sub="Real IPL 2026 squads and prices from Wikipedia's 2026 personnel changes list. Emblems are original monograms in team colours, not official logos." />
      <div className="grid grid-cols-5 lg:grid-cols-10 gap-2">
        {FRANCHISES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={`rounded-2xl p-2 flex flex-col items-center gap-1 border transition ${sel === x.id ? "border-cyan-300 bg-white/5" : "border-white/5 bg-white/[0.02] hover:bg-white/5"}`} data-testid={`franchise-${x.id}`}>
            <Emblem id={x.id} size={40} /><span className="text-xs font-semibold">{x.short}</span>
          </button>
        ))}
      </div>
      <div className="rounded-3xl p-6 relative overflow-hidden glass-strong" style={{ background: `linear-gradient(120deg, ${f.primary}55, ${f.secondary}33 60%, transparent)` }}>
        <div className="flex flex-wrap items-center gap-5">
          <Emblem id={sel} size={88} />
          <div className="min-w-0"><h2 className="font-display text-3xl md:text-4xl font-bold" data-testid="text-franchise-name">{f.name}</h2><div className="text-sm text-slate-200/80 flex items-center gap-1"><MapPin className="h-4 w-4" />{f.city} · {f.home}</div>
            <div className="flex gap-2 mt-2">{[f.primary, f.secondary, f.accent].map((c) => <span key={c} className="h-5 w-10 rounded" style={{ background: c }} title={c} />)}</div></div>
          <div className="ml-auto flex gap-2"><Button onClick={() => create({ mode: "mega", universe: "real2026", team: sel } as any)} data-testid="button-play-as">Play a 2026 season as {f.short}</Button></div>
        </div>
      </div>
      {a && t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Stat label="Squad" value={t.squad.length} /><Stat label="Spent on squad" value={fmtCr(120 - t.purse)} sub="2026 prices" /><Stat label="Overseas" value={a.composition.overseas} /><Stat label="Squad rating" value={a.rating.overall} sub="calculated" accent="#22E4FF" />
            <Stat label="Batting" value={a.rating.batting} /><Stat label="Bowling" value={a.rating.bowling} /><Stat label="Avg age" value={a.composition.avgAge || "—"} /><Stat label="Most expensive" value={ps[0] ? fmtCr(ps[0].s.price) : "—"} sub={ps[0]?.p.name} />
          </div>
          <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
            <Panel title="2026 squad" kind="historical">
              <div className="grid sm:grid-cols-2 gap-2">{ps.map(({ s, p }) => (
                <Link key={p.id} href={`/players/${p.id}`} className="flex items-center gap-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] p-2" data-testid={`squad-${p.id}`}>
                  <PlayerAvatar p={p} size={44} team={sel} /><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{p.name}</div><div className="flex items-center gap-1.5"><RoleChip p={p} />{p.overseas && <span className="text-[10px] text-violet-300">OS</span>}</div></div><span className="tnum text-sm">{s.price ? fmtCr(s.price) : "—"}</span>
                </Link>
              ))}</div>
            </Panel>
            <div className="space-y-4">
              <Panel title="Projected XI & leadership" kind="calculated">
                {a.xi.xi.map((pid: string, i: number) => { const p = look(pid); return p && <div key={pid} className="flex text-sm py-0.5 gap-2"><span className="w-4 text-xs text-muted-foreground tnum">{i + 1}</span><span className="flex-1 truncate">{p.name}{pid === a.captain.captain && <b className="text-amber-300"> (C)</b>}</span><RoleChip p={p} /></div>; })}
                <Explain>Auto-selected by the calculated XI model — not the franchise's announced XI.</Explain>
              </Panel>
              <Panel title="Component ratings" kind="calculated">
                {[["Batting", a.rating.batting], ["Bowling", a.rating.bowling], ["Pace", a.rating.pace], ["Spin", a.rating.spin], ["All-round", a.rating.allround], ["Bench", a.rating.bench]].map(([k, v]) => <div key={k as string} className="flex items-center gap-2 text-sm mb-1"><span className="w-20">{k}</span><div className="flex-1"><Bar value={v as number} color={f.primary === "#1B2133" ? f.secondary : f.primary} /></div><span className="tnum w-10 text-right">{v}</span></div>)}
              </Panel>
              <Panel title="Franchise greats (in this dataset)" kind="historical">
                {alumni.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="flex text-sm py-0.5 hover:text-cyan-200"><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground tnum">{p.runs} r · {p.wkts} w (career)</span></Link>)}
                <Explain>Players who appeared for {f.short} in Cricsheet records, ordered by career IPL output (all teams).</Explain>
              </Panel>
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2"><Kind k="historical" /><span className="text-xs text-muted-foreground">Squads: <a className="underline" href="https://en.wikipedia.org/wiki/List_of_2026_Indian_Premier_League_personnel_changes" target="_blank" rel="noreferrer">Wikipedia 2026 personnel changes</a>. Room franchises, tactical boards and in-game records live inside each auction room.</span></div>
    </div>
  );
}
