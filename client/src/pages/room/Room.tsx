import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { RoomConn, session } from "@/lib/store";
import { getToken } from "@/lib/queryClient";
import { usePlayers } from "@/lib/data";
import { Ctx, useRoom } from "./ctx";
import { Logo } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { sfx, music, crowdAmbience, cheer } from "@/lib/sound";
import { MODE_BY_ID } from "@shared/game";
import Lobby from "./Lobby";
import Retention from "./Retention";
import AuctionStage from "./AuctionStage";
import Squads from "./Squads";
import Tactics from "./Tactics";
import SeasonView from "./SeasonView";
import Market from "./Market";
import WhatIf from "./WhatIf";
import { Newsroom, AuditLog, Chat } from "./Feeds";
import { Copy, Wifi, WifiOff, Volume2, VolumeX, ArrowLeft, Users } from "lucide-react";
import { updateSettings } from "@/lib/store";

function TopBar() {
  const { st, conn } = useRoom();
  const status = conn.store.use((s) => s.status);
  const latency = conn.store.use((s) => s.latency);
  const { toast } = useToast();
  const vol = session.use((s) => s.settings.master);
  const invite = `${location.origin}${location.pathname}#/join/${st.code}`;
  const mode = MODE_BY_ID[st.mode];
  const online = st.members.filter((m: any) => m.online).length;
  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-white/5">
      <div className="max-w-[1600px] mx-auto px-3 md:px-6 h-14 flex items-center gap-3">
        <Link href="/auction" className="p-1.5 rounded-lg hover:bg-white/5" aria-label="Back" data-testid="link-back"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="hidden sm:block"><Logo small /></div>
        <div className="min-w-0">
          <div className="font-display text-sm md:text-base font-semibold truncate" data-testid="text-room-name">{st.name}</div>
          <div className="text-[11px] text-muted-foreground truncate"><span style={{ color: mode?.accent }}>{mode?.name}</span>{st.universe === "real2026" ? " · real 2026 squads" : ""} · {st.status}{st.seasonNo > 1 ? ` · season ${st.seasonNo}` : ""}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(invite); toast({ title: "Invite link copied", description: invite }); }} className="hidden md:flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-xs tracking-[0.25em] hover:bg-white/5" data-testid="button-copy-invite">
            {st.code}<Copy className="h-3.5 w-3.5" />
          </button>
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground tnum" title="Members online"><Users className="h-3.5 w-3.5" />{online}</span>
          <span className={`flex items-center gap-1 text-xs tnum ${status === "online" ? "text-emerald-300" : "text-amber-300"}`} data-testid="status-connection" title="Server connection">
            {status === "online" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{status === "online" ? `${latency ?? "–"} ms` : status}</span>
          </span>
          <button onClick={() => updateSettings({ master: vol > 0 ? 0 : 0.7 })} className="p-1.5 rounded-lg hover:bg-white/5" aria-label="Toggle sound" data-testid="button-sound">{vol > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
          <button onClick={() => { navigator.clipboard?.writeText(invite); toast({ title: "Invite link copied" }); }} className="md:hidden p-1.5 rounded-lg hover:bg-white/5" aria-label="Copy invite"><Copy className="h-4 w-4" /></button>
        </div>
      </div>
    </header>
  );
}

