import { createContext, useContext, useMemo } from "react";
import type { RoomConn } from "@/lib/store";
import type { PlayerSummary } from "@shared/game";
import { useToast } from "@/hooks/use-toast";
import { sfx } from "@/lib/sound";

export interface RoomCtx { conn: RoomConn; st: any; look: (id: string) => PlayerSummary | undefined; byId: Record<string, PlayerSummary> }
export const Ctx = createContext<RoomCtx | null>(null);
export function useRoom() {
  const c = useContext(Ctx)!;
  const { toast } = useToast();
  const act = useMemo(() => async (type: string, payload: any = {}, okMsg?: string) => {
    const r = await c.conn.send(type, payload);
    if (!r.ok) { sfx.error(); toast({ title: "Action rejected by server", description: r.error, variant: "destructive" }); }
    else if (okMsg) toast({ title: okMsg });
    return r;
  }, [c.conn]);
  const myTeam = c.st.teams.find((t: any) => t.id === c.st.me.teamId) || null;
  return { ...c, act, myTeam, isHost: c.st.me.isHost as boolean };
}
export const rulesOf = (st: any) => ({ squadMin: st.settings.squadMin, squadMax: st.settings.squadMax, overseasMax: st.settings.overseasMax, purse: st.settings.purse, reserveRule: st.settings.reserveRule });
export const tlOf = (t: any) => ({ id: t.id, name: t.name, purse: t.purse ?? 0, startPurse: t.startPurse, squad: t.squad });
