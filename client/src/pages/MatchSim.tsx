import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers } from "@/lib/data";
import { session } from "@/lib/store";
import { PageHeader, Panel, Emblem, Kind, Explain, PlayerAvatar } from "@/components/game";
import MatchView from "@/components/MatchView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRANCHISES, PITCHES, COMMENTARY_STYLES, FORMATS, FORMAT_LIST, type Format } from "@shared/game";
import { sfx } from "@/lib/sound";
import { Swords, X } from "lucide-react";

type Side = { kind: string; team: string; code?: string; xi: string[]; name: string };

function SidePicker({ label, v, set, rooms }: { label: string; v: Side; set: (s: Side) => void; rooms: any[] }) {
  const { list, look } = usePlayers();
  const room = useQuery<any>({ queryKey: ["/api/rooms", v.code], enabled: v.kind === "room" && !!v.code, queryFn: () => api("GET", `/api/rooms/${v.code}`) });
  const [q, setQ] = useState("");
  const cands = q.length >= 2 ? list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && !v.xi.includes(p.id)).slice(0, 6) : [];
  return (
    <Panel title={label}>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={v.kind} onValueChange={(k) => set({ ...v, kind: k, code: k === "room" ? rooms[0]?.code : undefined })}><SelectTrigger className="w-40 h-9" data-testid={`select-kind-${label}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="real2026">Real 2026 squad</SelectItem><SelectItem value="room" disabled={!rooms.length}>From my room</SelectItem><SelectItem value="custom">Custom XI</SelectItem></SelectContent></Select>
        {v.kind === "real2026" && <Select value={v.team} onValueChange={(t) => set({ ...v, team: t })}><SelectTrigger className="w-32 h-9" data-testid={`select-team-${label}`}><SelectValue /></SelectTrigger><SelectContent>{FRANCHISES.map((f) => <SelectItem key={f.id} value={f.id}>{f.short}</SelectItem>)}</SelectContent></Select>}
        {v.kind === "room" && <>
          <Select value={v.code} onValueChange={(c) => set({ ...v, code: c })}><SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger><SelectContent>{rooms.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}</SelectContent></Select>
          <Select value={v.team} onValueChange={(t) => set({ ...v, team: t })}><SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger><SelectContent>{(room.data?.teams || []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.short} ({t.squad.length})</SelectItem>)}</SelectContent></Select>
        </>}
        {v.kind === "custom" && <Input className="w-40 h-9" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} placeholder="Team name" />}
      </div>
      {v.kind === "real2026" && <div className="flex items-center gap-3"><Emblem id={v.team} size={48} /><div className="text-sm text-muted-foreground">The model picks the best XI from the real 2026 squad.</div></div>}
      {v.kind === "custom" && (
        <div>
          <div className="relative"><Input placeholder={`Add players (${v.xi.length}/11)…`} value={q} onChange={(e) => setQ(e.target.value)} disabled={v.xi.length >= 11} data-testid={`input-custom-${label}`} />{cands.length > 0 && <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg p-1">{cands.map((p) => <button key={p.id} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-white/5" onClick={() => { set({ ...v, xi: [...v.xi, p.id] }); setQ(""); }}>{p.name} <span className="text-xs text-muted-foreground">{p.role}</span></button>)}</div>}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">{v.xi.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/5 pl-0.5 pr-2 py-0.5 text-xs"><PlayerAvatar p={look(id)} size={18} rounded="rounded-full" />{look(id)?.name}<button onClick={() => set({ ...v, xi: v.xi.filter((x) => x !== id) })} aria-label="Remove"><X className="h-3 w-3" /></button></span>)}</div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => set({ ...v, xi: [...list].filter((p) => !p.retired).sort(() => Math.random() - 0.5).slice(0, 40).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 11).map((p) => p.id) })}>Random XI</Button>
        </div>
      )}
    </Panel>
  );
}

export default function MatchSim() {
  const settings = session.use((s) => s.settings);
  const rooms = useQuery<any[]>({ queryKey: ["/api/rooms/mine"] }).data || [];
  const [a, setA] = useState<Side>({ kind: "real2026", team: "CSK", xi: [], name: "Dream XI" });
  const [b, setB] = useState<Side>({ kind: "real2026", team: "MI", xi: [], name: "World XI" });
  const [pitch, setPitch] = useState("balanced");
  const [style, setStyle] = useState<string>(settings.commentary || "pro");
  const [venue, setVenue] = useState("");
  const [format, setFormat] = useState<Format>("ipl");
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const mk = (s: Side) => (s.kind === "custom" ? { kind: "custom", xi: s.xi, name: s.name, short: s.name.slice(0, 3).toUpperCase(), id: s.name.slice(0, 3).toUpperCase() } : s.kind === "room" ? { kind: "room", code: s.code, team: s.team } : { kind: "real2026", team: s.team });
  const run = async () => {
    setBusy(true); setErr("");
    try { const r = await api<any>("POST", "/api/sim/match", { a: mk(a), b: mk(b), pitch, style, venue: venue || undefined, format, seed: Math.floor(Math.random() * 1e9) }); setM(r); sfx.gavel(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Match Simulator" title={`Ball-by-ball ${FORMATS[format].short === "IPL" ? "T20" : FORMATS[format].short} simulation`} sub={`Player probabilities come from real ${format === "ipl" ? "IPL" : FORMATS[format].short} ball-by-ball data (Cricsheet). Every result, scorecard and line of commentary here is simulated.`} right={<Kind k="simulated" />} />
      <div className="grid lg:grid-cols-2 gap-4"><SidePicker label="Team A" v={a} set={setA} rooms={rooms} /><SidePicker label="Team B" v={b} set={setB} rooms={rooms} /></div>
      <div className="glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <Select value={format} onValueChange={(v) => setFormat(v as Format)}><SelectTrigger className="w-48 h-9" data-testid="select-sim-format"><SelectValue /></SelectTrigger><SelectContent>{FORMAT_LIST.map((f) => <SelectItem key={f} value={f}>{FORMATS[f].label}</SelectItem>)}</SelectContent></Select>
        <Select value={pitch} onValueChange={setPitch}><SelectTrigger className="w-40 h-9" data-testid="select-sim-pitch"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PITCHES).map(([k, v]) => <SelectItem key={k} value={k}>{(v as any).label}</SelectItem>)}</SelectContent></Select>
        <Select value={style} onValueChange={setStyle}><SelectTrigger className="w-60 h-9" data-testid="select-style"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(COMMENTARY_STYLES).map(([k, v]) => <SelectItem key={k} value={k}>{v as string}</SelectItem>)}</SelectContent></Select>
        <Select value={venue || "home"} onValueChange={(v) => setVenue(v === "home" ? "" : v)}><SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="home">Team A home venue</SelectItem>{FRANCHISES.map((f) => <SelectItem key={f.home} value={f.home}>{f.home}</SelectItem>)}</SelectContent></Select>
        <Button className="ml-auto bg-gradient-to-r from-cyan-400 to-violet-500 text-black font-semibold" onClick={run} disabled={busy} data-testid="button-simulate"><Swords className="h-4 w-4 mr-1" />{busy ? "Simulating…" : "Simulate match"}</Button>
      </div>
      {err && <div className="text-sm text-rose-300">{err}</div>}
      {m && <Panel title="Broadcast studio" kind="simulated"><MatchView m={m} /></Panel>}
      <Explain>Model: each ball's outcome is sampled from the batter's and bowler's real {format === "ipl" ? "IPL" : FORMATS[format].short} outcome rates (players with no record in the chosen format fall back to shrunk league averages) by phase (Cricsheet), adjusted for pitch, venue scoring and match situation, then calibrated to real IPL scoring levels. Commentary is generated from the simulated events in the chosen style.</Explain>
    </div>
  );
}
