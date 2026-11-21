import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { relTime } from "@/lib/data";
import { PageHeader, Panel, Explain } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Check, X, Users, Trophy, Mail } from "lucide-react";

export default function Friends() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const friends = useQuery<any[]>({ queryKey: ["/api/friends"], refetchInterval: 15000 });
  const leagues = useQuery<any[]>({ queryKey: ["/api/leagues"] });
  const invites = useQuery<any[]>({ queryKey: ["/api/invites"] });
  const mine = useQuery<any[]>({ queryKey: ["/api/rooms/mine"] });
  const [name, setName] = useState("");
  const [lname, setLname] = useState("");
  const [lcode, setLcode] = useState("");
  const call = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast({ title: ok }); qc.invalidateQueries(); } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } };
  const openRooms = (mine.data || []).filter((r) => r.status !== "complete");
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Friends League" title="Play with your crew" sub="Add friends by username, invite them straight into auction rooms and compete on a private league leaderboard." />
      <div className="grid xl:grid-cols-3 gap-4">
        <Panel title={<span className="flex items-center gap-2"><Users className="h-4 w-4" />Friends</span>}>
          <div className="flex gap-2 mb-3"><Input placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-friend" /><Button onClick={() => call(() => api("POST", "/api/friends", { username: name }), "Friend request sent")} data-testid="button-add-friend"><UserPlus className="h-4 w-4" /></Button></div>
          {(friends.data || []).length === 0 && <div className="text-sm text-muted-foreground">No friends yet. Share your username from Profile.</div>}
          {(friends.data || []).map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-1.5 border-t border-white/5 first:border-0 text-sm" data-testid={`friend-${f.username}`}>
              <span className={`h-2 w-2 rounded-full ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} title={f.online ? "In a room now" : "Offline"} />
              <span className="flex-1">{f.username} <span className="text-xs text-muted-foreground">Lv {f.level}</span></span>
              {f.status === "pending" && <Button size="sm" className="h-7" onClick={() => call(() => api("POST", `/api/friends/${f.id}/accept`), "Friend added")}><Check className="h-3.5 w-3.5" /></Button>}
              {f.status === "requested" && <span className="text-xs text-muted-foreground">requested</span>}
              {f.status === "accepted" && openRooms.length > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => call(() => api("POST", "/api/invites", { code: openRooms[0].code, to: f.id }), `Invited to ${openRooms[0].name}`)} title={`Invite to ${openRooms[0].name}`}><Mail className="h-3.5 w-3.5 mr-1" />Invite</Button>}
              <button onClick={() => call(() => api("DELETE", `/api/friends/${f.id}`), "Removed")} aria-label="Remove"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          ))}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Mail className="h-4 w-4" />Room invites</span>}>
          {(invites.data || []).length === 0 ? <div className="text-sm text-muted-foreground">No invites yet.</div> : (invites.data || []).map((i) => (
            <div key={i.id} className="flex items-center gap-2 py-1.5 text-sm border-t border-white/5 first:border-0"><span className="flex-1"><b>{i.from}</b> invited you to {i.room ? i.room.name : <span className="text-muted-foreground">a closed room</span>}<div className="text-[11px] text-muted-foreground">{relTime(i.created)}</div></span>{i.room && <Button size="sm" className="h-7" onClick={() => { api("POST", `/api/invites/${i.id}/seen`); nav(`/room/${i.room_code}`); }}>Join</Button>}</div>
          ))}
          <Explain>Invites go to friends only. You can also copy a room's invite link from inside the room and send it anywhere.</Explain>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Trophy className="h-4 w-4" />Leagues</span>}>
          <div className="flex gap-2 mb-2"><Input placeholder="New league name" value={lname} onChange={(e) => setLname(e.target.value)} data-testid="input-league" /><Button onClick={() => call(() => api("POST", "/api/leagues", { name: lname }), "League created")} data-testid="button-create-league">Create</Button></div>
          <div className="flex gap-2 mb-3"><Input placeholder="Join with code" value={lcode} onChange={(e) => setLcode(e.target.value)} /><Button variant="outline" onClick={() => call(() => api("POST", "/api/leagues/join", { code: lcode }), "Joined league")}>Join</Button></div>
          {(leagues.data || []).map((l) => (
            <div key={l.id} className="rounded-xl bg-white/[0.03] p-3 mb-2">
              <div className="flex items-center"><b className="flex-1">{l.name}</b><span className="text-xs font-mono bg-white/5 rounded px-2 py-0.5">{l.code}</span></div>
              {l.board.map((m: any, i: number) => <div key={m.id} className="flex text-sm gap-2 mt-1"><span className="w-4 text-muted-foreground tnum">{i + 1}</span><span className="flex-1">{m.username}</span><span className="text-xs text-muted-foreground">{m.titles} titles · {m.rooms} rooms</span><b className="tnum">{m.points}</b></div>)}
              <div className="text-[10px] text-muted-foreground mt-1">{l.scoring}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
