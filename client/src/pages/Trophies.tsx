import { useQuery } from "@tanstack/react-query";
import { PageHeader, Panel, Stat, Bar, Explain, Emblem } from "@/components/game";
import { session } from "@/lib/store";
import { Trophy, Lock, Award } from "lucide-react";

export default function Trophies() {
  const me = session.use((s) => s.me)!;
  const a = useQuery<any>({ queryKey: ["/api/achievements"] });
  const g = useQuery<any>({ queryKey: ["/api/records/game"] });
  const d = a.data;
  const myTitles = (g.data?.champions || []).filter((c: any) => c.ownerName === me.username);
  const got = new Set((d?.mine || []).map((m: any) => m.key));
  const prevLevelXp = d ? Math.pow(d.level - 1, 2) * 100 : 0;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Trophy Room" title={`${me.username}'s cabinet`} sub={d?.note} />
      {d && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Level" value={d.level} accent="#F5C542" /><Stat label="XP" value={d.xp} sub={`next level at ${d.nextLevelXp}`} /><Stat label="Simulated titles" value={d.stats.titles} /><Stat label="Rooms played" value={d.stats.rooms} /><Stat label="Players bought" value={d.stats.buys} />
        </div>
      )}
      {d && <div className="glass rounded-2xl p-3"><div className="text-xs text-muted-foreground mb-1">Level progress</div><Bar value={d.xp - prevLevelXp} max={Math.max(1, d.nextLevelXp - prevLevelXp)} color="hsl(var(--gold))" /></div>}
      <Panel title={<span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" />Championship trophies (simulated)</span>}>
        {myTitles.length === 0 ? <div className="text-sm text-muted-foreground">Win a simulated season in any room to lift your first trophy.</div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{myTitles.map((t: any, i: number) => (
            <div key={i} className="holo glass-strong rounded-2xl p-4 text-center"><Trophy className="h-12 w-12 mx-auto text-amber-300 gold-glow" /><div className="flex justify-center mt-2"><Emblem id={t.team} size={28} /></div><div className="text-sm mt-1">{t.label}</div><div className="text-[11px] text-muted-foreground">{new Date(t.ts).toLocaleDateString()}</div></div>
          ))}</div>
        )}
      </Panel>
      <Panel title={<span className="flex items-center gap-2"><Award className="h-4 w-4" />Achievements</span>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {d && Object.entries<any>(d.all).map(([k, v]) => (
            <div key={k} className={`rounded-xl p-3 flex gap-3 ${got.has(k) ? "bg-amber-400/10 ring-1 ring-amber-300/40" : "bg-white/[0.03] opacity-60"}`} data-testid={`ach-${k}`}>
              {got.has(k) ? <Award className="h-8 w-8 text-amber-300 shrink-0" /> : <Lock className="h-8 w-8 text-muted-foreground shrink-0" />}
              <div><div className="font-semibold text-sm">{v.label}</div><div className="text-xs text-muted-foreground">{v.desc}</div><div className="text-[11px] text-amber-200 mt-0.5">+{v.xp} XP</div></div>
            </div>
          ))}
        </div>
      </Panel>
      {d?.stats?.grades?.length > 0 && <Panel title="Auction grades earned">{d.stats.grades.map((g: string, i: number) => <span key={i} className="inline-block font-display text-xl mr-3 gold-text">{g}</span>)}</Panel>}
      <Explain>Rewards are cosmetic. XP, levels and achievements never change purses, bid increments or any competitive rule.</Explain>
    </div>
  );
}
