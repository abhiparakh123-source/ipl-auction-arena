import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers, num } from "@/lib/data";
import { PageHeader, Panel, PlayerAvatar, Kind, Explain } from "@/components/game";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from "recharts";
import { X } from "lucide-react";

const COLORS = ["#22E4FF", "#F5C542", "#B983FF", "#FF5C8A"];
const TT = { contentStyle: { background: "#0b1226", border: "1px solid #1e293b", fontSize: 12 } };
type Board = { label: string; f: (p: any) => number | null; fmt: (p: any) => string; min?: (p: any) => boolean; asc?: boolean; kind?: "historical" | "calculated" };
const BOARDS: Record<string, Board> = {
  runs: { label: "Most runs", f: (p) => p.runs, fmt: (p) => `${p.runs}` },
  wkts: { label: "Most wickets", f: (p) => p.wkts, fmt: (p) => `${p.wkts}` },
  sr: { label: "Strike rate (min 500 runs)", f: (p) => p.sr, fmt: (p) => num(p.sr), min: (p) => p.runs >= 500 },
  avg: { label: "Batting average (min 500 runs)", f: (p) => p.avg, fmt: (p) => num(p.avg), min: (p) => p.runs >= 500 },
  econ: { label: "Economy (min 30 wkts)", f: (p) => p.econ, fmt: (p) => num(p.econ, 2), min: (p) => p.wkts >= 30, asc: true },
  matches: { label: "Most matches", f: (p) => p.matches, fmt: (p) => `${p.matches}` },
  form: { label: "Current form", f: (p) => p.ratings.form ?? null, fmt: (p) => num(p.ratings.form, 0), kind: "calculated" },
  consistency: { label: "Consistency", f: (p) => p.ratings.consistency ?? null, fmt: (p) => `${p.ratings.consistency}`, min: (p) => p.matches >= 20, kind: "calculated" },
  death: { label: "Death-overs specialists (share of balls 16-20)", f: (p) => p.deathShare ?? null, fmt: (p) => `${Math.round((p.deathShare || 0) * 100)}%`, min: (p) => p.matches >= 20, kind: "calculated" },
  pp: { label: "Powerplay specialists (share of balls 1-6)", f: (p) => p.ppShare ?? null, fmt: (p) => `${Math.round((p.ppShare || 0) * 100)}%`, min: (p) => p.matches >= 20, kind: "calculated" },
};

