import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MODE_BY_ID, MODES, FORMATS, FORMAT_LIST } from "@shared/game";
import { PageHeader, Panel, Empty } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relTime } from "@/lib/data";
import { CreateRoomDialog } from "./Modes";
import { Users, Eye, Lock, Globe } from "lucide-react";

function RoomRow({ r }: { r: any }) {
  const m = MODE_BY_ID[r.mode];
  return (
    <Link href={`/room/${r.code}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 px-3 py-3" data-testid={`room-${r.code}`}>
      <div className="h-10 w-10 rounded-lg grid place-items-center font-mono text-[11px] font-bold" style={{ background: `${m?.accent}22`, color: m?.accent }}>{r.code}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-2">{r.name}{r.isPublic ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}</div>
        <div className="text-[11px] text-muted-foreground">{m && m.format !== "ipl" ? `${FORMATS[m.format].short} · ` : ""}{m?.name}{r.universe === "real2026" ? " · real 2026 squads" : ""} · host {r.host} · {r.status}{r.seasonNo > 1 ? ` · season ${r.seasonNo}` : ""} · {relTime(r.updated)}</div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-3 tnum"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.humans}/{r.teams}</span><span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{r.online}</span></div>
    </Link>
  );
}

export default function AuctionCentre() {
  const mine = useQuery<any[]>({ queryKey: ["/api/rooms/mine"], refetchInterval: 6000 });
  const pub = useQuery<any[]>({ queryKey: ["/api/rooms/public"], refetchInterval: 5000 });
  const [code, setCode] = useState("");
  const [, nav] = useLocation();
  const [mode, setMode] = useState<any>(null);
  return (
    <div>
      <PageHeader eyebrow="Auction Centre" title="Rooms & lobbies" sub="Create a private room and share its invite link, browse public rooms, or rejoin a game in progress. Rooms persist on the server and recover after reconnects." />
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <Panel title="Your rooms" kind="live">
            {mine.data?.length ? <div className="space-y-2">{mine.data.map((r) => <RoomRow key={r.code} r={r} />)}</div> : <Empty title="No rooms yet">Create one from the panel on the right.</Empty>}
          </Panel>
          <Panel title="Public rooms" kind="live" right={<span className="text-[11px] text-muted-foreground">auto-refreshing</span>}>
            {pub.data?.length ? <div className="space-y-2">{pub.data.map((r) => <RoomRow key={r.code} r={r} />)}</div> : <Empty title="No public rooms right now">Toggle "List in public lobby" when you create a room to appear here.</Empty>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Join with a code">
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" className="font-mono tracking-[0.3em]" data-testid="input-code" />
              <Button onClick={() => code && nav(`/room/${code}`)} data-testid="button-join-code">Join</Button>
            </div>
          </Panel>
          <Panel title="Create a room">
            <div className="space-y-2">
              {FORMAT_LIST.map((f) => (<div key={f} className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.2em] pt-1" style={{ color: FORMATS[f].accent }}>{FORMATS[f].label}</div>
                {MODES.filter((m) => m.format === f).map((m) => (
                <button key={m.id} onClick={() => setMode(m)} className="w-full text-left rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 flex items-center gap-3" data-testid={`create-${m.id}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: m.accent }} />
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{m.tagline}</span>
                </button>
              ))}</div>))}
            </div>
          </Panel>
        </div>
      </div>
      <CreateRoomDialog mode={mode} onClose={() => setMode(null)} />
    </div>
  );
}
