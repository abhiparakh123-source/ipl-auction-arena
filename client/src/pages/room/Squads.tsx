import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoom } from "./ctx";
import { Panel, PlayerAvatar, RoleChip, Emblem, Stat, Bar, Kind, Explain } from "@/components/game";
import { fmtCr } from "@shared/game";
import { fairValue } from "@shared/analytics";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "wouter";
import { api } from "@/lib/queryClient";

export function useAnalysis(code: string, team: string | null, key: any) {
  return useQuery<any>({ queryKey: [`/api/rooms/${code}/analysis/${team}`, key], queryFn: () => api("GET", `/api/rooms/${code}/analysis/${team}`), enabled: !!team, retry: false });
}

export default function Squads() {
  const { st, look } = useRoom();
  const [sel, setSel] = useState<string>(st.me.teamId || st.teams[0].id);
  const t = st.teams.find((x: any) => x.id === sel)!;
  const key = `${st.sales.length}:${t.squad.length}:${st.status}:${st.trades.length}`;
  const a = useAnalysis(st.code, sel, key);
  const ps = t.squad.map((s: any) => ({ s, p: look(s.pid)! })).filter((x: any) => x.p);
  const spent = t.squad.reduce((acc: number, s: any) => acc + s.price, 0);
  const bought = ps.filter((x: any) => x.s.how === "auction" || x.s.how === "rtm");
  const most = [...ps].sort((a: any, b: any) => b.s.price - a.s.price)[0];
  const cheapest = [...bought].sort((a: any, b: any) => a.s.price - b.s.price)[0];
  const cnt = (r: string) => ps.filter((x: any) => x.p.role === r).length;
  const os = ps.filter((x: any) => x.p.overseas).length;
  const radar = a.data ? [
    ["Batting", a.data.rating.batting], ["Bowling", a.data.rating.bowling], ["Pace", a.data.rating.pace], ["Spin", a.data.rating.spin], ["All-round", a.data.rating.allround], ["Keeping", a.data.rating.keeping], ["Bench", a.data.rating.bench], ["Finance", a.data.rating.financial],
  ].map(([k, v]) => ({ k, v })) : [];
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {st.teams.map((x: any) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 shrink-0 ${sel === x.id ? "border-cyan-300 bg-cyan-400/10" : "border-white/5 bg-white/[0.02]"}`} data-testid={`squad-tab-${x.id}`}>
            <Emblem id={x.id} room={st} size={22} /><span className="text-sm font-semibold">{x.short}</span>{x.id === st.me.teamId && <span className="text-[10px] text-cyan-300">you</span>}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <Stat label="Purse left" value={t.purse == null ? "hidden" : fmtCr(t.purse)} accent="#F5C542" testid="cc-purse" />
        <Stat label="Spent" value={fmtCr(spent)} />
        <Stat label="Squad" value={`${t.squad.length}/${st.settings.squadMax}`} sub={`min ${st.settings.squadMin}`} />
        <Stat label="Overseas" value={`${os}/${st.settings.overseasMax}`} />
        <Stat label="Bat / Bowl" value={`${cnt("Batter")} / ${cnt("Bowler")}`} />
        <Stat label="AR / WK" value={`${cnt("All-rounder")} / ${cnt("Wicket-keeper")}`} />
        <Stat label="Avg buy" value={bought.length ? fmtCr(bought.reduce((a: number, x: any) => a + x.s.price, 0) / bought.length) : "—"} />
        <Stat label="Slots left" value={Math.max(0, st.settings.squadMax - t.squad.length)} sub={st.settings.rtm ? `RTM ${t.rtmLeft}` : undefined} />
      </div>
      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4">
        <Panel title={`${t.name} squad`} kind="live" right={<span className="text-[11px] text-muted-foreground">{most ? `Top buy ${most.p.name} ${fmtCr(most.s.price)}` : ""}{cheapest ? ` · cheapest ${cheapest.p.name} ${fmtCr(cheapest.s.price)}` : ""}</span>}>
          {ps.length === 0 ? <div className="text-sm text-muted-foreground">No players yet. Purchases appear here instantly.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-muted-foreground text-left"><tr><th className="py-1">Player</th><th>Role</th><th className="text-right">Rating</th><th className="text-right">Price</th><th className="text-right">Fair value</th><th className="text-right">How</th></tr></thead>
                <tbody>
                  {[...ps].sort((a: any, b: any) => b.s.price - a.s.price).map(({ s, p }: any) => {
                    const fv = fairValue(p.ratings.overall, st.settings.purse);
                    return (
                      <tr key={p.id} className="border-t border-white/5" data-testid={`squad-row-${p.id}`}>
                        <td className="py-1.5"><Link href={`/players/${p.id}`} className="flex items-center gap-2 hover:text-cyan-200"><PlayerAvatar p={p} size={30} team={t.id} room={st} rounded="rounded-md" /><span className="truncate max-w-[160px]">{p.name}</span></Link></td>
                        <td><RoleChip p={p} /></td>
                        <td className="text-right tnum">{p.ratings.overall.toFixed(0)}</td>
                        <td className="text-right tnum">{fmtCr(s.price)}</td>
                        <td className={`text-right tnum ${fv >= s.price ? "text-emerald-300" : "text-amber-300"}`}>{fmtCr(fv)}</td>
                        <td className="text-right text-[11px] text-muted-foreground">{s.how}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          {a.error ? <Panel title="Squad analyzer"><div className="text-sm text-muted-foreground">{(a.error as any).message}</div></Panel> : a.data && (
            <>
              <Panel title="Squad analyzer" kind="calculated" right={<Explain>{a.data.explanation}</Explain>}>
                <div className="flex items-center gap-4">
                  <div className="text-center"><div className="font-display text-5xl font-bold gold-text tnum" data-testid="text-team-rating">{a.data.rating.overall}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Overall /100</div></div>
                  <div className="text-center"><div className="font-display text-4xl font-bold text-cyan-200" data-testid="text-grade">{a.data.grade.grade}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Auction grade</div></div>
                  <div className="flex-1 h-[190px]">
                    <ResponsiveContainer><RadarChart data={radar} outerRadius="72%"><PolarGrid stroke="rgba(255,255,255,.1)" /><PolarAngleAxis dataKey="k" tick={{ fill: "#94a3b8", fontSize: 10 }} /><Radar dataKey="v" stroke="#22E4FF" fill="#22E4FF" fillOpacity={0.25} /><Tooltip contentStyle={{ background: "#0b1226", border: "1px solid #1e293b" }} /></RadarChart></ResponsiveContainer>
                  </div>
                </div>
                <p className="text-xs text-slate-300/80 mt-2">{a.data.grade.verdict}</p>
              </Panel>
              <Panel title="Weakness detector" kind="calculated">
                {a.data.weaknesses.length ? <ul className="text-sm space-y-1">{a.data.weaknesses.map((w: string) => <li key={w}>• {w}</li>)}</ul> : <div className="text-sm text-emerald-300">No major structural weaknesses detected.</div>}
                {a.data.rating.strengths.length > 0 && <div className="mt-2 text-xs text-emerald-300">Strengths: {a.data.rating.strengths.join(", ")}</div>}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(a.data.needs.gaps).map(([k, v]: any) => <div key={k} className="flex justify-between rounded bg-white/[0.03] px-2 py-1"><span>{k}</span><span className={v > 0 ? "text-amber-300" : "text-emerald-300"}>{v > 0 ? `need ${v}` : "covered"}</span></div>)}
                </div>
              </Panel>
              <Panel title="Value for money" kind="calculated" bodyClass="p-3">
                <div className="space-y-1">{a.data.value.slice(0, 8).map((v: any) => <div key={v.pid} className="flex items-center gap-2 text-xs"><span className="truncate flex-1">{v.name}</span><span className="tnum text-muted-foreground">{fmtCr(v.price)}</span><div className="w-20"><Bar value={Math.min(3, v.ratio || 0)} max={3} color={v.ratio >= 1 ? "#7CFF6B" : "#F5C542"} /></div><span className="tnum w-10 text-right">{v.ratio ? `${v.ratio}×` : "—"}</span></div>)}</div>
                <div className="text-[10px] text-muted-foreground mt-2">Ratio = calculated fair value ÷ price paid.</div>
              </Panel>
              <Panel title="Owner personality" kind="calculated" bodyClass="p-3">
                <div className="font-display text-lg text-violet-200 mb-2">{a.data.profile.archetype}</div>
                <div className="space-y-1.5">{Object.entries(a.data.profile.traits).map(([k, v]: any) => <div key={k} className="flex items-center gap-2 text-xs"><span className="w-36 capitalize">{k.replace(/([A-Z])/g, " $1")}</span><div className="flex-1"><Bar value={v} color="#B57BFF" /></div><span className="tnum w-8 text-right">{v}</span></div>)}</div>
                <div className="text-[10px] text-muted-foreground mt-2">From {a.data.profile.lotsBid} lots bid on, {a.data.profile.purchases} purchases, average {a.data.profile.avgOverpay}× fair value. Favourite role: {a.data.profile.favouriteRole}.</div>
              </Panel>
            </>
          )}
          <div><Kind k="calculated" /> <span className="text-[11px] text-muted-foreground">Ratings are derived from historical Cricsheet data; they are not official.</span></div>
        </div>
      </div>
    </div>
  );
}
