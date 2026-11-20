import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayers, useMeta, num, download } from "@/lib/data";
import { api, API_BASE, getToken } from "@/lib/queryClient";
import { PageHeader, Panel, PlayerAvatar, RoleChip, Kind, Emblem } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FRANCHISES, fmtCr } from "@shared/game";
import { useToast } from "@/hooks/use-toast";
import { Search, Upload, Download, Copy as Dup, GitCompare, X, Database } from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend } from "recharts";

const SORTS: Record<string, [string, (p: any) => number]> = {
  overall: ["Rating", (p) => p.ratings.overall], runs: ["Runs", (p) => p.runs], wkts: ["Wickets", (p) => p.wkts], matches: ["Matches", (p) => p.matches],
  sr: ["Strike rate", (p) => p.sr || 0], avg: ["Average", (p) => p.avg || 0], econ: ["Economy (low)", (p) => -(p.econ || 99)], price: ["2026 price", (p) => p.price2026 || 0], base: ["Base price", (p) => p.basePrice], form: ["Form", (p) => p.ratings.form || 0],
};
const COLORS = ["#22E4FF", "#F5C542", "#B983FF", "#FF5C8A"];

export function Compare({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const { look } = usePlayers();
  const ps = ids.map(look).filter(Boolean) as any[];
  if (!ps.length) return null;
  const axes = [["Batting", (p: any) => p.ratings.bat], ["Bowling", (p: any) => p.ratings.bowl], ["Overall", (p: any) => p.ratings.overall], ["Form", (p: any) => p.ratings.form ?? 0], ["Consistency", (p: any) => p.ratings.consistency ?? 0], ["Experience", (p: any) => Math.min(100, p.matches / 2.5)]] as const;
  const data = axes.map(([k, f]) => ({ k, ...Object.fromEntries(ps.map((p) => [p.name, Math.round(f(p))])) }));
  const rows: [string, (p: any) => string][] = [["Role", (p) => p.role], ["Country", (p) => p.country], ["Matches", (p) => String(p.matches)], ["Runs", (p) => String(p.runs)], ["Bat avg", (p) => num(p.avg)], ["Strike rate", (p) => num(p.sr)], ["Wickets", (p) => String(p.wkts)], ["Economy", (p) => num(p.econ, 2)], ["2026 team", (p) => p.team2026 || "—"], ["2026 price", (p) => (p.price2026 ? fmtCr(p.price2026) : "—")]];
  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="panel-compare">
      <div className="h-72"><ResponsiveContainer><RadarChart data={data}><PolarGrid stroke="#334155" /><PolarAngleAxis dataKey="k" tick={{ fill: "#94a3b8", fontSize: 11 }} />{ps.map((p, i) => <Radar key={p.id} dataKey={p.name} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} />)}<Legend /></RadarChart></ResponsiveContainer></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th></th>{ps.map((p, i) => <th key={p.id} className="text-left pb-2"><div className="flex items-center gap-2"><PlayerAvatar p={p} size={32} rounded="rounded-md" /><span style={{ color: COLORS[i] }} className="truncate max-w-[7rem]">{p.name}</span>{onRemove && <button onClick={() => onRemove(p.id)} aria-label="Remove"><X className="h-3 w-3" /></button>}</div></th>)}</tr></thead>
        <tbody>{rows.map(([l, f]) => <tr key={l} className="border-t border-white/5"><td className="py-1 text-muted-foreground text-xs">{l}</td>{ps.map((p) => <td key={p.id} className="tnum">{f(p)}</td>)}</tr>)}</tbody></table>
        <div className="mt-2 flex gap-2"><Kind k="historical" /><span className="text-[11px] text-muted-foreground">Stats: Cricsheet IPL 2008–2026. Radar axes are calculated ratings.</span></div>
      </div>
    </div>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState("csv");
  const [text, setText] = useState("name,country,role,batting,bowling,capped,dob,basePrice,batRating,bowlRating\n");
  const [rep, setRep] = useState<any>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl glass-strong">
        <DialogHeader><DialogTitle>Import players (CSV or JSON)</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground">Rows matching an existing real player only update editable profile fields (never verified statistics). New names are created as custom players with user-supplied ratings and are labelled with provenance. Duplicates are reported.</div>
        <div className="flex gap-2 items-center"><Select value={format} onValueChange={setFormat}><SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="csv">CSV</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent></Select>
          <Input type="file" accept=".csv,.json,text/csv,application/json" className="h-9" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setText(await f.text()); setFormat(f.name.endsWith(".json") ? "json" : "csv"); }} data-testid="input-import-file" /></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" data-testid="input-import-text" />
        <Button onClick={async () => { try { const r = await api<any>("POST", "/api/players/import", { format, text }); setRep(r); qc.invalidateQueries({ queryKey: ["/api/players"] }); toast({ title: `Imported: ${r.created} created, ${r.updated} updated` }); } catch (e: any) { toast({ title: "Import failed", description: e.message, variant: "destructive" }); } }} data-testid="button-import">Import</Button>
        {rep && <div className="text-xs space-y-1"><div>Created {rep.created} · Updated {rep.updated} · Duplicates {rep.duplicates.length} · Errors {rep.errors.length}</div>{[...rep.duplicates, ...rep.errors].slice(0, 12).map((x: string, i: number) => <div key={i} className="text-amber-200">{x}</div>)}</div>}
      </DialogContent>
    </Dialog>
  );
}

