import { useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "./ctx";
import { Panel, PlayerAvatar, RoleChip, Bar, Kind, Empty } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bestXI, captainPick } from "@shared/analytics";
import { ArrowUp, ArrowDown, X, Plus, Wand2, Save } from "lucide-react";

const PRESETS: Record<string, [number, number][]> = {
  Attacking: [[0.5, 0.18], [0.36, 0.3], [0.64, 0.3], [0.3, 0.42], [0.7, 0.42], [0.5, 0.86], [0.2, 0.6], [0.8, 0.6], [0.35, 0.72], [0.65, 0.72], [0.5, 0.57]],
  Defensive: [[0.5, 0.06], [0.12, 0.4], [0.88, 0.4], [0.1, 0.7], [0.9, 0.7], [0.5, 0.95], [0.25, 0.15], [0.75, 0.15], [0.28, 0.88], [0.72, 0.88], [0.5, 0.57]],
  Spin: [[0.44, 0.44], [0.56, 0.44], [0.4, 0.62], [0.62, 0.62], [0.2, 0.3], [0.8, 0.3], [0.15, 0.75], [0.85, 0.75], [0.5, 0.9], [0.5, 0.15], [0.5, 0.57]],
};

function FieldBoard({ xi, saved, onSave }: { xi: string[]; saved?: Record<string, { x: number; y: number }>; onSave: (f: Record<string, { x: number; y: number }>) => void }) {
  const { look } = useRoom();
  const init = () => Object.fromEntries(xi.map((p, i) => [p, saved?.[p] || { x: PRESETS.Attacking[i][0], y: PRESETS.Attacking[i][1] }]));
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(init);
  useEffect(() => setPos(init()), [xi.join(",")]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const x = Math.max(0.03, Math.min(0.97, (e.clientX - r.left) / r.width)), y = Math.max(0.03, Math.min(0.97, (e.clientY - r.top) / r.height));
    setPos((p) => ({ ...p, [drag.current!]: { x, y } }));
  };
  return (
    <Panel title="Tactical board · field placement" right={<div className="flex gap-1">{Object.keys(PRESETS).map((k) => <Button key={k} size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPos(Object.fromEntries(xi.map((p, i) => [p, { x: PRESETS[k][i][0], y: PRESETS[k][i][1] }])))} data-testid={`preset-${k}`}>{k}</Button>)}</div>}>
      <svg ref={svg} viewBox="0 0 100 100" className="w-full max-w-[460px] mx-auto aspect-square touch-none select-none" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
        <defs><radialGradient id="grass"><stop offset="0" stopColor="#14532d" /><stop offset="1" stopColor="#052e16" /></radialGradient></defs>
        <ellipse cx="50" cy="50" rx="48" ry="48" fill="url(#grass)" stroke="#22E4FF" strokeOpacity=".5" strokeWidth=".6" />
        <ellipse cx="50" cy="50" rx="24" ry="24" fill="none" stroke="#fff" strokeOpacity=".25" strokeDasharray="1.5 1.5" strokeWidth=".4" />
        <rect x="47.5" y="40" width="5" height="20" fill="#a3866a" rx=".5" />
        {xi.map((pid) => {
          const p = look(pid); const q = pos[pid]; if (!q) return null;
          return (
            <g key={pid} transform={`translate(${q.x * 100} ${q.y * 100})`} onPointerDown={(e) => { drag.current = pid; (e.target as Element).setPointerCapture?.(e.pointerId); }} className="cursor-grab">
              <circle r="3.2" fill={p?.role === "Wicket-keeper" ? "#F5C542" : p?.role === "Bowler" ? "#FF5C8A" : "#22E4FF"} stroke="#fff" strokeWidth=".5" />
              <text y="7" textAnchor="middle" fontSize="3" fill="#fff" style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 0.6 }}>{p?.name.split(" ").slice(-1)[0]}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between items-center mt-2"><span className="text-[11px] text-muted-foreground">Drag fielders. Placement is saved to your franchise for the broadcast view.</span><Button size="sm" onClick={() => onSave(pos)} data-testid="button-save-field">Save field</Button></div>
    </Panel>
  );
}

export default function Tactics() {
  const { st, myTeam, look, act } = useRoom();
  const t = myTeam;
  const pids: string[] = t?.squad.map((s: any) => s.pid) || [];
  const intl = !!st.settings.format && st.settings.format !== "ipl";
  const osCap = intl ? 11 : 4;
  const auto = useMemo(() => { const b = bestXI(pids, look, osCap); const c = captainPick(b.xi, look); return { xi: b.xi, bowling: b.bowling, captain: c.captain, vice: c.vice, keeper: b.xi.find((p) => look(p)?.role === "Wicket-keeper") }; }, [pids.join(","), look]);
  const [xi, setXi] = useState<string[]>([]);
  const [bowl, setBowl] = useState<string[]>([]);
  const [cap, setCap] = useState<string | undefined>();
  const [vc, setVc] = useState<string | undefined>();
  const [wk, setWk] = useState<string | undefined>();
  const [imp, setImp] = useState<{ in: string; out: string } | null>(null);
  const [alts, setAlts] = useState<string[][]>([]);
  useEffect(() => {
    const l = t?.lineup;
    const src = l?.xi?.length === 11 ? l : auto;
    setXi(src.xi || []); setBowl(src.bowling || []); setCap(src.captain); setVc(src.vice); setWk(src.keeper); setImp(l?.impact || null); setAlts(l?.alt || []);
  }, [t?.id, !!t?.lineup, auto.xi.join(",")]);
  if (!t) return <Empty title="Tactics are for franchise owners">Take a franchise to build a playing XI.</Empty>;
  if (pids.length < 11) return <Empty title={`${t.short} need at least 11 players`}>Your XI builder unlocks once the squad has 11 players. Every purchase appears here automatically.</Empty>;
  const bench = pids.filter((p) => !xi.includes(p));
  const os = xi.filter((p) => look(p)?.overseas).length;
  const count = (r: string) => xi.filter((p) => look(p)?.role === r).length;
  const bowlOpts = bowl.filter((p) => xi.includes(p) || p === imp?.in);
  const errors: string[] = [];
  if (xi.length !== 11) errors.push(`XI has ${xi.length}/11 players`);
  if (os > osCap) errors.push(`${os} overseas players (max 4)`);
  if (!xi.some((p) => look(p)?.role === "Wicket-keeper") && !wk) errors.push("No wicket-keeper selected");
  if (bowlOpts.length < 5) errors.push(`Only ${bowlOpts.length} bowling options (need 5)`);
  if (cap && cap === vc) errors.push("Captain and vice-captain must differ");
  const swap = (i: number, d: number) => { const a = [...xi]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setXi(a); };
  const lineup = { xi, bowling: bowlOpts, captain: cap, vice: vc, keeper: wk, impact: intl ? null : imp, bench, alt: alts };
  return (
    <div className="grid xl:grid-cols-[1.2fr_1fr] gap-4">
      <div className="space-y-4">
        <Panel title="Playing XI builder · batting order" right={<div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => { setXi(auto.xi); setBowl(auto.bowling); setCap(auto.captain); setVc(auto.vice); setWk(auto.keeper); }} data-testid="button-auto-xi"><Wand2 className="h-4 w-4 mr-1" />AI XI</Button><Button size="sm" disabled={errors.length > 0} onClick={() => act("lineup", { lineup }, "Lineup saved — used in every simulated match")} data-testid="button-save-xi"><Save className="h-4 w-4 mr-1" />Save</Button></div>}>
          <div className="space-y-1">
            {xi.map((pid, i) => {
              const p = look(pid); if (!p) return null;
              return (
                <div key={pid} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5" data-testid={`xi-${pid}`}>
                  <span className="w-5 text-xs tnum text-muted-foreground">{i + 1}</span>
                  <PlayerAvatar p={p} size={30} team={t.id} room={st} rounded="rounded-md" />
                  <div className="min-w-0 flex-1"><div className="text-sm truncate">{p.name}</div><RoleChip p={p} /></div>
                  <div className="flex gap-1">
                    {(["C", "VC", "WK"] as const).map((r) => {
                      const on = r === "C" ? cap === pid : r === "VC" ? vc === pid : wk === pid;
                      return <button key={r} onClick={() => (r === "C" ? setCap(pid) : r === "VC" ? setVc(pid) : setWk(pid))} className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${on ? "bg-amber-300 text-black" : "bg-white/5 text-muted-foreground"}`} data-testid={`role-${r}-${pid}`}>{r}</button>;
                    })}
                    <button onClick={() => setBowl(bowl.includes(pid) ? bowl.filter((x) => x !== pid) : [...bowl, pid])} className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${bowl.includes(pid) ? "bg-rose-400 text-black" : "bg-white/5 text-muted-foreground"}`} title="Bowling option" data-testid={`bowl-${pid}`}>BWL</button>
                  </div>
                  <button onClick={() => swap(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => swap(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setXi(xi.filter((x) => x !== pid))} aria-label="Remove" data-testid={`remove-${pid}`}><X className="h-3.5 w-3.5 text-rose-300" /></button>
                </div>
              );
            })}
          </div>
          {errors.length > 0 ? <div className="mt-2 text-xs text-amber-300">{errors.join(" · ")}</div> : <div className="mt-2 text-xs text-emerald-300">Lineup valid. The server re-validates before saving.</div>}
        </Panel>
        <Panel title={intl ? "Bench" : "Bench & impact player"}>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {bench.map((pid) => { const p = look(pid)!; return (
              <button key={pid} onClick={() => xi.length < 11 && setXi([...xi, pid])} className="flex items-center gap-2 rounded-lg bg-white/[0.02] hover:bg-white/5 px-2 py-1.5 text-left" data-testid={`bench-${pid}`}>
                <Plus className="h-3.5 w-3.5 text-cyan-300" /><PlayerAvatar p={p} size={26} team={t.id} room={st} rounded="rounded-md" /><span className="text-sm truncate flex-1">{p.name}</span><RoleChip p={p} />
              </button>
            ); })}
          </div>
          {intl ? <div className="text-[11px] text-muted-foreground mt-3">International formats have no Impact Player and no overseas limit in the XI.</div> : <div className="grid grid-cols-2 gap-2 mt-3">
            <div><div className="text-[11px] text-muted-foreground mb-1">Impact player in</div>
              <Select value={imp?.in || "none"} onValueChange={(v) => setImp(v === "none" ? null : { in: v, out: imp?.out || xi[xi.length - 1] })}><SelectTrigger className="h-9" data-testid="select-impact-in"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{bench.map((p) => <SelectItem key={p} value={p}>{look(p)?.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><div className="text-[11px] text-muted-foreground mb-1">Replaces</div>
              <Select value={imp?.out || "none"} disabled={!imp} onValueChange={(v) => imp && setImp({ ...imp, out: v })}><SelectTrigger className="h-9" data-testid="select-impact-out"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{xi.map((p) => <SelectItem key={p} value={p}>{look(p)?.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>}
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Role balance" kind="calculated">
          {[...[["Batters", count("Batter"), 5], ["Wicket-keepers", count("Wicket-keeper"), 2], ["All-rounders", count("All-rounder"), 4], ["Bowlers", count("Bowler"), 5], ["Bowling options", bowlOpts.length, 7], ["Overseas", os, 4]].filter((x) => !intl || x[0] !== "Overseas")].map(([k, v, m]) => (
            <div key={k as string} className="flex items-center gap-2 text-sm mb-1.5"><span className="w-32">{k}</span><div className="flex-1"><Bar value={v as number} max={m as number} color={k === "Overseas" && (v as number) > 4 ? "#FF5C8A" : "#22E4FF"} /></div><span className="tnum w-6 text-right">{v}</span></div>
          ))}
          <div className="text-[11px] text-muted-foreground mt-2">Captain: {look(cap || "")?.name || "—"} · Vice: {look(vc || "")?.name || "—"} · Keeper: {look(wk || "")?.name || "auto"}</div>
        </Panel>
        <Panel title="Alternative combinations" right={<Button size="sm" variant="ghost" onClick={() => setAlts([...alts, xi].slice(-4))} data-testid="button-save-alt">Save current as alt</Button>}>
          {alts.length === 0 ? <div className="text-xs text-muted-foreground">Store up to 4 alternative XIs (e.g. for spin-friendly pitches). They're saved with your lineup.</div> : alts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs mb-1.5"><span className="font-semibold">Alt {i + 1}</span><span className="truncate flex-1 text-muted-foreground">{a.map((p) => look(p)?.name.split(" ").slice(-1)[0]).join(", ")}</span><Button size="sm" variant="ghost" className="h-6" onClick={() => setXi(a.filter((p) => pids.includes(p)))}>Load</Button></div>
          ))}
        </Panel>
        <FieldBoard xi={xi.length === 11 ? xi : auto.xi} saved={t.lineup?.fielding} onSave={(f) => act("fielding", { fielding: f }, "Field placement saved")} />
        <Kind k="calculated" />
      </div>
    </div>
  );
}
