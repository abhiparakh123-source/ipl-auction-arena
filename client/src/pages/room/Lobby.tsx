import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoom } from "./ctx";
import { Emblem, Panel } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_PERSONALITIES, MODE_BY_ID, RULESETS, fmtCr, FORMATS } from "@shared/game";
import { api } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Chat } from "./Feeds";
import { Crown, Bot, CheckCircle2, Circle, UserX, Play, Send } from "lucide-react";

function NumField({ label, k, step = 1, min, max, disabled, hint }: { label: string; k: string; step?: number; min?: number; max?: number; disabled?: boolean; hint?: string }) {
  const { st, act } = useRoom();
  const [v, setV] = useState(String(st.settings[k] ?? ""));
  useEffect(() => setV(String(st.settings[k] ?? "")), [st.settings[k]]);
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step={step} min={min} max={max} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (String(st.settings[k]) !== v) act("settings", { patch: { [k]: v === "" ? null : Number(v) } }); }} className="tnum h-9" data-testid={`setting-${k}`} />
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
function BoolField({ label, k, disabled }: { label: string; k: string; disabled?: boolean }) {
  const { st, act } = useRoom();
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label className="text-sm">{label}</Label>
      <Switch checked={!!st.settings[k]} disabled={disabled} onCheckedChange={(c) => act("settings", { patch: { [k]: c } })} data-testid={`setting-${k}`} />
    </div>
  );
}
function SelField({ label, k, opts, disabled }: { label: string; k: string; opts: [string, string][]; disabled?: boolean }) {
  const { st, act } = useRoom();
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={String(st.settings[k])} disabled={disabled} onValueChange={(v) => act("settings", { patch: { [k]: v } })}>
        <SelectTrigger className="h-9" data-testid={`setting-${k}`}><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function CustomNames() {
  const { st, act } = useRoom();
  const [names, setNames] = useState<Record<string, any>>(() => Object.fromEntries(st.teams.map((t: any) => [t.id, { name: t.name, short: t.short, primary: t.primary, secondary: t.secondary }])));
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Custom franchise identities</div>
      {st.teams.map((t: any) => (
        <div key={t.id} className="grid grid-cols-[1fr_70px_36px_36px] gap-2 items-center">
          <Input value={names[t.id]?.name || ""} onChange={(e) => setNames({ ...names, [t.id]: { ...names[t.id], name: e.target.value } })} className="h-8 text-xs" data-testid={`custom-name-${t.id}`} />
          <Input value={names[t.id]?.short || ""} maxLength={4} onChange={(e) => setNames({ ...names, [t.id]: { ...names[t.id], short: e.target.value.toUpperCase() } })} className="h-8 text-xs" />
          <input type="color" value={names[t.id]?.primary || "#3366ff"} onChange={(e) => setNames({ ...names, [t.id]: { ...names[t.id], primary: e.target.value } })} className="h-8 w-9 bg-transparent" aria-label="Primary colour" />
          <input type="color" value={names[t.id]?.secondary || "#111111"} onChange={(e) => setNames({ ...names, [t.id]: { ...names[t.id], secondary: e.target.value } })} className="h-8 w-9 bg-transparent" aria-label="Secondary colour" />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => act("settings", { patch: { customNames: names } }, "Franchise identities saved")} data-testid="button-save-names">Save identities</Button>
    </div>
  );
}

function Settings() {
  const { st, isHost } = useRoom();
  const d = !isHost;
  const m = st.mode;
  const intl = !!st.settings.format && st.settings.format !== "ipl";
  return (
    <Panel title="Room rules" right={<span className="text-[11px] text-muted-foreground">{isHost ? "You are the host" : "Host controls these"}</span>}>
      <div className="text-[11px] text-muted-foreground mb-3">{intl ? `${(FORMATS as any)[st.settings.format].label} mode. Auction mechanics follow the IPL baseline; squads and match rules follow the format (no overseas limit, no Impact Player).` : <>Ruleset baseline: {RULESETS[st.settings.ruleset]?.label}. {RULESETS[st.settings.ruleset]?.source}</>}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <NumField label="Purse (₹ cr)" k="purse" step={0.5} disabled={d || m === "mini"} hint={m === "mini" ? "Real 2026 purses apply" : undefined} />
        <NumField label="Squad min" k="squadMin" disabled={d} />
        <NumField label="Squad max" k="squadMax" disabled={d} />
        {!intl && <NumField label="Overseas max" k="overseasMax" disabled={d} />}
        <NumField label="Bid timer (s)" k="bidTimer" disabled={d} />
        <NumField label="Intro (s)" k="introTimer" disabled={d} />
        <NumField label="Increment ×" k="incrementMultiplier" step={0.25} disabled={d} />
        <NumField label="Fixed increment (cr)" k="customIncrement" step={0.05} disabled={d} hint="Blank = IPL slabs" />
        <NumField label="Pool size" k="poolSize" disabled={d} hint="Blank = full pool" />
        <NumField label="Unsold rounds" k="unsoldRounds" disabled={d} />
        {!intl && <NumField label="Overseas fee cap (cr)" k="overseasFeeCap" step={0.5} disabled={d} hint="Excess goes to BCCI" />}
        <SelField label="AI difficulty" k="aiDifficulty" disabled={d} opts={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"], ["expert", "Expert"]]} />
        {m === "legends" && <SelField label="Era" k="era" disabled={d} opts={[["all", "All-time 2008-26"], ["2008-2012", "2008-2012"], ["2013-2017", "2013-2017"], ["2018-2022", "2018-2022"], ["2023-2026", "2023-2026"]]} />}
        {m === "blind" && <SelField label="Reveal results" k="blindVisibility" disabled={d} opts={[["after-set", "After each set"], ["after-lot", "After each lot"], ["hidden", "At auction end"]]} />}
        {m === "championship" && <><NumField label="Seasons" k="seasons" disabled={d} /><NumField label="Retentions" k="retainMax" disabled={d} /><NumField label="Purse top-up / season" k="purseTopUp" disabled={d} /></>}
        {m === "custom" && <NumField label="Franchises" k="teamCount" disabled={d} />}
        {m === "mega" && <NumField label="RTM cards (max)" k="rtmCards" disabled={d || !st.settings.rtm} />}
        {m === "custom" && <SelField label="Pool" k="pool" disabled={d} opts={[["active", "Active players"], ["all", "Everyone"], ["marquee", "Marquee"], ["uncapped", "Uncapped"], ["legends", "Legends"], ["quick", "Quick 60"]]} />}
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 mt-3">
        {m === "mega" && <BoolField label="Retentions + Right-to-Match" k="rtm" disabled={d} />}
        <BoolField label="AI owners fill empty franchises" k="aiFill" disabled={d} />
        <BoolField label="Purse reserve rule" k="reserveRule" disabled={d} />
        <BoolField label="Marquee sets first" k="marqueeSets" disabled={d} />
        <BoolField label="Public room" k="isPublic" disabled={d} />
        <BoolField label="Allow spectators" k="allowSpectators" disabled={d} />
      </div>
      {m === "custom" && isHost && <div className="mt-4"><CustomNames /></div>}
    </Panel>
  );
}

function InviteFriends() {
  const { st } = useRoom();
  const { toast } = useToast();
  const friends = useQuery<any[]>({ queryKey: ["/api/friends"] });
  const acc = (friends.data || []).filter((f) => f.status === "accepted");
  if (!acc.length) return <div className="text-xs text-muted-foreground">Add friends in Friends League to invite them here, or share the invite link above.</div>;
  return (
    <div className="space-y-1.5">
      {acc.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} />{f.username}
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={async () => { try { await api("POST", "/api/invites", { to: f.id, code: st.code }); toast({ title: `Invite sent to ${f.username}` }); } catch (e: any) { toast({ title: "Invite failed", description: e.message, variant: "destructive" }); } }} data-testid={`button-invite-${f.username}`}><Send className="h-3.5 w-3.5 mr-1" />Invite</Button>
        </div>
      ))}
    </div>
  );
}