export default function StatsHub() {
  const { list } = usePlayers();
  const [board, setBoard] = useState("runs");
  const [role, setRole] = useState("all");
  const [scope, setScope] = useState("all");
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const b = BOARDS[board];
  const rows = useMemo(() => list.filter((p) => !p.custom && (role === "all" || p.role === role) && (scope === "all" || (scope === "active" ? !p.retired && (p.lastSeason ?? 0) >= 2025 : !!p.team2026)) && (!b.min || b.min(p)) && b.f(p) != null)
    .sort((x, y) => (b.asc ? 1 : -1) * ((b.f(x) as number) - (b.f(y) as number))).slice(0, 25), [list, board, role, scope]);
  const details = useQueries({ queries: ids.map((id) => ({ queryKey: ["player", id], queryFn: () => api<any>("GET", `/api/players/${id}`) })) });
  const ds = details.map((d) => d.data).filter(Boolean) as any[];
  const years = [...new Set(ds.flatMap((d) => Object.keys(d.ipl?.seasons || {})))].sort();
  const trend = years.map((y) => ({ y, ...Object.fromEntries(ds.flatMap((d) => { const s = d.ipl.seasons[y]; return [[d.name + " runs", s?.bat?.runs ?? null], [d.name + " wkts", s?.bowl?.wkts ?? null]]; })) }));
  const phase = ["pp", "mid", "death"].map((k) => ({ k: k === "pp" ? "Powerplay" : k === "mid" ? "Middle" : "Death", ...Object.fromEntries(ds.map((d) => { const x = d.phaseBat?.[k]; return [d.name, x?.balls ? +((x.runs / x.balls) * 100).toFixed(1) : 0]; })) }));
  const ps = ["Pace", "Spin"].map((k) => ({ k: `vs ${k}`, ...Object.fromEntries(ds.map((d) => { const x = d.vsPaceSpin?.[k]; return [d.name, x?.balls ? +((x.runs / x.balls) * 100).toFixed(1) : 0]; })) }));
  const hasBat = ds.some((d) => (d.ipl?.bat?.runs || 0) > 100), hasBowl = ds.some((d) => (d.ipl?.bowl?.wkts || 0) > 5);
  const cands = q.length >= 2 ? list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Statistics Hub" title="Real IPL numbers, 2008–2026" sub="Computed from Cricsheet ball-by-ball records. Calculated metrics are labelled separately." />
      <div className="grid xl:grid-cols-[1fr_1.2fr] gap-4">
        <Panel title="Leaderboards" kind={b.kind || "historical"} right={<div className="flex gap-2">
          <Select value={board} onValueChange={setBoard}><SelectTrigger className="h-8 w-56" data-testid="select-board"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(BOARDS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
        </div>}>
          <div className="flex gap-2 mb-3">
            <Select value={role} onValueChange={setRole}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{["Batter", "Wicket-keeper", "All-rounder", "Bowler"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
            <Select value={scope} onValueChange={setScope}><SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All-time</SelectItem><SelectItem value="active">Active (2025+)</SelectItem><SelectItem value="2026">2026 squads</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1">{rows.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 text-sm" data-testid={`board-row-${i}`}>
              <span className="w-5 tnum text-muted-foreground text-xs">{i + 1}</span><PlayerAvatar p={p} size={26} team={p.team2026} rounded="rounded-md" />
              <Link href={`/players/${p.id}`} className="flex-1 truncate hover:text-cyan-200">{p.name}</Link>
              <button className="text-[10px] rounded bg-white/5 px-1.5" onClick={() => setIds([...ids.filter((x) => x !== p.id), p.id].slice(-4))}>+ compare</button>
              <b className="tnum w-14 text-right">{b.fmt(p)}</b>
            </div>
          ))}</div>
        </Panel>
        <Panel title="Multi-player comparison" kind="historical">
          <div className="relative mb-2"><Input placeholder="Add players (up to 4)…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-stats-compare" />{cands.length > 0 && <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg p-1">{cands.map((p) => <button key={p.id} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-white/5" onClick={() => { setIds([...ids.filter((x) => x !== p.id), p.id].slice(-4)); setQ(""); }}>{p.name}</button>)}</div>}</div>
          <div className="flex flex-wrap gap-2 mb-3">{ds.map((d, i) => <span key={d.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: COLORS[i] + "22", color: COLORS[i] }}>{d.name}<button onClick={() => setIds(ids.filter((x) => x !== d.id))} aria-label="Remove"><X className="h-3 w-3" /></button></span>)}</div>
          {!ds.length ? <div className="text-sm text-muted-foreground">Add players from the leaderboard or search to chart season trends, phase strike rates and pace vs spin splits.</div> : (
            <div className="space-y-4">
              <div className="h-56"><div className="text-xs text-muted-foreground mb-1">Season trend ({hasBat ? "runs" : ""}{hasBat && hasBowl ? " solid, " : ""}{hasBowl ? "wickets dashed" : ""})</div><ResponsiveContainer><LineChart data={trend}><XAxis dataKey="y" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={10} /><Tooltip {...TT} /><Legend wrapperStyle={{ fontSize: 11 }} />{ds.map((d, i) => hasBat && <Line key={d.id + "r"} dataKey={d.name + " runs"} stroke={COLORS[i]} dot={false} connectNulls strokeWidth={2} />)}{ds.map((d, i) => hasBowl && <Line key={d.id + "w"} dataKey={d.name + " wkts"} stroke={COLORS[i]} strokeDasharray="4 3" dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="h-48"><div className="text-xs text-muted-foreground mb-1">Batting strike rate by phase</div><ResponsiveContainer><BarChart data={phase}><XAxis dataKey="k" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={10} /><Tooltip {...TT} />{ds.map((d, i) => <Bar key={d.id} dataKey={d.name} fill={COLORS[i]} />)}</BarChart></ResponsiveContainer></div>
                <div className="h-48"><div className="text-xs text-muted-foreground mb-1">Strike rate vs pace / spin</div><ResponsiveContainer><BarChart data={ps}><XAxis dataKey="k" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={10} /><Tooltip {...TT} />{ds.map((d, i) => <Bar key={d.id} dataKey={d.name} fill={COLORS[i]} />)}</BarChart></ResponsiveContainer></div>
              </div>
              <table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left">Player</th><th className="text-right">Dot % (bat)</th><th className="text-right">Chase avg</th><th className="text-right">Home SR</th><th className="text-right">Away SR</th><th className="text-right">Death econ</th></tr></thead>
                <tbody>{ds.map((d, i) => { const bt = d.ipl?.bat || {}; const sr = (x: any) => (x?.balls ? ((x.runs / x.balls) * 100).toFixed(1) : "—"); const de = d.phaseBowl?.death; return <tr key={d.id} className="border-t border-white/5"><td className="py-1" style={{ color: COLORS[i] }}>{d.name}</td><td className="text-right tnum">{bt.balls ? ((bt.dots / bt.balls) * 100).toFixed(1) : "—"}</td><td className="text-right tnum">{d.chase?.outs ? (d.chase.runs / d.chase.outs).toFixed(1) : "—"}</td><td className="text-right tnum">{sr(d.home)}</td><td className="text-right tnum">{sr(d.away)}</td><td className="text-right tnum">{de?.balls ? ((de.runs / de.balls) * 6).toFixed(2) : "—"}</td></tr>; })}</tbody></table>
            </div>
          )}
        </Panel>
      </div>
      <Explain>Source: Cricsheet IPL data (ODC-BY), 1,243 matches 2008–2026. Phase splits use overs 1–6, 7–15 and 16–20. "Pressure" uses innings batting second (chasing). Venue and opponent splits are on each player's profile.</Explain>
      <div className="flex gap-2"><Kind k="historical" /><Kind k="calculated" /></div>
    </div>
  );
}
