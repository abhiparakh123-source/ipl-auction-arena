import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers } from "@/lib/data";
import { PageHeader, Panel, PlayerAvatar, Kind, Explain, Emblem } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FRANCHISES, fmtCr } from "@shared/game";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { ChevronRight, Flag } from "lucide-react";

export default function Career() {
  const { list, look } = usePlayers();
  const qc = useQueryClient();
  const { toast } = useToast();
  const careers = useQuery<any[]>({ queryKey: ["/api/careers"] });
  const [q, setQ] = useState("");
  const [pid, setPid] = useState("");
  const [team, setTeam] = useState("MI");
  const [busy, setBusy] = useState<number | null>(null);
  const cands = q.length >= 2 ? list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && !p.retired).slice(0, 6) : [];
  const start = async () => { try { await api("POST", "/api/careers", { pid, team }); qc.invalidateQueries({ queryKey: ["/api/careers"] }); setPid(""); } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } };
  const next = async (id: number, body: any = {}) => { setBusy(id); try { await api("POST", `/api/careers/${id}/next`, body); qc.invalidateQueries({ queryKey: ["/api/careers"] }); } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } finally { setBusy(null); } };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Career Mode" title="Guide a player's future" sub="Take any active player into simulated future seasons. Development, decline and form evolve with age and simulated performance. Real history is never changed." right={<Kind k="simulated" />} />
      <Panel title="Start a career">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-72"><Input placeholder="Search player…" value={pid ? look(pid)?.name || "" : q} onChange={(e) => { setPid(""); setQ(e.target.value); }} data-testid="input-career-player" />{!pid && cands.length > 0 && <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg p-1">{cands.map((p) => <button key={p.id} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-white/5" onClick={() => { setPid(p.id); setQ(""); if (p.team2026) setTeam(p.team2026); }}>{p.name}</button>)}</div>}</div>
          <Select value={team} onValueChange={setTeam}><SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger><SelectContent>{FRANCHISES.map((f) => <SelectItem key={f.id} value={f.id}>{f.short}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!pid} onClick={start} data-testid="button-start-career">Start career</Button>
        </div>
      </Panel>
      {(careers.data || []).map((c) => {
        const p = look(c.pid);
        const chart = c.seasons.map((s: any) => ({ y: s.year, rating: s.rating, runs: s.stats.runs, wkts: s.stats.wkts }));
        const last = c.seasons[c.seasons.length - 1];
        return (
          <Panel key={c.id} title={<span className="flex items-center gap-2"><PlayerAvatar p={p} size={28} team={c.team} rounded="rounded-md" />{p?.name} <Emblem id={c.team} size={18} /> {c.team}{c.retired && <span className="text-xs text-amber-300 ml-2">Retired</span>}</span>} kind="simulated"
            right={!c.retired && <div className="flex gap-2"><Select value={c.team} onValueChange={(t) => next(c.id, { team: t })}><SelectTrigger className="h-8 w-36"><SelectValue placeholder="Transfer" /></SelectTrigger><SelectContent>{FRANCHISES.map((f) => <SelectItem key={f.id} value={f.id}>Play for {f.short}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={busy === c.id} onClick={() => next(c.id)} data-testid={`button-next-${c.id}`}><ChevronRight className="h-4 w-4 mr-1" />{busy === c.id ? "Simulating…" : "Simulate next season"}</Button><Button size="sm" variant="ghost" onClick={() => next(c.id, { retire: true })}><Flag className="h-4 w-4 mr-1" />Retire</Button></div>}>
            {!c.seasons.length ? <div className="text-sm text-muted-foreground">Simulate the first season (2027) to begin.</div> : (
              <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
                <div className="h-48"><ResponsiveContainer><LineChart data={chart}><XAxis dataKey="y" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={11} domain={[30, 100]} /><Tooltip contentStyle={{ background: "#0b1226", border: "1px solid #1e293b" }} /><Line dataKey="rating" stroke="#22E4FF" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground text-left"><tr><th>Year</th><th>Age</th><th>Team</th><th className="text-right">Runs</th><th className="text-right">SR</th><th className="text-right">Wkts</th><th className="text-right">Rating</th><th className="text-right">Value</th><th>Events</th></tr></thead>
                  <tbody>{c.seasons.map((s: any) => <tr key={s.year} className="border-t border-white/5"><td className="py-1">{s.year}</td><td>{s.age}</td><td>{s.team}</td><td className="text-right tnum">{s.stats.runs}</td><td className="text-right tnum">{s.stats.balls ? ((s.stats.runs / s.stats.balls) * 100).toFixed(0) : "—"}</td><td className="text-right tnum">{s.stats.wkts}</td><td className="text-right tnum">{s.rating}</td><td className="text-right tnum">{fmtCr(s.value)}</td><td className="text-muted-foreground">{s.events.join(", ")}</td></tr>)}</tbody></table>
                  {last && <div className="text-[11px] text-muted-foreground mt-2">Latest: {last.stats.m} simulated matches, {last.stats.wins} wins, {last.stats.pom} POTM.</div>}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
      <Explain>Each future season runs 14 simulated matches with the player in their franchise's XI. Development: +5% per season under 24, +2.5% to 27, flat to 31, then decline. Strong seasons add a small form boost. Starting ratings come from real IPL data.</Explain>
    </div>
  );
}
