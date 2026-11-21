import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoom } from "./ctx";
import { api } from "@/lib/queryClient";
import { Panel, Emblem, Kind, Explain, Empty } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Plus, Trash2 } from "lucide-react";

export default function WhatIf() {
  const { st, look, byId } = useRoom();
  const qc = useQueryClient();
  const [moves, setMoves] = useState<{ pid: string; to: string; price: string }[]>([]);
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const saved = useQuery<any[]>({ queryKey: ["/api/scenarios"], queryFn: () => api("GET", "/api/scenarios") });
  const short = (id: string) => st.teams.find((t: any) => t.id === id)?.short || id;
  const owner = (pid: string) => st.teams.find((t: any) => t.squad.some((s: any) => s.pid === pid))?.id;
  const matches = q.length >= 2 ? Object.values(byId).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  if (st.status === "lobby") return <Empty title="What-If Lab opens after players are bought">Run alternate scenarios once squads exist.</Empty>;
  const run = async () => {
    setBusy(true); setErr("");
    try { const r = await api<any>("POST", `/api/rooms/${st.code}/whatif`, { moves: moves.map((m) => ({ pid: m.pid, to: m.to === "release" ? null : m.to, price: Number(m.price) || undefined })), label }); setRes(r); qc.invalidateQueries({ queryKey: ["/api/scenarios"] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid xl:grid-cols-[1fr_1.1fr] gap-4">
      <div className="space-y-4">
        <Panel title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-violet-300" />What-If Lab</span>} kind="simulated">
          <Explain>Move players between franchises (or from the pool) on a sandbox copy. The real auction, squads and tournament history in this room are never modified.</Explain>
          <div className="relative mt-3">
            <Input placeholder="Search a player to move…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-whatif-search" />
            {matches.length > 0 && <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg p-1">{matches.map((p) => <button key={p.id} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-white/5" onClick={() => { setMoves([...moves, { pid: p.id, to: st.teams[0].id, price: "" }].slice(0, 10)); setQ(""); }}>{p.name} <span className="text-xs text-muted-foreground">{owner(p.id) ? `(${short(owner(p.id)!)})` : "(pool)"}</span></button>)}</div>}
          </div>
          <div className="space-y-1.5 mt-3">
            {moves.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm" data-testid={`move-${i}`}>
                <span className="flex-1 truncate">{look(m.pid)?.name} <span className="text-xs text-muted-foreground">{owner(m.pid) ? short(owner(m.pid)!) : "pool"} →</span></span>
                <Select value={m.to} onValueChange={(v) => setMoves(moves.map((x, k) => (k === i ? { ...x, to: v } : x)))}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger><SelectContent>{st.teams.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.short}</SelectItem>)}<SelectItem value="release">Release</SelectItem></SelectContent></Select>
                <Input className="h-8 w-20 tnum" placeholder="₹ cr" value={m.price} onChange={(e) => setMoves(moves.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)))} />
                <button onClick={() => setMoves(moves.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-rose-300" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3"><Input placeholder="Scenario name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} /><Button disabled={!moves.length || busy} onClick={run} data-testid="button-run-whatif">{busy ? "Simulating…" : "Run scenario"}</Button></div>
          {err && <div className="text-xs text-rose-300 mt-2">{err}</div>}
        </Panel>
        <Panel title="Saved scenarios">
          {(saved.data || []).filter((s) => s.code === st.code).slice(0, 10).map((s) => (
            <button key={s.id} className="w-full text-left rounded-lg bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 mb-1 text-sm" onClick={() => setRes(s.data)}>{s.data.label}<div className="text-[11px] text-muted-foreground">{new Date(s.created).toLocaleString()}</div></button>
          ))}
          {!(saved.data || []).some((s) => s.code === st.code) && <div className="text-xs text-muted-foreground">No scenarios saved for this room.</div>}
        </Panel>
      </div>
      <Panel title="Scenario result" right={res && <Kind k="simulated" />}>
        {!res ? <div className="text-sm text-muted-foreground">Add moves and run a scenario to compare squad ratings and simulated head-to-head win rates before and after.</div> : (
          <div className="space-y-4" data-testid="panel-whatif-result">
            <div className="text-xs text-amber-200/80">{res.note}</div>
            <ul className="text-sm list-disc pl-5">{res.moves.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
            <table className="w-full text-sm"><thead className="text-[11px] text-muted-foreground text-left"><tr><th>Team</th><th className="text-right">Rating before</th><th className="text-right">After</th><th className="text-right">Δ</th></tr></thead>
              <tbody>{res.after.map((a: any) => { const b = res.before.find((x: any) => x.team === a.team); const d = +(a.rating - (b?.rating || 0)).toFixed(1); return (
                <tr key={a.team} className="border-t border-white/5"><td className="py-1"><span className="inline-flex items-center gap-2"><Emblem id={a.team} room={st} size={18} />{short(a.team)}</span></td><td className="text-right tnum">{b?.rating}</td><td className="text-right tnum">{a.rating}</td><td className={`text-right tnum ${d > 0 ? "text-emerald-300" : d < 0 ? "text-rose-300" : ""}`}>{d > 0 ? "+" : ""}{d}</td></tr>
              ); })}</tbody></table>
            {res.h2h?.length > 0 && <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Simulated head-to-head win % (30 sims each)</div>
              <div className="grid sm:grid-cols-2 gap-1">{res.h2h.map((h: any, i: number) => <div key={i} className="text-sm flex rounded bg-white/[0.03] px-2 py-1"><span className="flex-1">{short(h.team)} vs {short(h.vs)}</span><span className="tnum">{h.winBefore ?? "—"}% → <b>{h.winAfter}%</b></span></div>)}</div></div>}
          </div>
        )}
      </Panel>
    </div>
  );
}
