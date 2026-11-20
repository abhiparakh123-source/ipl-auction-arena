import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePlayers } from "@/lib/data";
import { PageHeader, Panel, PlayerAvatar, Kind, Explain, Emblem } from "@/components/game";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCr } from "@shared/game";
import { Crown } from "lucide-react";

export default function Records() {
  const { look } = usePlayers();
  const real = useQuery<any>({ queryKey: ["/api/records/real"] });
  const game = useQuery<any>({ queryKey: ["/api/records/game"] });
  const g = game.data;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Records & Awards" title="Hall of fame" sub="Real IPL records and in-game records are stored and shown separately. They are never mixed." />
      <Tabs defaultValue="real">
        <TabsList><TabsTrigger value="real" data-testid="tab-real">Real IPL history</TabsTrigger><TabsTrigger value="game" data-testid="tab-game">In-game records</TabsTrigger></TabsList>
        <TabsContent value="real">
          <div className="flex items-center gap-2 my-3"><Kind k="historical" /><span className="text-xs text-muted-foreground">{real.data?.source} Generated {real.data?.generated}.</span></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {real.data && Object.entries<any[]>(real.data.lists).map(([title, rows]) => (
              <Panel key={title} title={title}>
                {rows.map((r, i) => <Link key={r.pid + i} href={`/players/${r.pid}`} className="flex items-center gap-2 text-sm py-0.5 hover:text-cyan-200"><span className="w-4 text-xs tnum text-muted-foreground">{i + 1}</span><PlayerAvatar p={look(r.pid)} size={22} rounded="rounded-md" /><span className="flex-1 truncate">{r.name}</span><b className="tnum text-right">{r.value}</b></Link>)}
              </Panel>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="game">
          <div className="flex items-center gap-2 my-3"><Kind k="simulated" /><span className="text-xs text-muted-foreground">{g?.note}</span></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Panel title={<span className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-300" />Champions</span>}>{g?.champions?.length ? g.champions.map((c: any, i: number) => <div key={i} className="flex items-center gap-2 text-sm py-0.5"><Emblem id={c.team} size={18} /><span className="flex-1 truncate">{c.label}</span><span className="text-xs text-muted-foreground">{c.ownerName}</span></div>) : <div className="text-sm text-muted-foreground">No simulated titles yet.</div>}</Panel>
            <Panel title="Hall of fame owners">{g?.hallOfFame?.length ? g.hallOfFame.map((h: any, i: number) => <div key={i} className="flex text-sm"><span className="flex-1">{h.owner}</span><b>{h.titles} title{h.titles > 1 ? "s" : ""}</b></div>) : <div className="text-sm text-muted-foreground">Win a simulated season to enter.</div>}</Panel>
            <Panel title="Biggest auction buys (in-game)">{g?.biggestBuys?.length ? g.biggestBuys.map((b: any, i: number) => <div key={i} className="flex text-sm gap-2"><span className="flex-1 truncate">{b.name}</span><span className="text-xs text-muted-foreground">{b.team} · {b.room}</span><b className="tnum">{fmtCr(b.price)}</b></div>) : <div className="text-sm text-muted-foreground">No auctions yet.</div>}</Panel>
            {[["Highest individual innings", g?.innings], ["Best bowling figures", g?.bowling], ["Highest team totals", g?.totals]].map(([t, rows]: any) => (
              <Panel key={t} title={t}>{rows?.length ? rows.map((r: any, i: number) => <div key={i} className="flex text-sm gap-2"><span className="flex-1 truncate">{r.label}</span><span className="text-xs text-muted-foreground">{r.room}</span></div>) : <div className="text-sm text-muted-foreground">Play simulated matches to set records.</div>}</Panel>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Explain>Real records use Cricsheet's IPL archive (2008–2026). Auction prices come from Wikipedia's 2025 and 2026 personnel change lists. In-game records come only from rooms on this server.</Explain>
    </div>
  );
}
