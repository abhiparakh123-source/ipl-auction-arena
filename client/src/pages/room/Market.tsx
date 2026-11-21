import { useState } from "react";
import { useRoom } from "./ctx";
import { Panel, Emblem, PlayerAvatar, RoleChip, Empty, Kind } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtCr } from "@shared/game";
import { fairValue } from "@shared/analytics";
import { ArrowLeftRight, Tag, Check, X } from "lucide-react";

function PickList({ team, sel, setSel, room }: { team: any; sel: string[]; setSel: (s: string[]) => void; room: any }) {
  const { look } = useRoom();
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin pr-1">
      {team.squad.map((s: any) => { const p = look(s.pid); if (!p) return null; const on = sel.includes(s.pid); return (
        <button key={s.pid} onClick={() => setSel(on ? sel.filter((x) => x !== s.pid) : [...sel, s.pid])} className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${on ? "bg-cyan-400/15 ring-1 ring-cyan-300/60" : "bg-white/[0.03] hover:bg-white/[0.06]"}`} data-testid={`pick-${team.id}-${s.pid}`}>
          <PlayerAvatar p={p} size={26} team={team.id} room={room} rounded="rounded-md" /><span className="truncate flex-1">{p.name}</span><RoleChip p={p} /><span className="tnum text-xs text-muted-foreground w-14 text-right">{fmtCr(s.price)}</span>
        </button>
      ); })}
    </div>
  );
}

export default function Market() {
  const { st, myTeam, act, look } = useRoom();
  const others = st.teams.filter((t: any) => t.id !== myTeam?.id);
  const [to, setTo] = useState<string>(others[0]?.id || "");
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [cash, setCash] = useState("0");
  const [ask, setAsk] = useState<Record<string, string>>({});
  const open = st.status === "post" || st.status === "retention" || (st.status === "season" && st.season?.status === "league");
  if (!myTeam) return <Empty title="Marketplace is for franchise owners">Spectators can follow completed trades in the newsroom.</Empty>;
  const B = st.teams.find((t: any) => t.id === to);
  const short = (id: string) => st.teams.find((t: any) => t.id === id)?.short || id;
  const val = (ids: string[]) => ids.reduce((a, p) => a + fairValue(look(p)?.ratings.overall || 40, st.settings.purse), 0);
  const listings = st.teams.flatMap((t: any) => (t.listed || []).map((l: any) => ({ ...l, team: t.id })));
  return (
    <div className="space-y-4">
      <div className={`rounded-xl px-4 py-2 text-sm ${open ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`} data-testid="text-window">
        Trade window is {open ? "OPEN" : "CLOSED"}. It opens after the auction, during retention and through the league stage. The server validates purse, squad size and overseas limits when a trade is proposed and again when it's accepted.
      </div>
      <div className="grid xl:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <Panel title={<span className="flex items-center gap-2"><Emblem id={myTeam.id} room={st} size={20} />You give</span>}><PickList team={myTeam} sel={give} setSel={setGive} room={st} /></Panel>
        <div className="flex xl:flex-col items-center justify-center gap-3 py-4">
          <ArrowLeftRight className="h-8 w-8 text-cyan-300" />
          <div className="text-xs text-center text-muted-foreground">Calculated value<br /><b className="text-white tnum">{fmtCr(val(give))}</b> ⇄ <b className="text-white tnum">{fmtCr(val(get))}</b></div>
          <div className="w-40"><div className="text-[11px] text-muted-foreground">Cash you pay (₹ cr, negative = you receive)</div><Input value={cash} onChange={(e) => setCash(e.target.value)} className="h-9 tnum" data-testid="input-cash" /></div>
          <Button disabled={!open || (!give.length && !get.length)} onClick={async () => { const r = await act("proposeTrade", { to, give, get, cash: Number(cash) || 0 }, "Trade proposed"); if (r.ok) { setGive([]); setGet([]); } }} data-testid="button-propose">Propose trade</Button>
          <div className="text-[11px] text-muted-foreground max-w-[12rem] text-center">AI franchises accept only if the calculated value they receive is at least 5% higher than what they give.</div>
        </div>
        <Panel title={<Select value={to} onValueChange={(v) => { setTo(v); setGet([]); }}><SelectTrigger className="h-8 w-48" data-testid="select-trade-team"><SelectValue /></SelectTrigger><SelectContent>{others.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}{t.ownerId ? "" : " (AI)"}</SelectItem>)}</SelectContent></Select>}>
          {B ? <PickList team={B} sel={get} setSel={setGet} room={st} /> : null}
        </Panel>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Trade offers & history">
          {st.trades.length === 0 ? <div className="text-sm text-muted-foreground">No trades yet.</div> : [...st.trades].reverse().map((t: any) => (
            <div key={t.id} className="rounded-lg bg-white/[0.03] p-2 mb-1.5 text-sm" data-testid={`trade-${t.id}`}>
              <div className="flex items-center gap-2"><b>{short(t.from)}</b>→<b>{short(t.to)}</b><span className={`ml-auto text-[11px] uppercase ${t.status === "accepted" ? "text-emerald-300" : t.status === "pending" ? "text-cyan-300" : "text-rose-300"}`}>{t.status}</span></div>
              <div className="text-xs text-muted-foreground">{short(t.from)} give: {t.give.map((p: string) => look(p)?.name).join(", ") || "—"} · get: {t.get.map((p: string) => look(p)?.name).join(", ") || "—"} · cash {fmtCr(t.cash)}</div>
              {t.note && <div className="text-[11px] text-slate-400">{t.note}</div>}
              {t.status === "pending" && t.to === myTeam.id && <div className="flex gap-2 mt-1"><Button size="sm" onClick={() => act("respondTrade", { id: t.id, accept: true }, "Trade accepted")} data-testid={`accept-${t.id}`}><Check className="h-3.5 w-3.5 mr-1" />Accept</Button><Button size="sm" variant="ghost" onClick={() => act("respondTrade", { id: t.id, accept: false })}><X className="h-3.5 w-3.5 mr-1" />Reject</Button></div>}
              {t.status === "pending" && t.from === myTeam.id && <Button size="sm" variant="ghost" className="mt-1" onClick={() => act("respondTrade", { id: t.id, cancel: true })}>Cancel offer</Button>}
            </div>
          ))}
        </Panel>
        <Panel title="Player marketplace" right={<Kind k="live" />}>
          <div className="text-xs text-muted-foreground mb-2">List your players with an asking price. Buying a listing creates a trade offer that the seller must accept (AI sellers decide instantly).</div>
          {listings.map((l: any) => { const p = look(l.pid); return (
            <div key={l.pid} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 mb-1 text-sm"><Tag className="h-3.5 w-3.5 text-amber-300" /><span className="flex-1 truncate">{p?.name}</span><span className="text-xs text-muted-foreground">{short(l.team)}</span><b className="tnum">{fmtCr(l.ask)}</b>
              {l.team === myTeam.id ? <Button size="sm" variant="ghost" onClick={() => act("list", { pid: l.pid, ask: null })}>Delist</Button> : <Button size="sm" disabled={!open} onClick={() => act("buyListed", { pid: l.pid }, "Offer sent")} data-testid={`buy-${l.pid}`}>Buy</Button>}
            </div>
          ); })}
          <div className="border-t border-white/5 mt-3 pt-3 space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
            {myTeam.squad.filter((s: any) => !listings.some((l: any) => l.pid === s.pid)).map((s: any) => (
              <div key={s.pid} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{look(s.pid)?.name}</span><Input className="h-7 w-20 tnum" placeholder="ask cr" value={ask[s.pid] || ""} onChange={(e) => setAsk({ ...ask, [s.pid]: e.target.value })} /><Button size="sm" variant="outline" className="h-7" onClick={() => act("list", { pid: s.pid, ask: Number(ask[s.pid]) || s.price || 1 }, "Listed")} data-testid={`list-${s.pid}`}>List</Button></div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
