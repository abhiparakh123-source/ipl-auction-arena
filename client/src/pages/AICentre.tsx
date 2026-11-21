import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers, num } from "@/lib/data";
import { realTeams, analyzeLocal } from "@/lib/analysis";
import { PageHeader, Panel, Emblem, PlayerAvatar, RoleChip, Kind, Explain, Bar, Stat } from "@/components/game";
import { Compare } from "@/pages/Players";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRANCHISES, PITCHES, fmtCr } from "@shared/game";
import { fairValue, slotKey } from "@shared/analytics";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { Brain, Sparkles } from "lucide-react";

export default function AICentre() {
  const { list, look } = usePlayers();
  const [src, setSrc] = useState("real2026");
  const [team, setTeam] = useState("CSK");
  const mine = useQuery<any[]>({ queryKey: ["/api/rooms/mine"] });
  const room = useQuery<any>({ queryKey: ["/api/rooms", src], enabled: src !== "real2026", queryFn: () => api("GET", `/api/rooms/${src}`) });
  const roomTeams = room.data?.teams || [];
  const tid = src === "real2026" ? team : roomTeams.some((t: any) => t.id === team) ? team : room.data?.me?.teamId || roomTeams[0]?.id;
  const serverA = useQuery<any>({ queryKey: ["analysis", src, tid], enabled: src !== "real2026" && !!tid, queryFn: () => api("GET", `/api/rooms/${src}/analysis/${tid}`), retry: false });
  const real = useMemo(() => realTeams(list), [list]);
  const localA = useMemo(() => (src === "real2026" && list.length ? analyzeLocal(real, team, look) : null), [src, team, real, look]);
  const a = src === "real2026" ? localA : serverA.data;
  const squadIds: string[] = src === "real2026" ? real.find((t) => t.id === team)?.squad.map((s) => s.pid) || [] : roomTeams.find((t: any) => t.id === tid)?.squad.map((s: any) => s.pid) || [];
  const owned = new Set<string>(src === "real2026" ? list.filter((p) => p.team2026).map((p) => p.id) : roomTeams.flatMap((t: any) => t.squad.map((s: any) => s.pid)));
  // Strategic bid advisor: best available players that fill this team's gaps within budget
  const targets = useMemo(() => {
    if (!a) return [];
    const gaps = a.needs.gaps as Record<string, number>;
    return list.filter((p) => !owned.has(p.id) && !p.retired && (p.lastSeason ?? 0) >= 2024 && (gaps[slotKey(p)] || 0) > 0 && (!p.overseas || a.needs.overseasLeft > 0))
      .map((p) => ({ p, fv: fairValue(p.ratings.overall, 120) })).filter((x) => x.fv <= Math.max(0.3, a.needs.maxBid)).sort((x, y) => y.p.ratings.overall - x.p.ratings.overall).slice(0, 8);
  }, [a, list, owned.size]);
  const form = squadIds.map(look).filter(Boolean).sort((x: any, y: any) => (y.ratings.form ?? 0) - (x.ratings.form ?? 0)) as any[];
  const radar = a ? [["Batting", a.rating.batting], ["Bowling", a.rating.bowling], ["Pace", a.rating.pace], ["Spin", a.rating.spin], ["All-round", a.rating.allround], ["Keeping", a.rating.keeping], ["Bench", a.rating.bench], ["Versatility", a.rating.versatility]].map(([k, v]) => ({ k, v })) : [];

  // match predictor
  const [opp, setOpp] = useState("MI");
  const [pitch, setPitch] = useState("balanced");
  const [pred, setPred] = useState<any>(null);
  const [perr, setPerr] = useState("");
  const predict = async () => {
    setPerr(""); setPred(null);
    const mk = (t: string) => (src === "real2026" ? { kind: "real2026", team: t } : { kind: "room", code: src, team: t });
    try { setPred(await api("POST", "/api/sim/predict", { a: mk(tid), b: mk(opp), pitch })); } catch (e: any) { setPerr(e.message); }
  };
  const tourn = useQuery<any>({ queryKey: ["predict", src], enabled: src !== "real2026" && !!room.data?.season, queryFn: () => api("GET", `/api/rooms/${src}/predict`) });
  const [cmp, setCmp] = useState<string[]>([]);
  const [cq, setCq] = useState("");
  const cands = cq.length >= 2 ? list.filter((p) => p.name.toLowerCase().includes(cq.toLowerCase())).slice(0, 6) : [];
  const teamsForOpp = src === "real2026" ? FRANCHISES.map((f) => ({ id: f.id, short: f.short })) : roomTeams;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="AI Intelligence Centre" title="Explainable squad intelligence" sub="Every insight below shows why. Calculated metrics come from real IPL data; predictions come from repeated simulations and are never guarantees."
        right={<div className="flex gap-2">
          <Select value={src} onValueChange={(v) => { setSrc(v); }}><SelectTrigger className="w-48 sm:w-56 h-9" data-testid="select-ai-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="real2026">Real IPL 2026 squads</SelectItem>{(mine.data || []).map((r) => <SelectItem key={r.code} value={r.code}>Room: {r.name}</SelectItem>)}</SelectContent></Select>
          <Select value={tid || ""} onValueChange={setTeam}><SelectTrigger className="w-24 sm:w-40 h-9" data-testid="select-ai-team"><SelectValue placeholder="Team" /></SelectTrigger><SelectContent>{(src === "real2026" ? FRANCHISES : roomTeams).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.short}</SelectItem>)}</SelectContent></Select>
        </div>} />
      {serverA.error && <div className="text-sm text-amber-300">{(serverA.error as Error).message}</div>}
      {src !== "real2026" && squadIds.length === 0 && <div className="text-sm text-muted-foreground">This franchise has no players yet. Analysis appears as soon as the auction adds players.</div>}
      {a && squadIds.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Stat label="Squad rating" value={a.rating.overall} sub="calculated /100" accent="#22E4FF" testid="ai-rating" />
            <Stat label="Auction grade" value={a.grade.grade} sub={`rank #${a.grade.rank}`} accent="#F5C542" />
            <Stat label="Net value" value={`${a.grade.value >= 0 ? "+" : ""}${a.grade.value} cr`} sub="vs fair prices" />
            <Stat label="Squad" value={a.composition.total} sub={`${a.composition.overseas} overseas`} />
            <Stat label="Avg age" value={a.composition.avgAge || "—"} />
            <Stat label="Max bid now" value={fmtCr(a.needs.maxBid)} sub={`${a.needs.slots} slots`} />
          </div>
          <div className="grid xl:grid-cols-3 gap-4">
            <Panel title="1 · Squad analyzer" kind="calculated">
              <div className="h-60"><ResponsiveContainer><RadarChart data={radar}><PolarGrid stroke="#334155" /><PolarAngleAxis dataKey="k" tick={{ fill: "#94a3b8", fontSize: 11 }} /><Radar dataKey="v" stroke="#22E4FF" fill="#22E4FF" fillOpacity={0.25} /></RadarChart></ResponsiveContainer></div>
              <Explain>{a.explanation}</Explain>
            </Panel>
            <Panel title="2 · Weakness detector" kind="calculated">
              {a.weaknesses.length ? <ul className="space-y-2 text-sm">{a.weaknesses.map((w: string, i: number) => <li key={i} className="rounded-lg bg-rose-500/10 px-3 py-2">{w}</li>)}</ul> : <div className="text-sm text-emerald-300">No major weaknesses: every component rates 55 or higher.</div>}
              <div className="mt-3 text-xs text-muted-foreground">Strengths: {a.rating.strengths.join(", ") || "none above 72"}</div>
            </Panel>
            <Panel title="3 · Post-auction verdict & grade" kind="calculated">
              <div className="font-display text-5xl gold-text">{a.grade.grade}</div>
              <div className="text-sm text-slate-300 mt-2">{a.grade.verdict}</div>
              <Explain>Grade = squad rating + value bonus (±8, from net value vs calculated fair prices) − small penalty per rank position.</Explain>
            </Panel>
            <Panel title="4 · Playing XI generator & 5 · captain selector" kind="calculated">
              {a.xi.xi.map((pid: string, i: number) => { const p = look(pid); return p && <div key={pid} className="flex items-center gap-2 text-sm py-0.5"><span className="w-4 text-xs tnum text-muted-foreground">{i + 1}</span><span className="flex-1 truncate">{p.name}{pid === a.captain.captain && <b className="text-amber-300"> (C)</b>}{pid === a.captain.vice && <b className="text-cyan-300"> (VC)</b>}</span><RoleChip p={p} /></div>; })}
              <Explain>XI picks the best-rated players while keeping a wicket-keeper, at most 4 overseas and at least 5 bowling options. Captain: {a.captain.reason}</Explain>
            </Panel>
            <Panel title="6 · Value-for-money analysis" kind="calculated">
              <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">{a.value.filter((v: any) => v.price > 0).slice(0, 14).map((v: any) => <div key={v.pid} className="flex text-sm gap-2"><span className="flex-1 truncate">{v.name}</span><span className="tnum text-xs text-muted-foreground">{fmtCr(v.price)} → fair {fmtCr(v.fair)}</span><b className={`tnum w-12 text-right ${v.ratio >= 1 ? "text-emerald-300" : "text-rose-300"}`}>{v.ratio}×</b></div>)}</div>
              <Explain>Ratio = calculated fair value ÷ price paid. Above 1× is a bargain; below 1× is a premium.</Explain>
            </Panel>
            <Panel title="7 · Rival analysis" kind="calculated">
              {[...a.rivals].sort((x: any, y: any) => y.rating - x.rating).map((r: any) => <div key={r.id} className="flex items-center gap-2 text-sm mb-1"><Emblem id={r.id} room={room.data} size={18} /><span className="w-12">{r.short}</span><div className="flex-1"><Bar value={r.rating} /></div><span className="tnum w-10 text-right">{r.rating}</span><span className="text-xs text-muted-foreground w-16 text-right">{r.purse == null ? "hidden" : fmtCr(r.purse)}</span></div>)}
            </Panel>
            <Panel title="8 · Auction advisor (needs & budget)" kind="calculated">
              <div className="grid grid-cols-5 gap-1 text-center text-xs mb-3">{Object.entries<number>(a.needs.gaps).map(([k, v]) => <div key={k} className={`rounded-lg p-2 ${v > 0 ? "bg-amber-400/10 text-amber-200" : "bg-white/[0.03]"}`}><div className="font-display text-lg">{v}</div>{k}</div>)}</div>
              <div className="text-sm">Purse {fmtCr(a.needs.maxBid)} usable · {a.needs.minNeeded} slots to minimum · {fmtCr(a.needs.perSlot)} per required slot · {a.needs.overseasLeft} overseas slots left.</div>
              <Explain>Gaps compare the squad to a balanced 18-player template (6 batters, 2 keepers, 5 all-rounders, 5 pace, 3 spin) scaled to the minimum squad size.</Explain>
            </Panel>
            <Panel title="9 · Strategic bid advisor" kind="calculated">
              {targets.length ? targets.map(({ p, fv }) => <Link key={p.id} href={`/players/${p.id}`} className="flex items-center gap-2 text-sm py-1 hover:text-cyan-200"><PlayerAvatar p={p} size={28} rounded="rounded-md" /><span className="flex-1 truncate">{p.name}</span><RoleChip p={p} /><span className="tnum text-xs w-16 text-right">≤ {fmtCr(Math.min(a.needs.maxBid, fv * 1.3))}</span></Link>) : <div className="text-sm text-muted-foreground">No unowned active players fill the remaining gaps within budget.</div>}
              <Explain>Unowned active players who fill a role gap, ranked by rating, with a suggested ceiling of 1.3× calculated fair value. Advice only: the AI never bids for you.</Explain>
            </Panel>
            <Panel title="10 · Form analyzer" kind="historical">
              {form.slice(0, 6).map((p) => <div key={p.id} className="flex items-center gap-2 text-sm mb-1"><span className="flex-1 truncate">{p.name}</span><div className="w-24"><Bar value={p.ratings.form ?? 0} color="#34d399" /></div><span className="tnum w-8 text-right">{num(p.ratings.form, 0)}</span></div>)}
              <div className="text-[11px] uppercase text-muted-foreground mt-2">Out of form</div>
              {form.filter((p) => p.ratings.form != null).slice(-3).map((p) => <div key={p.id} className="flex text-sm"><span className="flex-1 truncate">{p.name}</span><span className="tnum">{num(p.ratings.form, 0)}</span></div>)}
              <Explain>Form score is a calculated metric from each player's most recent real IPL innings and spells (Cricsheet), weighted toward the latest matches.</Explain>
            </Panel>
            <Panel title="11 · Player combination advisor" kind="calculated">
              {a.combos.map((c: any) => <div key={c.label} className="mb-2"><div className="text-sm font-semibold">{c.label}</div><div className="text-xs text-muted-foreground">{c.xi.map((p: string) => look(p)?.name.split(" ").slice(-1)[0]).join(", ")}</div></div>)}
              <Explain>Alternative balances for different pitches: extra bowler suits green or dry tracks; batting-heavy suits flat roads.</Explain>
            </Panel>
            <Panel title="12 · Match predictor" kind="prediction">
              <div className="flex flex-wrap gap-2 mb-2">
                <Select value={opp} onValueChange={setOpp}><SelectTrigger className="w-28 h-9" data-testid="select-opp"><SelectValue /></SelectTrigger><SelectContent>{teamsForOpp.filter((t: any) => t.id !== tid).map((t: any) => <SelectItem key={t.id} value={t.id}>vs {t.short}</SelectItem>)}</SelectContent></Select>
                <Select value={pitch} onValueChange={setPitch}><SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(PITCHES).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
                <Button size="sm" onClick={predict} data-testid="button-predict"><Sparkles className="h-4 w-4 mr-1" />Predict</Button>
              </div>
              {pred && <div data-testid="panel-prediction"><div className="flex justify-between font-display text-2xl"><span>{pred.a} {Math.round(pred.aWin * 100)}%</span><span>{Math.round(pred.bWin * 100)}% {pred.b}</span></div><div className="h-2 rounded-full bg-rose-400/50 overflow-hidden mt-1"><div className="h-full bg-cyan-400" style={{ width: `${pred.aWin * 100}%` }} /></div><div className="text-xs text-muted-foreground mt-1">Average totals {pred.avgA} – {pred.avgB}</div><Explain>{pred.explanation}</Explain></div>}
              {perr && <div className="text-xs text-rose-300">{perr}</div>}
            </Panel>
            <Panel title="13 · Tournament predictor" kind="prediction">
              {src === "real2026" ? <div className="text-sm text-muted-foreground">Start a season in a room (or a real-2026 tournament from IPL Tournament) to get title and top-4 odds from Monte-Carlo runs of the remaining fixtures.</div>
                : tourn.data?.table ? <>{tourn.data.table.map((r: any) => <div key={r.team} className="flex text-sm gap-2"><span className="w-12">{r.team}</span><div className="flex-1"><Bar value={r.title} color="hsl(var(--gold))" /></div><span className="tnum text-xs w-28 text-right">{r.title}% · top-4 {r.top4}%</span></div>)}<Explain>{tourn.data.note}</Explain></> : <div className="text-sm text-muted-foreground">No season running in this room yet.</div>}
            </Panel>
            <Panel title="14 · Player comparison" kind="historical" className="xl:col-span-2">
              <div className="relative mb-3"><Input placeholder="Add a player to compare…" value={cq} onChange={(e) => setCq(e.target.value)} data-testid="input-ai-compare" />{cands.length > 0 && <div className="absolute z-10 mt-1 w-full glass-strong rounded-lg p-1">{cands.map((p) => <button key={p.id} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-white/5" onClick={() => { setCmp([...cmp.filter((x) => x !== p.id), p.id].slice(-4)); setCq(""); }}>{p.name}</button>)}</div>}</div>
              {cmp.length ? <Compare ids={cmp} onRemove={(id) => setCmp(cmp.filter((x) => x !== id))} /> : <div className="text-sm text-muted-foreground">Pick up to 4 players. Tip: compare your captain with a rival's.</div>}
            </Panel>
            <Panel title="15 · Owner personality" kind="calculated">
              {a.profile ? <><div className="font-display text-xl">{a.profile.archetype}</div><div className="text-sm text-muted-foreground">{a.profile.traits?.join(" · ")}</div><div className="text-xs mt-2">Lots bid on: {a.profile.lotsBid} · purchases {a.profile.purchases} · avg overpay {a.profile.avgOverpay} cr · favourite role {a.profile.favouriteRole || "—"}</div><Explain>Derived from this franchise's real bid log in the room: aggression, overpay vs base price, role preference and squad age.</Explain></> : <div className="text-sm text-muted-foreground">Owner personality profiles come from live bidding behaviour, so they're available for room franchises only.</div>}
            </Panel>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Brain className="h-4 w-4" /><Kind k="historical" /><Kind k="calculated" /><Kind k="prediction" /><Kind k="simulated" />Labels mark the type of every number on this page.</div>
        </>
      )}
    </div>
  );
}
