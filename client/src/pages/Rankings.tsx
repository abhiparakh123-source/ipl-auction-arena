import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers } from "@/lib/data";
import { realTeams } from "@/lib/analysis";
import { teamRating } from "@shared/analytics";
import { FRANCHISE_BY_ID } from "@shared/game";
import { PageHeader, Panel, Emblem, Bar, Kind, Explain } from "@/components/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COMP: [string, string][] = [["batting", "Batting"], ["bowling", "Bowling"], ["allround", "All-round"], ["bench", "Bench"], ["balance", "Overseas balance"], ["versatility", "Versatility"], ["financial", "Financial"], ["form", "Season form"]];

export default function Rankings() {
  const { list, look } = usePlayers();
  const [src, setSrc] = useState("real2026");
  const rooms = useQuery<any[]>({ queryKey: ["/api/rooms/mine"] }).data || [];
  const roomR = useQuery<any>({ queryKey: ["rankings", src], enabled: src !== "real2026", queryFn: () => api("GET", `/api/rooms/${src}/rankings`), retry: false });
  const real = useMemo(() => realTeams(list).map((t) => { const r = teamRating(t, look); return { team: t.id, name: t.name, short: t.id, score: r.overall, components: { batting: r.batting, bowling: r.bowling, allround: r.allround, bench: r.bench, balance: r.overseasBalance, versatility: r.versatility, financial: r.financial, form: null }, strengths: r.strengths, weaknesses: r.weaknesses, explanation: `${t.id}: calculated squad rating ${r.overall}. ${r.strengths.length ? "Leads on " + r.strengths.join(", ") + "." : ""} ${r.weaknesses.length ? "Concern: " + r.weaknesses.join(", ") + "." : ""}` }; }).sort((a, b) => b.score - a.score), [list, look]);
  const rows = src === "real2026" ? (list.length ? real : []) : roomR.data?.rankings || [];
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Power Rankings" title="Who's strongest right now?" sub="Scores out of 100 built from transparent components. In a running season, 30% of the score comes from simulated results and NRR."
        right={<Select value={src} onValueChange={setSrc}><SelectTrigger className="w-60 h-9" data-testid="select-rank-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="real2026">Real IPL 2026 squads</SelectItem>{rooms.map((r) => <SelectItem key={r.code} value={r.code}>Room: {r.name}</SelectItem>)}</SelectContent></Select>} />
      {roomR.error && <div className="text-sm text-amber-300">{(roomR.error as Error).message}</div>}
      <div className="space-y-3">
        {rows.map((r: any, i: number) => {
          const f = FRANCHISE_BY_ID[r.team.replace(/\d+$/, "")];
          return (
            <div key={r.team} className="glass rounded-2xl p-4 grid md:grid-cols-[auto_auto_1fr_auto] gap-4 items-center" data-testid={`rank-${i}`}>
              <div className="font-display text-3xl w-10 text-center tnum text-muted-foreground">{i + 1}</div>
              <div className="flex items-center gap-3"><Emblem id={r.team} size={44} /><div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted-foreground">{r.short}</div></div></div>
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">{COMP.map(([k, l]) => r.components[k] != null && <div key={k} className="text-[11px]"><div className="flex justify-between text-muted-foreground"><span>{l}</span><span className="tnum">{Math.round(r.components[k])}</span></div><Bar value={r.components[k]} color={f ? (f.primary === "#1B2133" ? f.secondary : f.primary) : undefined} /></div>)}</div>
                <div className="text-xs text-slate-300 mt-2">{r.explanation}</div>
              </div>
              <div className="text-center"><div className="font-display text-4xl text-cyan-200 tnum">{r.score}</div><div className="text-[10px] text-muted-foreground">/ 100</div></div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2"><Kind k="calculated" />{src !== "real2026" && <Kind k="simulated" />}</div>
      <Explain>Squad rating weights: batting 27%, bowling 27%, all-rounders 10%, bench 10%, financial efficiency 8%, keeping 6%, overseas balance 6%, versatility 6%. Component scores come from real IPL data; they are calculated metrics, not predictions.</Explain>
    </div>
  );
}
