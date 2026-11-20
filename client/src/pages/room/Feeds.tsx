import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoom } from "./ctx";
import { Panel, Emblem } from "@/components/game";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { relTime } from "@/lib/data";
import { Newspaper, Send } from "lucide-react";

const KIND_COLOR: Record<string, string> = { sold: "#F5C542", record: "#FF9F43", rtm: "#B57BFF", trade: "#3DD6F5", match: "#7CFF6B", trophy: "#F5C542", unsold: "#FF5C8A", undo: "#FF5C8A", retention: "#4D7CFF", system: "#94a3b8", war: "#FF5C8A", bargain: "#00E0A4" };

export function Newsroom({ compact }: { compact?: boolean }) {
  const { st } = useRoom();
  const items = st.news.slice(0, compact ? 8 : 40);
  return (
    <Panel title={<span className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-cyan-300" />Live Auction Newsroom</span>} kind="live" bodyClass={compact ? "p-3" : undefined}>
      <div className="text-[11px] text-muted-foreground mb-2">Headlines are generated automatically from server events in this room. Match headlines describe simulated games.</div>
      <div className={`space-y-2 ${compact ? "max-h-[280px]" : "max-h-[640px]"} overflow-y-auto scrollbar-thin pr-1`}>
        {items.length === 0 && <div className="text-sm text-muted-foreground">No headlines yet.</div>}
        {items.map((n: any, i: number) => (
          <div key={n.ts + ":" + i} className="flex gap-2.5 rounded-lg bg-white/[0.02] px-2.5 py-2" data-testid={`news-${i}`}>
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: KIND_COLOR[n.kind] || "#94a3b8" }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug">{n.text}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{n.kind} · {relTime(n.ts)}</div>
            </div>
            {n.team && <Emblem id={n.team} room={st} size={22} />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function Chat() {
  const { st, act } = useRoom();
  const [t, setT] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 1e6 }); }, [st.chat.length]);
  const send = () => { if (t.trim()) { act("chat", { text: t }); setT(""); } };
  return (
    <Panel title="Room chat" bodyClass="p-3">
      <div ref={ref} className="h-48 overflow-y-auto scrollbar-thin space-y-1.5 mb-2 pr-1">
        {st.chat.length === 0 && <div className="text-xs text-muted-foreground">Say hello to the room.</div>}
        {st.chat.map((c: any, i: number) => (
          <div key={i} className="text-sm"><span className="font-semibold text-cyan-300">{c.name}</span> <span className="text-slate-200/90">{c.text}</span></div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message" maxLength={280} className="h-9" data-testid="input-chat" />
        <Button size="sm" onClick={send} data-testid="button-chat-send" aria-label="Send"><Send className="h-4 w-4" /></Button>
      </div>
    </Panel>
  );
}

export function AuditLog() {
  const { st } = useRoom();
  const q = useQuery<any[]>({ queryKey: [`/api/rooms/${st.code}/audit`], refetchInterval: 5000 });
  return (
    <Panel title="Audit history" right={<span className="text-[11px] text-muted-foreground">Server-side, append-only. Undo actions are recorded, never erased.</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left"><tr><th className="py-1.5 pr-3">Time</th><th className="pr-3">Actor</th><th className="pr-3">Action</th><th>Details</th></tr></thead>
          <tbody>
            {(q.data || []).map((r, i) => (
              <tr key={i} className="border-t border-white/5 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap tnum text-muted-foreground">{new Date(r.ts).toLocaleTimeString()}</td>
                <td className="pr-3 whitespace-nowrap">{r.actor}</td>
                <td className="pr-3 whitespace-nowrap font-mono text-cyan-200">{r.action}</td>
                <td className="font-mono text-[10px] text-slate-400 break-all">{typeof r.data === "string" ? r.data : JSON.stringify(r.data).slice(0, 220)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
