import { useEffect, useState } from "react";
import { useRoom } from "./ctx";
import { Panel, PlayerAvatar, RoleChip, Emblem, Kind } from "@/components/game";
import { Button } from "@/components/ui/button";
import { fmtCr } from "@shared/game";
import { fairValue } from "@shared/analytics";
import { CheckCircle2, Clock } from "lucide-react";

const CAPPED = [18, 14, 11, 18, 14];

export default function Retention() {
  const { st, act, myTeam, look, isHost } = useRoom();
  const [picks, setPicks] = useState<string[]>([]);
  useEffect(() => { if (Array.isArray(myTeam?.retainPicks)) setPicks(myTeam.retainPicks); }, [myTeam?.id]);
  const max = st.retentionMax ?? 4;
  const mega = st.seasonNo === 1;
  const scale = st.settings.purse / 120;
  const costOf = (list: string[]) => {
    if (!myTeam) return 0;
    if (mega) { let c = 0, k = 0; for (const id of list) { const p = look(id); if (p?.capped) { c += CAPPED[k] ?? 18; k++; } else c += 4; } return c * scale; }
    return list.reduce((a, id) => a + (myTeam.squad.find((x: any) => x.pid === id)?.price || 0), 0);
  };
  const purse = mega ? st.settings.purse : st.settings.purse + st.settings.purseTopUp * (st.seasonNo - 1);
  const cost = costOf(picks);
  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));
  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
      <Panel title={mega ? "Pre-auction retentions" : `Season ${st.seasonNo} retentions`} kind="live" right={<span className="text-xs text-muted-foreground">Up to {max}{mega ? " · unused slots become RTM cards" : ""}</span>}>
        {!myTeam ? <div className="text-sm text-muted-foreground">Spectators watch the retention window. Franchise owners are choosing who to keep.</div> : myTeam.retentionDone ? (
          <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-5 w-5" />Retentions confirmed. Waiting for other franchises.</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-3">
              {mega ? <>Mega auction slabs (scaled to purse): capped ₹18/14/11/18/14 cr, uncapped ₹4 cr. Max 5 capped and 2 uncapped. Source: IPL 2025-27 player regulations as reported by Economic Times.</> : <>Retained players keep their current salary. Purse next season: {fmtCr(purse)}.</>}
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-[560px] overflow-y-auto scrollbar-thin pr-1">
              {myTeam.squad.map((s: any) => {
                const p = look(s.pid); if (!p) return null;
                const on = picks.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} className={`flex items-center gap-3 rounded-xl border p-2 text-left ${on ? "border-amber-300 bg-amber-300/10" : "border-white/5 bg-white/[0.02] hover:bg-white/5"}`} data-testid={`retain-${p.id}`}>
                    <PlayerAvatar p={p} size={44} team={myTeam.id} room={st} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <RoleChip p={p} />
                      <div className="text-[10px] text-muted-foreground tnum mt-0.5">Rating {p.ratings.overall.toFixed(0)} · fair {fmtCr(fairValue(p.ratings.overall, st.settings.purse))}{!mega ? ` · salary ${fmtCr(s.price)}` : ""}</div>
                    </div>
                    {on && <CheckCircle2 className="h-5 w-5 text-amber-300" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="text-sm tnum">Selected {picks.length}/{max} · cost <b className="text-amber-300">{fmtCr(cost)}</b> · purse after <b>{fmtCr(purse - cost)}</b>{mega && st.settings.rtm ? ` · RTM cards ${Math.max(0, 6 - picks.length)}` : ""}</div>
              <Button variant="outline" onClick={() => act("retain", { pids: picks, confirm: false }, "Retention picks saved")} data-testid="button-save-retain">Save draft</Button>
              <Button onClick={() => act("retain", { pids: picks, confirm: true })} data-testid="button-confirm-retain">Confirm retentions</Button>
            </div>
          </>
        )}
      </Panel>
      <Panel title="Franchise status">
        <div className="space-y-2">
          {st.teams.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <Emblem id={t.id} room={st} size={26} />
              <span className="font-medium">{t.short}</span>
              <span className="text-[11px] text-muted-foreground">{t.ownerName || (t.ai ? "AI" : "")}</span>
              <span className="ml-auto flex items-center gap-1 text-xs">{t.retentionDone ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" />done</> : <><Clock className="h-4 w-4 text-amber-300" />choosing</>}</span>
            </div>
          ))}
        </div>
        {isHost && <Button variant="outline" className="mt-4 w-full" onClick={() => act("forceRetention")} data-testid="button-force-retention">Close window now (host)</Button>}
        <div className="mt-3"><Kind k="live" /></div>
      </Panel>
    </div>
  );
}
