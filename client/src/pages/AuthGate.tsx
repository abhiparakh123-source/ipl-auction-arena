import { useState } from "react";
import { api } from "@/lib/queryClient";
import { signedIn } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthGate() {
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: any) => {
    setBusy(true); setErr(null);
    try { signedIn(await api("POST", url, body)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="app-bg grid-floor relative min-h-dvh grid place-items-center p-4">
      <div className="w-full max-w-md">
<div className="glass holo rounded-3xl p-6 md:p-8">
          <h1 className="font-display text-3xl font-semibold text-center">Enter the Arena</h1>
          <p className="text-sm text-muted-foreground text-center mt-2 mb-6">Pick an owner name to play now, or create an account to keep your franchise history, friends and trophies.</p>
          <Tabs defaultValue="guest">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="guest" data-testid="tab-guest">Quick play</TabsTrigger>
              <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="guest" className="space-y-3 pt-4">
              <Input placeholder="Owner name (e.g. Abhi)" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} data-testid="input-guest-name" onKeyDown={(e) => e.key === "Enter" && run("/api/auth/guest", { name })} />
              <Button className="w-full" disabled={busy} onClick={() => run("/api/auth/guest", { name })} data-testid="button-guest">Play as guest</Button>
              <p className="text-[11px] text-muted-foreground">Guest progress is saved on the server for this browser. Register later to keep it across devices.</p>
            </TabsContent>
            <TabsContent value="login" className="space-y-3 pt-4">
              <Input placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} data-testid="input-login-user" />
              <Input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="input-login-pass" onKeyDown={(e) => e.key === "Enter" && run("/api/auth/login", { username: user, password: pass })} />
              <Button className="w-full" disabled={busy} onClick={() => run("/api/auth/login", { username: user, password: pass })} data-testid="button-login">Sign in</Button>
            </TabsContent>
            <TabsContent value="register" className="space-y-3 pt-4">
              <Input placeholder="Username (3-20 chars)" value={user} onChange={(e) => setUser(e.target.value)} data-testid="input-reg-user" />
              <Input placeholder="Password (6+ chars)" type="password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="input-reg-pass" />
              <Button className="w-full" disabled={busy} onClick={() => run("/api/auth/register", { username: user, password: pass })} data-testid="button-register">Create account</Button>
            </TabsContent>
          </Tabs>
          {err && <div className="mt-3 text-sm text-rose-300" data-testid="text-auth-error">{err}</div>}
        </div>
</div>
      <div className="absolute inset-x-0 bottom-4 text-center text-xs font-medium tracking-wide text-white/60">Made with <span className="text-rose-400">❤️</span> by Abhi Parakh</div>
    </div>
  );
}