function RoomBody() {
  const { st, conn } = useRoom();
  const main = st.status === "lobby" ? "lobby" : st.status === "retention" ? "retention" : st.status === "auction" ? "arena" : "season";
  const [tab, setTab] = useState(main);
  useEffect(() => { setTab(main); window.scrollTo({ top: 0 }); }, [main]);
  useEffect(() => conn.onEvent((ev) => {
    if (ev.kind === "champion") sfx.trophy();
    if (ev.kind === "auctionEnd") cheer(2);
  }), [conn]);
  useEffect(() => {
    const on = st.status === "auction";
    music(on || st.status === "lobby"); crowdAmbience(on);
    return () => { music(false); crowdAmbience(false); };
  }, [st.status]);
  const tabs: [string, string][] = [
    ...(st.status === "lobby" ? [["lobby", "Lobby"]] as [string, string][] : []),
    ...(st.status === "retention" ? [["retention", "Retention"]] as [string, string][] : []),
    ...(st.status === "auction" ? [["arena", "Arena"]] as [string, string][] : []),
    ...(st.status !== "lobby" && st.status !== "auction" && st.status !== "retention" ? [["season", "Season"]] as [string, string][] : []),
    ["squads", "Command Centre"], ["tactics", "Tactics"], ["market", "Trades"], ["whatif", "What-If Lab"], ["news", "Newsroom"], ["audit", "Audit"],
  ];
  return (
    <Tabs value={tab} onValueChange={(v) => { sfx.click(); setTab(v); }}>
      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
        <TabsList className="bg-white/[0.03] border border-white/5">
          {tabs.map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`tab-${v}`}>{l}</TabsTrigger>)}
        </TabsList>
      </div>
      <div className="mt-4">
        <TabsContent value="lobby"><Lobby /></TabsContent>
        <TabsContent value="retention"><Retention /></TabsContent>
        <TabsContent value="arena"><AuctionStage /></TabsContent>
        <TabsContent value="season"><SeasonView /></TabsContent>
        <TabsContent value="squads"><Squads /></TabsContent>
        <TabsContent value="tactics"><Tactics /></TabsContent>
        <TabsContent value="market"><Market /></TabsContent>
        <TabsContent value="whatif"><WhatIf /></TabsContent>
        <TabsContent value="news"><div className="grid lg:grid-cols-2 gap-6"><Newsroom /><Chat /></div></TabsContent>
        <TabsContent value="audit"><AuditLog /></TabsContent>
      </div>
    </Tabs>
  );
}

export default function Room({ code }: { code: string }) {
  const conn = useMemo(() => new RoomConn(code, getToken()), [code]);
  useEffect(() => () => conn.close(), [conn]);
  const st = conn.store.use((s) => s.state);
  const status = conn.store.use((s) => s.status);
  const error = conn.store.use((s) => s.error);
  const { byId } = usePlayers();
  const look = useMemo(() => {
    const ov = st?.ratingOverrides || {};
    return (id: string) => {
      const p = byId[id]; if (!p) return undefined;
      const o = ov[id]; if (!o) return p;
      const { _stats, ...r } = o;
      // International modes: headline numbers are that format's record, not IPL.
      return _stats ? { ...p, ratings: { ...p.ratings, ...r }, matches: _stats.matches, runs: _stats.runs, wkts: _stats.wkts, sr: _stats.sr, avg: _stats.avg, econ: _stats.econ, fmtStats: _stats } : { ...p, ratings: { ...p.ratings, ...r } };
    };
  }, [byId, st?.ratingOverrides]);
  if (status === "error" || (!st && error)) {
    return (
      <div className="app-bg grid place-items-center p-6">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <div className="font-display text-2xl mb-2">Can't open room {code}</div>
          <p className="text-sm text-muted-foreground mb-4">{error || "The room could not be found."}</p>
          <Link href="/auction"><Button data-testid="button-back-centre">Back to Auction Centre</Button></Link>
        </div>
      </div>
    );
  }
  if (!st || !Object.keys(byId).length) return <div className="app-bg grid place-items-center text-muted-foreground text-sm">{status === "offline" ? "Reconnecting to the server…" : `Joining room ${code}…`}</div>;
  return (
    <Ctx.Provider value={{ conn, st, look, byId }}>
      <div className="app-bg">
        <TopBar />
        {status !== "online" && <div className="bg-amber-500/15 text-amber-200 text-xs text-center py-1.5" data-testid="banner-reconnecting">Connection lost — reconnecting. The server keeps the auction running; you'll resync automatically.</div>}
        <main className="max-w-[1600px] mx-auto px-3 md:px-6 py-4 md:py-6"><RoomBody /></main>
      </div>
    </Ctx.Provider>
  );
}
