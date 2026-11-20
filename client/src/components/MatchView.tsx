import { useEffect, useMemo, useState } from "react";
import { usePlayers, oversOf, teamColor } from "@/lib/data";
import { Kind, Emblem } from "@/components/game";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar as RBar, Legend } from "recharts";
import { sfx, say, speak, stopSpeech, unlockAudio } from "@/lib/sound";
import { session, updateSettings } from "@/lib/store";
import { Play, Pause, FastForward, Mic, MicOff } from "lucide-react";

// Team identities from the match itself (international sides reuse franchise ids with custom names).
export const matchRoom = (m: any) => ({ teams: m.teams.map((t: any) => { const f = teamColor(t.id); return f.name === t.name ? { ...f, id: t.id } : { id: t.id, name: t.name, short: t.short, primary: t.color || f.primary, secondary: "#e2e8f0" }; }) });
const innLabel = (m: any, i: number) => (m.innings.length > 2 ? ` · ${i < 2 ? "1st" : "2nd"} innings` : "");

function Scorecard({ inn, m, i = 0 }: { inn: any; m: any; i?: number }) {
  const { look } = usePlayers();
  const nm = (id?: string) => (id ? look(id)?.name || id : "");
  const bt = m.teams.find((t: any) => t.id === inn.team);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3"><Emblem id={inn.team} room={matchRoom(m)} size={26} /><div className="font-display text-lg">{bt?.name}<span className="text-xs text-muted-foreground">{innLabel(m, i)}</span></div><div className="ml-auto font-display text-2xl tnum">{inn.runs}/{inn.wkts}{inn.declared ? "d" : ""} <span className="text-sm text-muted-foreground">({oversOf(inn.balls)} ov)</span></div></div>
      <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm">
        <thead className="text-muted-foreground text-left text-[11px]"><tr><th className="py-1">Batter</th><th></th><th className="text-right">R</th><th className="text-right">B</th><th className="text-right">4s</th><th className="text-right">6s</th><th className="text-right">SR</th></tr></thead>
        <tbody>{inn.batting.map((b: any) => (
          <tr key={b.pid} className="border-t border-white/5"><td className="py-1 font-medium whitespace-nowrap">{nm(b.pid)}</td><td className="text-muted-foreground text-[11px]">{b.out || "not out"}</td><td className="text-right tnum font-semibold">{b.runs}</td><td className="text-right tnum">{b.balls}</td><td className="text-right tnum">{b.f4}</td><td className="text-right tnum">{b.s6}</td><td className="text-right tnum">{b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : "—"}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="text-[11px] text-muted-foreground">Extras {inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb} (wd {inn.extras.wd}, nb {inn.extras.nb}, b {inn.extras.b}, lb {inn.extras.lb}) · FoW: {inn.fow.map((f: any) => `${f.score}-${f.wkt} (${nm(f.pid)}, ${f.over})`).join(", ") || "—"}</div>
      <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm">
        <thead className="text-muted-foreground text-left text-[11px]"><tr><th className="py-1">Bowler</th><th className="text-right">O</th><th className="text-right">M</th><th className="text-right">R</th><th className="text-right">W</th><th className="text-right">Econ</th><th className="text-right">Dots</th><th className="text-right">WD/NB</th></tr></thead>
        <tbody>{inn.bowling.map((b: any) => (
          <tr key={b.pid} className="border-t border-white/5"><td className="py-1 font-medium whitespace-nowrap">{nm(b.pid)}</td><td className="text-right tnum">{oversOf(b.balls)}</td><td className="text-right tnum">{b.maidens}</td><td className="text-right tnum">{b.runs}</td><td className="text-right tnum font-semibold">{b.wkts}</td><td className="text-right tnum">{b.balls ? ((b.runs / b.balls) * 6).toFixed(2) : "—"}</td><td className="text-right tnum">{b.dots}</td><td className="text-right tnum">{b.wd}/{b.nb}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Commentary({ m }: { m: any }) {
  const all = useMemo(() => m.innings.flatMap((inn: any, i: number) => [{ ball: "", text: `— Innings ${i + 1}: ${m.teams.find((t: any) => t.id === inn.team)?.name} —`, kind: "head" }, ...inn.commentary]), [m]);
  const [n, setN] = useState(all.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setN((x: number) => { const nx = Math.min(all.length, x + 1); const c = all[nx - 1]; const k = c?.kind; if (k === "W") sfx.wicket(); else if (k === "6") sfx.six(); else if (k === "4") sfx.boundary();
      if (c && speed <= 2) {
        const clip = k === "W" ? "c_wicket" : k === "6" ? "c_six" : k === "4" ? "c_four" : k === "head" && nx > 1 ? "c_innings" : nx >= all.length ? "c_win" : null;
        if (clip) { if (!say(clip, k === "W" ? 2 : 1) && k === "W") speak(c.text, "commentator", 2); }
      } if (nx >= all.length) setPlaying(false); return nx; }), 700 / speed);
    return () => clearInterval(t);
  }, [playing, speed, all.length]);
  useEffect(() => () => stopSpeech(), []);
  const voice = session.use((s) => s.settings.voice);
  const shown = all.slice(0, n).reverse();
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" variant="outline" onClick={() => { if (n >= all.length) setN(0); setPlaying(!playing); }} data-testid="button-replay">{playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}{playing ? "Pause" : n >= all.length ? "Replay ball-by-ball" : "Resume"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setSpeed(speed >= 8 ? 1 : speed * 2)} data-testid="button-speed"><FastForward className="h-4 w-4 mr-1" />{speed}×</Button>
        <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setN(all.length); }}>Show all</Button>
        <Button size="sm" variant="ghost" onClick={() => { unlockAudio(); if (voice) stopSpeech(); updateSettings({ voice: !voice }); }} title="Speak boundaries, wickets and innings breaks during replay (1x and 2x)" data-testid="button-match-voice">{voice ? <Mic className="h-4 w-4 mr-1" /> : <MicOff className="h-4 w-4 mr-1" />}Voice</Button>
        <span className="ml-auto"><Kind k="simulated" /></span>
      </div>
      <div className="text-[11px] text-amber-200/80 mb-2">AI commentary ({m.style} style) generated from the simulated ball-by-ball events. It does not describe a real match.</div>
      <div className="max-h-[460px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
        {shown.map((c: any, i: number) => (
          <div key={i} className={`text-sm flex gap-2 ${c.kind === "head" ? "font-display text-cyan-200 pt-2" : ""}`}>
            {c.ball && <span className="tnum text-[11px] text-muted-foreground w-10 shrink-0 pt-0.5">{c.ball}</span>}
            {c.kind && c.kind !== "head" && c.kind !== "." && <span className={`text-[10px] font-bold rounded px-1.5 h-5 grid place-items-center shrink-0 ${c.kind === "W" ? "bg-rose-500 text-white" : c.kind === "6" ? "bg-violet-500 text-white" : c.kind === "4" ? "bg-cyan-500 text-black" : "bg-white/10"}`}>{c.kind}</span>}
            <span className="text-slate-200/90">{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Charts({ m }: { m: any }) {
  const len = Math.max(20, ...m.innings.map((x: any) => x.overs.length));
  const key = (inn: any, k: number) => (m.teams.find((t: any) => t.id === inn.team)?.short || inn.team) + (m.innings.length > 2 ? ` (${k < 2 ? 1 : 2})` : "");
  const data = Array.from({ length: len }, (_, i) => {
    const row: any = { over: i + 1 };
    m.innings.forEach((inn: any, k: number) => { const o = inn.overs.find((x: any) => x.over === i + 1); const s = key(inn, k); if (o) { row[s + " total"] = o.total; row[s] = o.runs; } });
    return row;
  });
  const shorts = m.innings.map((inn: any, k: number) => key(inn, k));
  const cols = m.innings.map((inn: any) => { const c = m.teams.find((t: any) => t.id === inn.team)?.color || teamColor(inn.team).primary; return c === "#1B2133" ? "#DBBE6E" : c; });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="h-64"><div className="text-xs text-muted-foreground mb-1">Worm (cumulative runs)</div><ResponsiveContainer><LineChart data={data}><XAxis dataKey="over" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip contentStyle={{ background: "#0b1226", border: "1px solid #1e293b" }} /><Legend />{shorts.map((s: string, i: number) => <Line key={s} dataKey={s + " total"} name={s} stroke={cols[i]} dot={false} strokeWidth={2} />)}</LineChart></ResponsiveContainer></div>
      <div className="h-64"><div className="text-xs text-muted-foreground mb-1">Manhattan (runs per over)</div><ResponsiveContainer><BarChart data={data}><XAxis dataKey="over" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip contentStyle={{ background: "#0b1226", border: "1px solid #1e293b" }} /><Legend />{shorts.map((s: string, i: number) => <RBar key={s} dataKey={s} fill={cols[i]} />)}</BarChart></ResponsiveContainer></div>
    </div>
  );
}

export default function MatchView({ m }: { m: any }) {
  const { look } = usePlayers();
  const w = m.teams.find((t: any) => t.id === m.winner);
  return (
    <div className="space-y-4" data-testid="match-view">
      <div className="flex flex-wrap items-center gap-3">
        <Kind k="simulated" />
        <span className="text-xs text-muted-foreground">{m.venue} · {m.pitch} pitch · toss: {m.teams.find((t: any) => t.id === m.toss.winner)?.short} chose to {m.toss.decision} · seed {m.seed}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-white/[0.03] p-4">
        {m.teams.map((t: any, i: number) => {
          const mine = m.innings.filter((x: any) => x.team === t.id);
          const inn = mine[0];
          if (!inn) return <div key={i} className={i === 1 ? "col-start-3 text-right text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>{t.short}: did not bat</div>;
          const multi = m.innings.length > 2;
          return (
            <div key={i} className={`flex items-center gap-3 ${i === 1 ? "flex-row-reverse text-right col-start-3" : ""}`}>
              <Emblem id={t.id} room={matchRoom(m)} size={44} />
              <div><div className="font-display text-lg">{t?.short}</div>
                <div className={`font-display ${multi ? "text-2xl" : "text-3xl"} font-bold tnum`} data-testid={`score-${i}`}>{mine.map((x: any) => `${x.runs}${x.allOut ? "" : `/${x.wkts}`}${x.declared ? "d" : ""}`).join(" & ")}</div>
                <div className="text-xs text-muted-foreground tnum">{mine.map((x: any) => `${oversOf(x.balls)} ov`).join(" & ")}</div></div>
            </div>
          );
        })}
        <div className="col-start-2 row-start-1 text-center text-xs text-muted-foreground">vs</div>
      </div>
      <div className="text-center"><div className="font-display text-xl gold-text" data-testid="text-result">{w ? `${w.name} ${m.margin.replace(/^\S+ /, "")}` : m.margin}</div>{m.pom && <div className="text-sm text-muted-foreground">Player of the match: <b className="text-white">{look(m.pom.pid)?.name}</b> — {m.pom.reason}</div>}{m.superOver && <div className="text-xs text-amber-300">Decided by a super over</div>}{!m.checks?.ok && <div className="text-xs text-rose-300">Integrity check issues: {m.checks.issues.join("; ")}</div>}</div>
      <Tabs defaultValue="score">
        <TabsList><TabsTrigger value="score">Scorecard</TabsTrigger><TabsTrigger value="comm" data-testid="tab-commentary">Commentary</TabsTrigger><TabsTrigger value="charts">Charts</TabsTrigger></TabsList>
        <TabsContent value="score"><div className="grid lg:grid-cols-2 gap-6 mt-3">{m.innings.map((inn: any, i: number) => <Scorecard key={i} inn={inn} m={m} i={i} />)}</div></TabsContent>
        <TabsContent value="comm"><div className="mt-3"><Commentary m={m} /></div></TabsContent>
        <TabsContent value="charts"><div className="mt-3"><Charts m={m} /></div></TabsContent>
      </Tabs>
    </div>
  );
}