export default function Lobby() {
  const { st, act, isHost, myTeam } = useRoom();
  const me = st.members.find((m: any) => m.userId === st.me.userId);
  const mode = MODE_BY_ID[st.mode];
  const invite = `${location.origin}${location.pathname}#/join/${st.code}`;
  return (
    <div className="grid xl:grid-cols-[1.35fr_1fr] gap-6">
      <div className="space-y-6">
        <Panel title="Choose your franchise" right={<span className="text-xs text-muted-foreground">{st.universe === "real2026" ? "Real IPL 2026 squads and remaining purses load when the host starts. All results are simulated." : `${mode?.description.slice(0, 80)}…`}</span>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {st.teams.map((t: any) => {
              const mine = t.id === st.me.teamId;
              return (
                <div key={t.id} className={`rounded-xl border p-3 flex flex-col items-center text-center gap-1.5 transition-colors ${mine ? "border-cyan-300 bg-cyan-400/10 ring-glow" : "border-white/5 bg-white/[0.02]"}`} data-testid={`team-${t.id}`}>
                  <Emblem id={t.id} room={st} size={46} />
                  <div className="text-xs font-semibold leading-tight">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground min-h-[16px]">
                    {t.ownerId ? <span className="text-emerald-300">{t.ownerName}{t.online ? " ●" : ""}</span> : t.ai ? <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{(AI_PERSONALITIES as any)[t.ai]?.label}</span> : "Open"}
                  </div>
                  {!t.ownerId && <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => act("pickTeam", { teamId: t.id })} data-testid={`button-take-${t.id}`}>Take</Button>}
                  {mine && <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => act("pickTeam", { teamId: null })} data-testid="button-leave-team">Leave</Button>}
                  {isHost && !t.ownerId && (
                    <Select value={t.ai || "none"} onValueChange={(v) => act("setAI", { teamId: t.id, personality: v === "none" ? null : v })}>
                      <SelectTrigger className="h-7 text-[11px]" data-testid={`select-ai-${t.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No AI</SelectItem>
                        {Object.entries(AI_PERSONALITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">Purse per franchise: {st.mode === "mini" ? "real 2026 remaining purses" : fmtCr(st.settings.purse)} · Squad {st.settings.squadMin}-{st.settings.squadMax}{st.settings.format && st.settings.format !== "ipl" ? ` · ${(FORMATS as any)[st.settings.format].label}` : ` · up to ${st.settings.overseasMax} overseas`}.</div>
        </Panel>
        <Settings />
      </div>
      <div className="space-y-6">
        <Panel title="Ready room" kind="live">
          <div className="space-y-2">
            {st.members.map((m: any) => (
              <div key={m.userId} className="flex items-center gap-2 text-sm" data-testid={`member-${m.username}`}>
                <span className={`h-2 w-2 rounded-full ${m.online ? "bg-emerald-400" : "bg-slate-600"}`} title={m.online ? "online" : "offline"} />
                <span className="font-medium">{m.username}</span>
                {m.userId === st.hostId && <Crown className="h-3.5 w-3.5 text-amber-300" aria-label="Host" />}
                <span className="text-[11px] text-muted-foreground">{m.teamId ? st.teams.find((t: any) => t.id === m.teamId)?.short : "spectator"}</span>
                <span className="ml-auto">{m.teamId && (m.ready || m.userId === st.hostId ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-500" />)}</span>
                {isHost && m.userId !== st.me.userId && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => act("transferHost", { userId: m.userId })} data-testid={`button-host-${m.username}`}>Make host</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => act("kick", { userId: m.userId })} aria-label="Remove" data-testid={`button-kick-${m.username}`}><UserX className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {myTeam && !isHost && <Button variant={me?.ready ? "outline" : "default"} onClick={() => act("ready", { ready: !me?.ready })} data-testid="button-ready">{me?.ready ? "Not ready" : "I'm ready"}</Button>}
            {isHost && <Button className="gold-glow bg-gradient-to-b from-amber-300 to-amber-500 text-black flex-1" onClick={() => act("start")} data-testid="button-start"><Play className="h-4 w-4 mr-2" />{st.universe === "real2026" ? "Load 2026 squads" : st.mode === "mega" && st.settings.rtm ? "Open retention window" : "Start auction"}</Button>}
          </div>
          {!myTeam && <p className="mt-2 text-xs text-muted-foreground">You're spectating. Take an open franchise to bid.</p>}
        </Panel>
        <Panel title="Invite">
          <div className="flex gap-2 mb-3"><Input readOnly value={invite} className="text-xs font-mono" data-testid="input-invite" onFocus={(e) => e.target.select()} /></div>
          <InviteFriends />
        </Panel>
        <Chat />
      </div>
    </div>
  );
}
