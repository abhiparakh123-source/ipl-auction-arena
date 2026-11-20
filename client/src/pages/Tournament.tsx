import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers } from "@/lib/data";
import { PageHeader, Panel, Emblem, Kind, Explain } from "@/components/game";
import { PointsTable, Awards } from "@/pages/room/SeasonView";
import MatchView from "@/components/MatchView";
import { useCreateRoom } from "@/pages/Home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FRANCHISES, PITCHES } from "@shared/game";
import { Trophy, Wand2 } from "lucide-react";

export default function Tournament() {
  const { look } = usePlayers();
  const create = useCreateRoom();
  const qc = useQueryClient();
  const rooms = useQuery<any[]>({ queryKey: ["/api/rooms/mine"] }).data || [];
  const past = useQuery<any[]>({ queryKey: ["/api/tournaments"] });
  const [name, setName] = useState("Arena Super Cup");
  const [picked, setPicked] = useState<{ kind: string; team: string; code?: string; label: string }[]>(FRANCHISES.slice(0, 6).map((f) => ({ kind: "real2026", team: f.id, label: f.short })));
  const [format, setFormat] = useState("single");
  const [playoffs, setPlayoffs] = useState("4");
  const [pitch, setPitch] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cur, setCur] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [roomSel, setRoomSel] = useState("");
  const roomQ = useQuery<any>({ queryKey: ["/api/rooms", roomSel], enabled: !!roomSel, queryFn: () => api("GET", `/api/rooms/${roomSel}`) });
  const match = useQuery<any>({ queryKey: ["tmatch", cur?.code, open], enabled: open != null && !!cur, queryFn: () => api("GET", `/api/tournaments/${cur.code}/match/${open}`) });
  const toggle = (e: { kind: string; team: string; code?: string; label: string }) => {
    const k = (x: any) => `${x.kind}:${x.code || ""}:${x.team}`;
    setPicked(picked.some((x) => k(x) === k(e)) ? picked.filter((x) => k(x) !== k(e)) : [...picked, e].slice(0, 10));
  };
  const run = async () => {
    setBusy(true); setErr("");
    try { const r = await api<any>("POST", "/api/tournaments", { name, teams: picked.map((p) => ({ kind: p.kind, team: p.team, code: p.code })), format, playoffs: Number(playoffs), pitch }); setCur(r); qc.invalidateQueries({ queryKey: ["/api/tournaments"] }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const se = cur?.season;
  const short = (id: string) => cur?.lineups?.[id]?.short || id;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="IPL Tournament" title="Run a full IPL season" sub="Round-robin league, points table with NRR, Qualifier 1, Eliminator, Qualifier 2 and Final, plus Orange/Purple Cap and season awards. All results are simulated." right={<Kind k="simulated" />} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={<span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" />IPL 2026 season with real squads</span>}>
          <div className="text-sm text-slate-300">Start a persistent multiplayer room with all ten real 2026 squads. Pick your franchise, invite friends to take others, set your XI, then play match by match with the host controls. Results feed the points table, awards, records and your trophy room.</div>
          <div className="grid grid-cols-5 gap-2 mt-3">{FRANCHISES.map((f) => <button key={f.id} onClick={() => create({ mode: "mega", universe: "real2026", team: f.id })} className="rounded-xl bg-white/[0.03] hover:bg-white/[0.08] p-2 flex flex-col items-center gap-1" data-testid={`start-real-${f.id}`}><Emblem id={f.id} size={34} /><span className="text-xs">{f.short}</span></button>)}</div>
          <div className="text-[11px] text-muted-foreground mt-2">Click a franchise to create the room as that team.</div>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-violet-300" />Custom tournament builder</span>}>
          <div className="grid grid-cols-2 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="col-span-2" data-testid="input-tournament-name" />
            <Select value={format} onValueChange={setFormat}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single round-robin</SelectItem><SelectItem value="double">Double round-robin</SelectItem></SelectContent></Select>
            <Select value={playoffs} onValueChange={setPlayoffs}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4">IPL playoffs (top 4)</SelectItem><SelectItem value="2">Final only (top 2)</SelectItem><SelectItem value="0">League only</SelectItem></SelectContent></Select>
            <Select value={pitch} onValueChange={setPitch}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PITCHES).map(([k, v]) => <SelectItem key={k} value={k}>{(v as any).label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="text-[11px] uppercase text-muted-foreground mt-3 mb-1">Teams ({picked.length}/10) · real 2026 squads</div>
          <div className="flex flex-wrap gap-1.5">{FRANCHISES.map((f) => { const on = picked.some((p) => p.kind === "real2026" && p.team === f.id); return <button key={f.id} onClick={() => toggle({ kind: "real2026", team: f.id, label: f.short })} className={`rounded-full px-2.5 py-1 text-xs flex items-center gap-1 ${on ? "bg-cyan-400/20 ring-1 ring-cyan-300" : "bg-white/5"}`} data-testid={`pick-team-${f.id}`}><Emblem id={f.id} size={14} />{f.short}</button>; })}</div>
          {rooms.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5"><Select value={roomSel} onValueChange={setRoomSel}><SelectTrigger className="h-8 w-48"><SelectValue placeholder="Add teams from a room" /></SelectTrigger><SelectContent>{rooms.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent></Select>
            {(roomQ.data?.teams || []).filter((t: any) => t.squad.length >= 11).map((t: any) => { const on = picked.some((p) => p.kind === "room" && p.code === roomSel && p.team === t.id); return <button key={t.id} onClick={() => toggle({ kind: "room", code: roomSel, team: t.id, label: `${t.short}*` })} className={`rounded-full px-2.5 py-1 text-xs ${on ? "bg-violet-400/20 ring-1 ring-violet-300" : "bg-white/5"}`}>{t.short} (room)</button>; })}</div>}
          <Button className="mt-3 w-full" onClick={run} disabled={busy || picked.length < 2} data-testid="button-run-tournament">{busy ? "Simulating every match…" : "Simulate tournament"}</Button>
          {err && <div className="text-xs text-rose-300 mt-1">{err}</div>}
        </Panel>
      </div>
      {se && (
        <div className="space-y-4" data-testid="panel-tournament-result">
          <div className="glass-strong holo rounded-3xl p-6 text-center"><Trophy className="h-12 w-12 mx-auto text-amber-300" /><div className="text-xs uppercase tracking-[0.3em] text-amber-200 mt-1">{cur.name} champions · simulated</div><div className="font-display text-3xl gold-text">{cur.lineups[se.champion]?.name}</div><div className="text-sm text-muted-foreground">Runner-up: {cur.lineups[se.runnerUp]?.name}</div></div>
          <div className="grid xl:grid-cols-[1.2fr_1fr] gap-4">
            <Panel title="Final points table" kind="simulated"><PointsTable table={se.table} short={short} /></Panel>
            <Panel title="Results">
              <div className="space-y-1 max-h-96 overflow-y-auto scrollbar-thin">{[...se.fixtures].reverse().map((f: any) => <button key={f.n} onClick={() => setOpen(f.n)} className="w-full text-left text-sm rounded-lg bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5"><span className="text-[11px] text-muted-foreground mr-2">{f.stage === "league" ? `M${f.n}` : f.stage}</span><b>{short(f.home)}</b> v <b>{short(f.away)}</b><span className="text-xs text-muted-foreground"> — {f.result?.margin}</span></button>)}</div>
            </Panel>
          </div>
          {se.awards && <Panel title="Awards" kind="simulated"><Awards awards={se.awards} look={look} /></Panel>}
        </div>
      )}
      <Panel title="Past custom tournaments">
        {(past.data || []).length === 0 ? <div className="text-sm text-muted-foreground">None yet.</div> : (past.data || []).map((t) => <button key={t.id} onClick={async () => setCur(await api("GET", `/api/tournaments/${t.id}`))} className="w-full text-left rounded-lg bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 mb-1 text-sm">{t.name} · {t.teams} teams · champion <b>{t.champion}</b><span className="text-xs text-muted-foreground"> · {new Date(t.created).toLocaleDateString()}</span></button>)}
      </Panel>
      <Explain>Tournament format follows the IPL: league stage, then Qualifier 1 (1st v 2nd), Eliminator (3rd v 4th), Qualifier 2 (loser Q1 v winner Eliminator) and the Final. NRR uses runs per over scored minus conceded, charging 20 overs to a side bowled out.</Explain>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto glass-strong"><DialogHeader><DialogTitle>Match {open}</DialogTitle></DialogHeader>{match.data ? <MatchView m={match.data} /> : <div className="text-sm text-muted-foreground">Loading…</div>}</DialogContent>
      </Dialog>
    </div>
  );
}