export default function Players() {
  const { list, loading } = usePlayers();
  const meta = useMeta();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [country, setCountry] = useState("all");
  const [team, setTeam] = useState("all");
  const [cap, setCap] = useState("all");
  const [pool, setPool] = useState("active");
  const [sort, setSort] = useState("overall");
  const [fmt, setFmt] = useState<"ipl" | "t20i" | "odi" | "test">("ipl");
  const [cmp, setCmp] = useState<string[]>([]);
  const [lim, setLim] = useState(60);
  const [imp, setImp] = useState(false);
  const [dups, setDups] = useState(false);
  const dupQ = useQuery<any[]>({ queryKey: ["/api/players/duplicates"], enabled: dups });
  const countries = useMemo(() => [...new Set(list.map((p) => p.country))].sort(), [list]);
  const rows = useMemo(() => {
    const s = q.toLowerCase();
    const F = (p: any) => (fmt === "ipl" ? null : p.fmts?.[fmt]);
    return list.filter((p) =>
      (fmt === "ipl" ? !p.intlOnly : !!F(p)) &&
      (!s || p.name.toLowerCase().includes(s) || p.fullName.toLowerCase().includes(s)) && (role === "all" || p.role === role) && (country === "all" || p.country === country) &&
      (team === "all" || (team === "none" ? !p.team2026 : p.team2026 === team || (team.startsWith("h:") && p.teams.includes(team.slice(2))))) &&
      (cap === "all" || (cap === "capped" ? p.capped : cap === "uncapped" ? !p.capped : cap === "overseas" ? p.overseas : !p.overseas)) &&
      (pool === "all" || (pool === "active" ? (fmt === "ipl" ? !p.retired : !!F(p)?.active) : pool === "legend" ? p.legend : pool === "2026" ? !!p.team2026 : pool === "photo" ? !!p.photo : !!p.custom))
    ).sort((a, b) => (fmt !== "ipl" && sort === "overall" ? (F(b)?.overall || 0) - (F(a)?.overall || 0) : SORTS[sort][1](b) - SORTS[sort][1](a)));
  }, [list, q, role, country, team, cap, pool, sort, fmt]);
  const exp = async (fmt: string) => {
    const r = await fetch(`${API_BASE}/api/players/export?format=${fmt}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    download(`ipl-arena-players.${fmt}`, await r.text(), fmt === "csv" ? "text/csv" : "application/json");
  };
  return (
    <div>
      <PageHeader eyebrow="Player Universe" title="Every IPL and international player, real data" sub={`${list.length} players (${list.filter((p) => !p.intlOnly).length} IPL, ${list.filter((p) => p.intlOnly).length} international-only) · ${list.filter((p) => p.photo).length} with freely licensed photos · stats from ${meta?.data?.sources?.[0]?.name || "Cricsheet"}`}
        right={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setImp(true)} data-testid="button-open-import"><Upload className="h-4 w-4 mr-1" />Import</Button><Button variant="outline" size="sm" onClick={() => exp("csv")} data-testid="button-export-csv"><Download className="h-4 w-4 mr-1" />CSV</Button><Button variant="outline" size="sm" onClick={() => exp("json")}><Download className="h-4 w-4 mr-1" />JSON</Button><Button variant="outline" size="sm" onClick={() => setDups(!dups)} data-testid="button-dups"><Dup className="h-4 w-4 mr-1" />Duplicates</Button></div>} />
      <div className="glass rounded-2xl p-3 mb-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2">
        <div className="relative col-span-2"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Search players…" value={q} onChange={(e) => { setQ(e.target.value); setLim(60); }} data-testid="input-search" /></div>
        <Select value={fmt} onValueChange={(v) => { setFmt(v as any); setLim(60); }}><SelectTrigger className="h-9" data-testid="filter-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ipl">IPL players</SelectItem><SelectItem value="t20i">T20I record</SelectItem><SelectItem value="odi">ODI record</SelectItem><SelectItem value="test">Test record</SelectItem></SelectContent></Select>
        <Select value={role} onValueChange={setRole}><SelectTrigger className="h-9" data-testid="filter-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{["Batter", "Wicket-keeper", "All-rounder", "Bowler"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        <Select value={country} onValueChange={setCountry}><SelectTrigger className="h-9" data-testid="filter-country"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All countries</SelectItem>{countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={team} onValueChange={setTeam}><SelectTrigger className="h-9" data-testid="filter-team"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any team</SelectItem><SelectItem value="none">Not in a 2026 squad</SelectItem>{FRANCHISES.map((f) => <SelectItem key={f.id} value={f.id}>{f.short} 2026 squad</SelectItem>)}{FRANCHISES.map((f) => <SelectItem key={"h" + f.id} value={"h:" + f.id}>Ever played for {f.short}</SelectItem>)}</SelectContent></Select>
        <Select value={cap} onValueChange={setCap}><SelectTrigger className="h-9" data-testid="filter-cap"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Capped & uncapped</SelectItem><SelectItem value="capped">Capped</SelectItem><SelectItem value="uncapped">Uncapped</SelectItem><SelectItem value="overseas">Overseas</SelectItem><SelectItem value="indian">Indian</SelectItem></SelectContent></Select>
        <Select value={pool} onValueChange={setPool}><SelectTrigger className="h-9" data-testid="filter-pool"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active players</SelectItem><SelectItem value="all">All eras</SelectItem><SelectItem value="legend">Legends</SelectItem><SelectItem value="2026">2026 squads</SelectItem><SelectItem value="photo">With photo</SelectItem><SelectItem value="custom">Imported/custom</SelectItem></SelectContent></Select>
        <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-9" data-testid="sort"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORTS).map(([k, [l]]) => <SelectItem key={k} value={k}>Sort: {l}</SelectItem>)}</SelectContent></Select>
      </div>
      {cmp.length > 0 && <Panel title={<span className="flex items-center gap-2"><GitCompare className="h-4 w-4" />Compare ({cmp.length}/4)</span>} className="mb-4" right={<Button size="sm" variant="ghost" onClick={() => setCmp([])}>Clear</Button>}><Compare ids={cmp} onRemove={(id) => setCmp(cmp.filter((x) => x !== id))} /></Panel>}
      {dups && <Panel title="Possible duplicates" className="mb-4">{dupQ.data?.length ? dupQ.data.map((g, i) => <div key={i} className="text-sm mb-1">{g.map((p: any) => <Link key={p.id} href={`/players/${p.id}`} className="mr-3 underline decoration-dotted">{p.name} ({p.country}, {p.dob || "DOB n/a"}, {p.matches} m{p.custom ? ", custom" : ""})</Link>)}</div>) : <div className="text-sm text-muted-foreground">{dupQ.isLoading ? "Checking…" : "No likely duplicates. Same-name players with different birth dates are kept as separate people."}</div>}</Panel>}
      <div className="text-xs text-muted-foreground mb-2">{rows.length} matching players</div>
      {loading ? <div className="text-muted-foreground">Loading player database…</div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {rows.slice(0, lim).map((p) => (
            <div key={p.id} className="glass rounded-2xl p-3 flex gap-3 hover:ring-1 hover:ring-cyan-300/40 transition" data-testid={`card-player-${p.id}`}>
              <Link href={`/players/${p.id}`}><PlayerAvatar p={p} size={72} team={p.team2026} /></Link>
              <div className="min-w-0 flex-1">
                <Link href={`/players/${p.id}`} className="font-semibold truncate block hover:text-cyan-200">{p.name}</Link>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap"><RoleChip p={p} /><span className="text-[11px] text-muted-foreground">{p.country}{p.capped ? "" : " · uncapped"}</span>{p.custom && <span className="text-[10px] text-amber-300">custom</span>}</div>
                <div className="text-[11px] text-muted-foreground mt-1 tnum">{fmt !== "ipl" && p.fmts?.[fmt] ? `${fmt === "t20i" ? "T20I" : fmt === "odi" ? "ODI" : "Test"}: ${p.fmts[fmt]!.m} m · ${p.fmts[fmt]!.runs} runs · ${p.fmts[fmt]!.wkts} wkts` : p.intlOnly ? "International player · no IPL record" : `${p.matches} m · ${p.runs} runs · ${p.wkts} wkts`}</div>
                <div className="flex items-center gap-2 mt-1">{p.team2026 && <Emblem id={p.team2026} size={16} />}<span className="text-[11px]">{p.team2026 ? `${p.team2026} ${p.price2026 ? fmtCr(p.price2026) : ""}` : p.status}</span>
                  <span className="ml-auto font-display text-lg tnum text-cyan-200" title="Calculated rating">{(fmt !== "ipl" && p.fmts?.[fmt] ? p.fmts[fmt]!.overall : p.ratings.overall).toFixed(0)}</span>
                  <button className={`text-[10px] rounded px-1.5 py-0.5 ${cmp.includes(p.id) ? "bg-cyan-400 text-black" : "bg-white/5"}`} onClick={() => setCmp(cmp.includes(p.id) ? cmp.filter((x) => x !== p.id) : cmp.length >= 4 ? (toast({ title: "Compare up to 4 players" }), cmp) : [...cmp, p.id])} data-testid={`compare-${p.id}`}>VS</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length > lim && <div className="text-center mt-4"><Button variant="outline" onClick={() => setLim(lim + 60)} data-testid="button-more">Show more</Button></div>}
      <Panel title={<span className="flex items-center gap-2"><Database className="h-4 w-4" />Data provenance</span>} className="mt-6" kind="historical">
        <div className="text-xs text-muted-foreground mb-2">Dataset generated {meta?.data?.generated}. Statistics are computed from ball-by-ball records, never typed by hand. Ratings and base prices are calculated metrics.</div>
        <div className="grid md:grid-cols-2 gap-2">{meta?.data?.sources?.map((s: any) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.03] hover:bg-white/[0.06] p-2 text-xs"><div className="font-semibold text-slate-200">{s.name}{s.license ? ` · ${s.license}` : ""}</div><div className="text-muted-foreground">{s.used}</div></a>)}</div>
      </Panel>
      <ImportDialog open={imp} onClose={() => setImp(false)} />
    </div>
  );
}
