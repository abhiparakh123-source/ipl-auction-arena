import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoom } from "./ctx";
import { api } from "@/lib/queryClient";
import { Panel, Emblem, Kind, Empty, Explain, Bar, PlayerAvatar } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MatchView from "@/components/MatchView";
import { Trophy, Play, FastForward, Users, RotateCcw } from "lucide-react";
import { PITCHES, FORMATS } from "@shared/game";

const AWARD_LABELS: [string, string][] = [["orangeCap", "Orange Cap"], ["purpleCap", "Purple Cap"], ["playerOfTournament", "Player of the Tournament"], ["emergingPlayer", "Emerging Player"], ["mostSixes", "Most sixes"], ["mostFours", "Most fours"], ["bestStrikeRate", "Best strike rate"], ["bestEconomy", "Best economy"]];

export function PointsTable({ table, room, short, test }: { table: any[]; room?: any; short: (id: string) => string; test?: boolean }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="table-points">
      <thead className="text-[11px] text-muted-foreground text-left"><tr><th className="py-1">#</th><th>Team</th><th className="text-right">P</th><th className="text-right">W</th><th className="text-right">L</th><th className="text-right">{test ? "D" : "NR"}</th><th className="text-right">Pts</th><th className="text-right">{test ? "RPO ±" : "NRR"}</th><th className="pl-3">Form</th></tr></thead>
      <tbody>{table.map((r, i) => (
        <tr key={r.team} className={`border-t border-white/5 ${i < 4 ? "bg-cyan-400/[0.03]" : ""}`}>
          <td className="py-1.5 tnum text-muted-foreground">{i + 1}</td>
          <td><div className="flex items-center gap-2"><Emblem id={r.team} room={room} size={22} /><span className="font-semibold">{short(r.team)}</span></div></td>
          <td className="text-right tnum">{r.p}</td><td className="text-right tnum">{r.w}</td><td className="text-right tnum">{r.l}</td><td className="text-right tnum">{r.nr}</td>
          <td className="text-right tnum font-bold">{r.pts}</td><td className={`text-right tnum ${r.nrr >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{r.nrr >= 0 ? "+" : ""}{r.nrr.toFixed(3)}</td>
          <td className="pl-3"><div className="flex gap-0.5">{r.form.slice(-5).map((f: string, k: number) => <span key={k} className={`w-4 h-4 rounded text-[9px] font-bold grid place-items-center ${f === "W" ? "bg-emerald-500/80" : f === "L" ? "bg-rose-500/70" : "bg-white/20"}`}>{f}</span>)}</div></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

const INTL_AWARD: Record<string, string> = { orangeCap: "Most runs", purpleCap: "Most wickets" };
export function Awards({ awards, look, intl }: { awards: any; look: (id: string) => any; intl?: boolean }) {
  if (!awards) return null;
  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-2">
        {AWARD_LABELS.map(([k, l0]) => { const l = intl ? INTL_AWARD[k] || l0 : l0; const a = awards[k]; if (!a) return null; const p = look(a.pid); return (
          <div key={k} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2" data-testid={`award-${k}`}>
            <PlayerAvatar p={p} size={40} team={a.team} />
            <div className="min-w-0"><div className="text-[11px] uppercase tracking-wider text-amber-300">{l}</div><div className="text-sm font-semibold truncate">{p?.name}</div><div className="text-xs text-muted-foreground">{a.value} · {a.team}</div></div>
          </div>
        ); })}
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">{awards.note}</div>
    </div>
  );
}

export default function SeasonView() {
  const { st, act, isHost, look } = useRoom();
  const [pitch, setPitch] = useState("balanced");
  const [format, setFormat] = useState("double");
  const [open, setOpen] = useState<{ season: number; n: number } | null>(null);
  const short = (id: string) => st.teams.find((t: any) => t.id === id)?.short || id;
  const se = st.season;
  const mf = st.settings.format || "ipl";
  const match = useQuery<any>({ queryKey: ["match", st.code, open?.season, open?.n], enabled: !!open, queryFn: () => api("GET", `/api/rooms/${st.code}/match/${open!.season}/${open!.n}`) });
  const pred = useQuery<any>({ queryKey: ["predict", st.code, se?.nextMatch], enabled: !!se && se.status !== "complete", queryFn: () => api("GET", `/api/rooms/${st.code}/predict`), staleTime: 20000 });
  const ranks = useQuery<any>({ queryKey: ["ranks", st.code, se?.nextMatch, st.status], queryFn: () => api("GET", `/api/rooms/${st.code}/rankings`), retry: false });

  const preSeason = st.status === "post" && (
    <Panel title="Season setup" kind="simulated">
      <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
        <div>
          <div className="text-sm text-slate-300 mb-3">{mf !== "ipl" && <b className="text-cyan-200">{FORMATS[mf as keyof typeof FORMATS].label}: {mf === "test" ? "five-day Tests, draws possible, final decided on table position if drawn. " : mf === "odi" ? "50 overs a side, 10 overs per bowler. " : "20 overs a side, no Impact Player. "}</b>}Every side needs at least 11 players. Squads come straight from the auction, retentions and trades in this room.</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">{st.teams.map((t: any) => <div key={t.id} className={`rounded-lg px-2 py-1.5 text-xs flex items-center gap-2 ${t.squad.length < 11 ? "bg-rose-500/10 text-rose-200" : "bg-white/[0.03]"}`}><Emblem id={t.id} room={st} size={18} />{t.short} <b className="ml-auto tnum">{t.squad.length}</b></div>)}</div>
          <div className="flex flex-wrap gap-2">
            <Select value={pitch} onValueChange={setPitch} disabled={!isHost}><SelectTrigger className="w-40 h-9" data-testid="select-pitch"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(PITCHES).map((p) => <SelectItem key={p} value={p}>{p} pitch</SelectItem>)}</SelectContent></Select>
            <Select value={format} onValueChange={setFormat} disabled={!isHost}><SelectTrigger className="w-48 h-9" data-testid="select-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="double">Double round-robin</SelectItem><SelectItem value="single">Single round-robin</SelectItem></SelectContent></Select>
          </div>
        </div>
        {isHost ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => act("fillSquads", {}, "Squads filled")} data-testid="button-fill"><Users className="h-4 w-4 mr-1" />Fill short squads</Button>
            <Button className="bg-gradient-to-r from-amber-300 to-amber-500 text-black" onClick={() => act("startSeason", { pitch, format }, "Season started")} data-testid="button-start-season"><Trophy className="h-4 w-4 mr-1" />Start season</Button>
          </div>
        ) : <div className="text-sm text-muted-foreground">Waiting for host to start the season.</div>}
      </div>
    </Panel>
  );

  const fixtures = se?.fixtures || [];
  const played = fixtures.filter((f: any) => f.result);
  const upcoming = fixtures.filter((f: any) => !f.result).slice(0, 6);
  const leaders = se?.stats ? Object.values<any>(se.stats) : [];
  return (
    <div className="space-y-4">
      {preSeason}
      {!se && st.status !== "post" && !st.history.length && <Empty title="No season yet">The tournament starts after the auction finishes.</Empty>}
      {se && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-display text-xl">{se.label}</div><Kind k="simulated" />
            <span className="text-xs text-muted-foreground">{FORMATS[mf as keyof typeof FORMATS].label} · {se.format === "double" ? "Double" : "Single"} round-robin · {se.pitch} pitch · {played.length}/{fixtures.length} played · {se.status}</span>
            {isHost && se.status !== "complete" && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={() => act("playNext")} data-testid="button-play-next"><Play className="h-4 w-4 mr-1" />Play next match</Button>
                {se.status === "league" && <Button size="sm" variant="outline" onClick={() => act("playMany", { until: "league" })} data-testid="button-sim-league"><FastForward className="h-4 w-4 mr-1" />Sim league stage</Button>}
                <Button size="sm" variant="outline" onClick={() => act("playMany", { until: "all" })} data-testid="button-sim-all"><FastForward className="h-4 w-4 mr-1" />Sim to final</Button>
              </div>
            )}
          </div>
          {se.champion && (
            <div className="glass-strong holo rounded-3xl p-6 text-center relative overflow-hidden" data-testid="panel-champion">
              <Trophy className="h-14 w-14 mx-auto text-amber-300 gold-glow" />
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200 mt-2">Champions · simulated</div>
              <div className="font-display text-3xl md:text-4xl gold-text mt-1">{st.teams.find((t: any) => t.id === se.champion)?.name}</div>
              <div className="text-sm text-muted-foreground mt-1">Runners-up: {st.teams.find((t: any) => t.id === se.runnerUp)?.name}</div>
              {isHost && st.status === "complete" && <Button className="mt-4" variant="outline" onClick={() => act("anotherSeason")} data-testid="button-another"><RotateCcw className="h-4 w-4 mr-1" />Play another season with these squads</Button>}
              {st.status === "retention" && <div className="mt-3 text-sm text-cyan-200">Championship mode: next season's retention window is open.</div>}
            </div>
          )}
          <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4">
            <Panel title="Points table" kind="simulated"><PointsTable table={se.table} room={st} short={short} test={mf === "test"} /><div className="text-[11px] text-muted-foreground mt-2">{mf === "test" ? "Points: win 12, draw 4, loss 0 (WTC-style). Tie-break: runs per over scored minus runs per over conceded across all innings." : `NRR: (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled); a side bowled out is charged the full ${mf === "odi" ? 50 : 20} overs.`}</div></Panel>
            <Panel title="Fixtures & results">
              <div className="space-y-1 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
                {[...upcoming.slice(0, 3), ...[...played].reverse()].map((f: any) => (
                  <button key={f.n} disabled={!f.result} onClick={() => setOpen({ season: st.seasonNo, n: f.n })} className="w-full text-left rounded-lg bg-white/[0.03] hover:bg-white/[0.06] disabled:hover:bg-white/[0.03] px-3 py-2 text-sm" data-testid={`fixture-${f.n}`}>
                    <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground w-20">{f.stage === "league" ? `Match ${f.n}` : f.stage}</span><Emblem id={f.home} room={st} size={18} /><b>{short(f.home)}</b><span className="text-muted-foreground">v</span><Emblem id={f.away} room={st} size={18} /><b>{short(f.away)}</b>{!f.result && <span className="ml-auto text-[11px] text-cyan-300">upcoming</span>}</div>
                    {f.result && <div className="text-xs text-muted-foreground mt-0.5 pl-[5.5rem]">{Object.entries(f.result.scores).map(([t, s]) => `${short(t)} ${s}`).join(" · ")} — <span className="text-slate-200">{f.result.margin}</span></div>}
                  </button>
                ))}
              </div>
            </Panel>
          </div>
          <div className="grid xl:grid-cols-3 gap-4">
            <Panel title="Tournament predictor" kind="prediction">
              {pred.data?.table ? pred.data.table.map((r: any) => (
                <div key={r.team} className="flex items-center gap-2 text-sm mb-1.5"><Emblem id={r.team} room={st} size={18} /><span className="w-12">{short(r.team)}</span><div className="flex-1"><Bar value={r.title} max={Math.max(...pred.data.table.map((x: any) => x.title), 1)} color="hsl(var(--gold))" /></div><span className="tnum w-24 text-right text-xs">{r.title}% title · {r.top4}% top-4</span></div>
              )) : <div className="text-xs text-muted-foreground">{se.status === "complete" ? "Season complete." : "Calculating…"}</div>}
              {pred.data && <Explain>{pred.data.note}</Explain>}
            </Panel>
            <Panel title="Season leaders" kind="simulated">
              {[["Runs", (p: any) => p.runs], ["Wickets", (p: any) => p.wkts], ["Sixes", (p: any) => p.s6]].map(([l, f]: any) => {
                const top = [...leaders].sort((a, b) => f(b) - f(a)).slice(0, 3);
                return <div key={l} className="mb-2"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>{top.map((p) => <div key={p.pid} className="flex text-sm"><span className="truncate flex-1">{look(p.pid)?.name}</span><span className="text-muted-foreground text-xs mr-2">{short(p.team)}</span><b className="tnum">{f(p)}</b></div>)}</div>;
              })}
            </Panel>
            <Panel title="Power rankings" kind="calculated">
              {ranks.data?.rankings?.slice(0, 10).map((r: any, i: number) => (
                <div key={r.team} className="flex items-center gap-2 text-sm mb-1" title={r.explanation}><span className="w-4 tnum text-muted-foreground">{i + 1}</span><Emblem id={r.team} room={st} size={18} /><span className="flex-1">{r.short}</span><b className="tnum">{r.score}</b><span className="text-muted-foreground text-xs">/100</span></div>
              ))}
              {ranks.error && <div className="text-xs text-muted-foreground">{(ranks.error as Error).message}</div>}
            </Panel>
          </div>
          {se.awards && <Panel title="Season awards" kind="simulated"><Awards awards={se.awards} look={look} intl={mf !== "ipl"} /></Panel>}
        </>
      )}
      {st.history.length > 0 && (
        <Panel title="Room history · past seasons" kind="simulated">
          <div className="grid md:grid-cols-2 gap-2">{st.history.map((h: any) => (
            <div key={h.seasonNo} className="rounded-xl bg-white/[0.03] p-3 text-sm"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /><b>Season {h.seasonNo}</b><span className="text-muted-foreground">({h.year})</span></div><div className="mt-1">Champion: <b>{short(h.champion)}</b> · Runner-up: {short(h.runnerUp)}</div>{h.awards?.orangeCap && <div className="text-xs text-muted-foreground">Orange Cap: {look(h.awards.orangeCap.pid)?.name} ({h.awards.orangeCap.value}) · Purple Cap: {look(h.awards.purpleCap?.pid)?.name} ({h.awards.purpleCap?.value})</div>}</div>
          ))}</div>
        </Panel>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto glass-strong">
          <DialogHeader><DialogTitle>Match {open?.n} · broadcast studio</DialogTitle></DialogHeader>
          {match.data ? <MatchView m={match.data} /> : <div className="text-sm text-muted-foreground">Loading scorecard…</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
