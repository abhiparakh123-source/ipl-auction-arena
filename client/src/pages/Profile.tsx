import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { session, updateSettings, signedIn } from "@/lib/store";
import { sfx, testVoice as runVoiceTest } from "@/lib/sound";
import { PageHeader, Panel, Explain } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { COMMENTARY_STYLES } from "@shared/game";
import { LogOut, Save, Search } from "lucide-react";

export default function Profile() {
  const { toast: voiceToast } = useToast();
  const testVoice = async () => { const msg = await runVoiceTest(); voiceToast({ title: "Voice test", description: msg }); };
  const me = session.use((s) => s.me)!;
  const st = session.use((s) => s.settings);
  const { toast } = useToast();
  const [bio, setBio] = useState(me.bio || "");
  const [privacy, setPrivacy] = useState(me.privacy || "public");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [look, setLook] = useState("");
  const [view, setView] = useState("");
  const other = useQuery<any>({ queryKey: ["/api/users", view], enabled: !!view, queryFn: () => api("GET", `/api/users/${encodeURIComponent(view)}`), retry: false });
  const save = async () => { try { const r = await api<any>("PATCH", "/api/me", { bio, privacy }); session.set({ me: { ...me, ...r.user } }); toast({ title: "Profile saved" }); } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } };
  const register = async () => { try { const r = await api<any>("POST", "/api/auth/register", { username: u, password: p }); signedIn(r); toast({ title: `Account secured as ${r.user.username}` }); } catch (e: any) { toast({ title: "Could not register", description: e.message, variant: "destructive" }); } };
  const vol = (k: "master" | "music" | "sfx" | "crowd", l: string) => (
    <div className="flex items-center gap-3 text-sm"><span className="w-28">{l}</span><Slider value={[Math.round(st[k] * 100)]} max={100} step={5} onValueChange={(v) => updateSettings({ [k]: v[0] / 100 } as any)} onValueCommit={() => sfx.click()} className="flex-1" data-testid={`slider-${k}`} /><span className="w-10 text-right tnum text-xs">{Math.round(st[k] * 100)}%</span></div>
  );
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Profile & Settings" title={me.username} sub={`Level ${me.level} · ${me.xp} XP${me.guest ? " · guest account" : ""}`} right={<Button variant="outline" onClick={async () => { await api("POST", "/api/auth/logout"); location.reload(); }} data-testid="button-logout"><LogOut className="h-4 w-4 mr-1" />Sign out</Button>} />
      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Profile">
          <label className="text-xs">Bio<Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="mt-1" data-testid="input-bio" /></label>
          <div className="mt-3 text-xs">Privacy</div>
          <Select value={privacy} onValueChange={setPrivacy}><SelectTrigger className="h-9 mt-1" data-testid="select-privacy"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public: anyone can see my stats</SelectItem><SelectItem value="friends">Friends only</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select>
          <Button className="mt-3" onClick={save} data-testid="button-save-profile"><Save className="h-4 w-4 mr-1" />Save profile</Button>
          {me.guest && (
            <div className="mt-5 rounded-xl bg-amber-400/10 p-3">
              <div className="text-sm font-semibold">Secure your guest account</div>
              <div className="text-xs text-muted-foreground mb-2">Set a username and password to sign in from other devices. Your rooms, trophies and XP carry over.</div>
              <div className="flex gap-2"><Input placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} data-testid="input-reg-user" /><Input type="password" placeholder="Password (6+)" value={p} onChange={(e) => setP(e.target.value)} data-testid="input-reg-pass" /><Button onClick={register} data-testid="button-register">Save</Button></div>
            </div>
          )}
        </Panel>
        <Panel title="Audio & graphics">
          <div className="space-y-3">
            {vol("master", "Master")}{vol("music", "Music")}{vol("sfx", "Sound effects")}{vol("crowd", "Crowd")}
            <div className="flex items-center gap-3 text-sm"><span className="w-28">Graphics</span>
              <Select value={st.graphics} onValueChange={(v) => updateSettings({ graphics: v as any })}><SelectTrigger className="h-9 flex-1" data-testid="select-graphics"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto (detect device)</SelectItem><SelectItem value="high">High: reflections, crowd, particles</SelectItem><SelectItem value="low">Low: simplified 3D</SelectItem><SelectItem value="off">Lightweight: 3D off</SelectItem></SelectContent></Select></div>
            <div className="flex items-center gap-3 text-sm"><span className="w-28">Commentary</span>
              <Select value={st.commentary} onValueChange={(v) => updateSettings({ commentary: v as any })}><SelectTrigger className="h-9 flex-1" data-testid="select-commentary"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(COMMENTARY_STYLES).map(([k, v]) => <SelectItem key={k} value={k}>{v as string}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center justify-between text-sm"><span>Spoken auctioneer and commentary voice</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={testVoice} data-testid="button-test-voice">Test voice</Button><Switch checked={st.voice} onCheckedChange={(v) => updateSettings({ voice: v })} data-testid="switch-voice" /></div></div>
            <div className="flex items-center justify-between text-sm"><span>Live auction commentary</span><Switch checked={st.liveCommentary} onCheckedChange={(v) => updateSettings({ liveCommentary: v })} data-testid="switch-live-commentary" /></div>
            <div className="flex items-center justify-between text-sm"><span>Pointer trails</span><Switch checked={st.trails} onCheckedChange={(v) => updateSettings({ trails: v })} data-testid="switch-trails" /></div>
            <div className="flex items-center justify-between text-sm"><span>Reduced motion</span><Switch checked={st.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} data-testid="switch-motion" /></div>
            <Button size="sm" variant="outline" onClick={() => { sfx.bid(true); setTimeout(() => sfx.gavel(), 300); setTimeout(() => sfx.sold(), 600); }}>Test sounds</Button>
          </div>
          <Explain>All sounds are synthesised in your browser (no third-party audio). The game stays fully playable with 3D off; frame rate depends on your device.</Explain>
        </Panel>
        <Panel title="Look up an owner" className="xl:col-span-2">
          <div className="flex gap-2 max-w-md"><Input placeholder="Username" value={look} onChange={(e) => setLook(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setView(look)} /><Button variant="outline" onClick={() => setView(look)}><Search className="h-4 w-4" /></Button></div>
          {other.error && <div className="text-sm text-muted-foreground mt-2">{(other.error as Error).message}</div>}
          {other.data && <div className="mt-3 text-sm"><b>{other.data.user.username}</b> · Level {other.data.user.level} {other.data.user.bio && <span className="text-muted-foreground">— {other.data.user.bio}</span>}{other.data.private ? <div className="text-muted-foreground">This profile is private.</div> : <div className="text-muted-foreground">{other.data.stats.rooms} rooms · {other.data.stats.titles} titles · {other.data.stats.buys} buys · {other.data.achievements.length} achievements</div>}</div>}
        </Panel>
      </div>
    </div>
  );
}
