import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { session } from "@/lib/store";
import { usePlayers, relTime } from "@/lib/data";
import { api } from "@/lib/queryClient";
import { NAV } from "@/components/Shell";
import { PlayerAvatar, Emblem, Panel } from "@/components/game";
import { Button } from "@/components/ui/button";
import { SeasonSlideshow } from "@/components/HallOfFame";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { MODE_BY_ID, fmtCr } from "@shared/game";
import { Gavel, Zap, Trophy, Bot, ArrowRight, Radio } from "lucide-react";

export function useCreateRoom() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  return async (body: any) => {
    try { const r = await api<{ code: string }>("POST", "/api/rooms", body); nav(`/room/${r.code}`); }
    catch (e: any) { toast({ title: "Could not create room", description: e.message, variant: "destructive" }); }
  };
}

export default function Home() {
  const me = session.use((s) => s.me)!;
  const { list } = usePlayers();
  const [code, setCode] = useState("");
  const [, nav] = useLocation();
  const create = useCreateRoom();
  const mine = useQuery<any[]>({ queryKey: ["/api/rooms/mine"], refetchInterval: 8000 });
  const invites = useQuery<any[]>({ queryKey: ["/api/invites"], refetchInterval: 10000 });
  const stars = useMemo(() => list.filter((p) => p.photo && p.team2026 && !p.photo.startsWith("data:")).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 7), [list]);
  const unseen = (invites.data || []).filter((i) => !i.seen && i.room);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl glass holo p-6 md:p-10">
        <div className="absolute inset-0 grid-floor opacity-40 pointer-events-none" />
        <div className="relative grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/90 mb-3">Welcome back, {me.username}</div>
            <h1 className="font-display text-4xl md:text-6xl font-semibold leading-[1.02]">
              Build the franchise.<br /><span className="gold-text">Own the hammer.</span>
            </h1>
            <p className="mt-4 text-slate-300/80 max-w-xl">Real-time multiplayer IPL auctions on a server-authoritative engine, real Cricsheet statistics for 856 players, ball-by-ball simulated seasons and AI analysis that explains every call.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="gold-glow bg-gradient-to-b from-amber-300 to-amber-500 text-black hover:from-amber-200" onClick={() => create({ mode: "quick", team: ["CSK","MI","RCB","KKR","SRH","RR","DC","PBKS","GT","LSG"][Math.floor(Math.random() * 10)], settings: { aiFill: true } })} data-testid="button-quick-play"><Zap className="h-4 w-4 mr-2" />Quick play vs AI</Button>
              <Button size="lg" variant="outline" onClick={() => nav("/modes")} data-testid="button-choose-mode"><Gavel className="h-4 w-4 mr-2" />Choose a mode</Button>
              <Button size="lg" variant="outline" onClick={() => create({ mode: "mega", universe: "real2026", name: `${me.username}'s IPL 2026 Season` })} data-testid="button-real-season"><Trophy className="h-4 w-4 mr-2" />Play IPL 2026 squads</Button>
            </div>
            <div className="mt-6 flex gap-2 max-w-sm">
              <Input placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} className="tracking-[0.3em] font-mono uppercase" data-testid="input-join-code" onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && nav(`/room/${code}`)} />
              <Button onClick={() => code.length >= 4 && nav(`/room/${code}`)} data-testid="button-join">Join</Button>
            </div>
          </div>
          <div className="relative h-[300px] md:h-[360px]">
            {stars.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 30, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: (i - 3) * 6 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 90 }}
                className="absolute left-1/2 top-1/2 origin-bottom" style={{ marginLeft: -70 + (i - 3) * 34, marginTop: -110, zIndex: 10 - Math.abs(i - 3) }}>
                <Link href={`/players/${p.id}`} className="block w-[140px] rounded-2xl overflow-hidden glass hover:-translate-y-2 transition-transform" data-testid={`card-star-${p.id}`}>
                  <PlayerAvatar p={p} size={140} rounded="rounded-none" />
                  <div className="p-2">
                    <div className="text-xs font-semibold truncate">{p.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{p.team2026}</span><span className="tnum text-amber-300">{p.ratings.overall.toFixed(0)}</span></div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      <section data-testid="section-hof-home">
        <div className="flex items-end justify-between mb-2">
          <div><div className="text-[11px] uppercase tracking-[0.3em] text-amber-200/80">Hall of Fame</div><h2 className="font-display text-xl md:text-2xl font-semibold">Every IPL champion, 2008 to 2026</h2></div>
          <Link href="/hall-of-fame" className="text-xs text-amber-200 hover:underline flex items-center gap-1" data-testid="link-hof">Open Hall of Fame <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <SeasonSlideshow compact />
      </section>

      {unseen.length > 0 && (
        <Panel title="Invites" right={<Radio className="h-4 w-4 text-rose-400 animate-pulse" />}>
          <div className="flex flex-wrap gap-3">
            {unseen.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                <span className="text-sm"><b>{i.from}</b> invited you to <b>{i.room.name}</b></span>
                <Button size="sm" onClick={() => { api("POST", `/api/invites/${i.id}/seen`); nav(`/room/${i.room_code}`); }} data-testid={`button-accept-invite-${i.id}`}>Join</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        <Panel title="Your rooms" kind="live" right={<Link href="/auction" className="text-xs text-cyan-300 hover:underline">Auction Centre</Link>}>
          {mine.data?.length ? (
            <div className="space-y-2">
              {mine.data.slice(0, 6).map((r) => (
                <Link key={r.code} href={`/room/${r.code}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 px-3 py-2.5" data-testid={`link-room-${r.code}`}>
                  <div className="h-9 w-9 rounded-lg grid place-items-center font-mono text-[10px] font-bold" style={{ background: `${MODE_BY_ID[r.mode]?.accent}22`, color: MODE_BY_ID[r.mode]?.accent }}>{r.code.slice(0, 3)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{MODE_BY_ID[r.mode]?.name} · {r.status} · {r.humans} human{r.humans === 1 ? "" : "s"} · {relTime(r.updated)}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No rooms yet. Start a quick game against AI owners, or create a private room and share the invite link with friends.</div>
          )}
        </Panel>
        <Panel title="Main menu">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="group rounded-xl border border-white/5 bg-white/[0.02] hover:bg-cyan-400/10 hover:border-cyan-300/30 p-3 transition-colors" data-testid={`menu-${n.href.slice(1)}`}>
                <n.icon className="h-5 w-5 text-cyan-300 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-medium">{n.label}</div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="IPL 2026 franchises" kind="historical" right={<span className="text-[11px] text-muted-foreground">Squads from Wikipedia's 2026 personnel changes</span>}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"].map((t) => {
            const sq = list.filter((p) => p.team2026 === t);
            const spent = sq.reduce((a, p) => a + (p.price2026 || 0), 0);
            return (
              <Link key={t} href={`/franchises?team=${t}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] p-3" data-testid={`link-franchise-${t}`}>
                <Emblem id={t} size={38} />
                <div className="min-w-0"><div className="font-display font-semibold">{t}</div><div className="text-[11px] text-muted-foreground tnum">{sq.length} players · {fmtCr(spent)}</div></div>
              </Link>
            );
          })}
        </div>
      </Panel>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Bot className="h-3.5 w-3.5" />Franchise emblems are original monograms; official IPL and team logos are trademarks of their owners and are not used.</div>
    </div>
  );
}
