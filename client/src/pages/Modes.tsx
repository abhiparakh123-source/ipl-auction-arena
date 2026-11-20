import { useState } from "react";
import { MODES, FRANCHISES, FORMATS, FORMAT_LIST, type ModeDef, type Format } from "@shared/game";
import { PageHeader, Emblem } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCreateRoom } from "./Home";
import { session } from "@/lib/store";
import { sfx } from "@/lib/sound";
import { Check } from "lucide-react";

export function CreateRoomDialog({ mode, onClose }: { mode: ModeDef | null; onClose: () => void }) {
  const me = session.use((s) => s.me)!;
  const [name, setName] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [team, setTeam] = useState<string | null>(null);
  const [aiFill, setAi] = useState(true);
  const create = useCreateRoom();
  if (!mode) return null;
  const intl = mode.format !== "ipl";
  const names = (mode.defaults.customNames || {}) as Record<string, any>;
  const sides = intl ? FRANCHISES.slice(0, mode.defaults.teamCount || 2).map((f) => ({ id: f.id, ...names[f.id] })) : FRANCHISES;
  const pseudo = intl ? { teams: sides } : undefined;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl" style={{ color: mode.accent }}>{mode.name}</DialogTitle>
          <DialogDescription>{mode.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Room name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${me.username}'s ${mode.name}`} maxLength={60} data-testid="input-room-name" /></div>
          {mode.id !== "custom" && (
            <div>
              <Label>{intl ? "Your side" : "Your franchise"} (optional — you can pick in the lobby)</Label>
              <div className={`grid ${intl ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-5"} gap-2 mt-2`}>
                {sides.map((f: any) => (
                  <button key={f.id} onClick={() => setTeam(team === f.id ? null : f.id)} className={`rounded-lg p-1.5 flex flex-col items-center gap-1 border ${team === f.id ? "border-cyan-300 bg-cyan-400/10" : "border-white/5 hover:bg-white/5"}`} data-testid={`pick-${f.id}`}>
                    <Emblem id={f.id} room={pseudo} size={30} /><span className="text-[10px]">{intl ? f.name : f.short}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between"><Label htmlFor="pub">List in public lobby</Label><Switch id="pub" checked={isPublic} onCheckedChange={setPublic} data-testid="switch-public" /></div>
          {intl && <p className="text-[11px] text-cyan-200/80">{FORMATS[mode.format].label}: matches use {mode.format === "test" ? "four innings over five simulated days" : `${FORMATS[mode.format].overs} overs a side`} and players are rated on their {FORMATS[mode.format].short} record only. Side names are game identities, not real teams.</p>}
          <div className="flex items-center justify-between"><Label htmlFor="ai">Fill empty {intl ? "sides" : "franchises"} with AI owners</Label><Switch id="ai" checked={aiFill} onCheckedChange={setAi} data-testid="switch-aifill" /></div>
          <p className="text-[11px] text-muted-foreground">Purse, squad limits, timers, pools and mode-specific rules can be fine-tuned by the host in the lobby before the auction starts.</p>
          <Button className="w-full" onClick={() => { sfx.click(); create({ mode: mode.id, name: name || undefined, team: team || undefined, settings: { isPublic, aiFill } }); }} data-testid="button-create-room">Create room</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FORMAT_ICON: Record<Format, string> = { ipl: "T20", t20i: "T20I", odi: "50", test: "5D" };

export default function Modes() {
  const [sel, setSel] = useState<ModeDef | null>(null);
  const [fmt, setFmtRaw] = useState<Format>(() => { const h = new URLSearchParams(window.location.hash.split("?")[1] || "").get("f"); return (FORMAT_LIST as string[]).includes(h || "") ? (h as Format) : "ipl"; });
  const setFmt = (f: Format) => { sfx.click(); setFmtRaw(f); };
  const list = MODES.filter((m) => m.format === fmt);
  const F = FORMATS[fmt];
  return (
    <div>
      <PageHeader eyebrow="Game modes" title="Four formats, twenty-two modes" sub="Pick a format first. IPL has ten franchise modes; T20 Internationals, ODIs and Tests each have four nation-based modes with their own player ratings, rules and match engine. All formats share the same accounts, rooms and authoritative server." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" role="tablist" aria-label="Cricket format">
        {FORMAT_LIST.map((f) => {
          const d = FORMATS[f]; const on = f === fmt; const n = MODES.filter((m) => m.format === f).length;
          return (
            <button key={f} role="tab" aria-selected={on} onClick={() => setFmt(f)} data-testid={`tab-format-${f}`}
              className={`relative overflow-hidden rounded-2xl p-4 text-left border transition-all ${on ? "glass-strong" : "glass hover:bg-white/[0.04]"}`}
              style={{ borderColor: on ? `${d.accent}99` : "rgba(255,255,255,.06)", boxShadow: on ? `0 0 0 1px ${d.accent}55, 0 10px 40px -12px ${d.accent}66` : undefined }}>
              <div className="absolute -right-3 -top-4 font-display text-6xl font-black opacity-[0.07] select-none" style={{ color: d.accent }}>{FORMAT_ICON[f]}</div>
              <div className="flex items-center gap-2">
                <span className="h-9 min-w-9 px-2 rounded-lg grid place-items-center font-mono text-[11px] font-bold" style={{ background: `${d.accent}22`, color: d.accent }}>{FORMAT_ICON[f]}</span>
                <div className="min-w-0"><div className="font-display text-base md:text-lg font-semibold leading-tight" style={{ color: on ? d.accent : undefined }}>{d.label}</div><div className="text-[11px] text-muted-foreground">{d.tagline} · {n} modes</div></div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="glass rounded-2xl px-4 py-3 mb-4 text-sm text-slate-300/90 flex flex-wrap gap-x-4 gap-y-1 items-center" data-testid="text-format-summary">
        <b style={{ color: F.accent }}>{F.label}</b><span>{F.description}</span>
        <span className="text-[11px] text-muted-foreground">{F.overs ? `${F.overs} overs · max ${F.bowlerMax} per bowler` : "Unlimited overs · 450-over match limit"}{F.impact ? " · Impact Player" : ""}{F.xiOverseas ? ` · max ${F.xiOverseas} overseas in XI` : " · no overseas limit"}</span>
        {fmt !== "ipl" && <span className="text-[11px] text-muted-foreground w-full">Stats: Cricsheet men's {F.short} ball-by-ball archive (full-member nations; coverage begins 2001-2005, so earlier careers are partial; Cricsheet withholds Afghanistan matches). Ratings are calculated by this game. All match results are simulated.</span>}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((m) => (
          <div key={m.id} className="glass holo rounded-2xl p-5 flex flex-col" style={{ boxShadow: `inset 0 1px 0 ${m.accent}33` }} data-testid={`mode-${m.id}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-semibold" style={{ color: m.accent }}>{m.name}</h2>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground text-right">{m.tagline}</span>
            </div>
            {fmt !== "ipl" && <div className="mt-1"><span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5" style={{ background: `${F.accent}1f`, color: F.accent }}>{F.short}</span></div>}
            <p className="text-sm text-slate-300/80 mt-2">{m.description}</p>
            <ul className="mt-3 space-y-1.5 text-[13px] flex-1">
              {m.mechanics.map((x) => <li key={x} className="flex gap-2"><Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: m.accent }} /><span>{x}</span></li>)}
            </ul>
            <Button className="mt-4" variant="outline" style={{ borderColor: `${m.accent}66` }} onClick={() => { sfx.click(); setSel(m); }} data-testid={`button-mode-${m.id}`}>Set up {m.name}{fmt !== "ipl" ? ` (${F.short})` : ""}</Button>
          </div>
        ))}
      </div>
      <CreateRoomDialog mode={sel} onClose={() => setSel(null)} />
    </div>
  );
}
