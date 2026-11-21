import { useSyncExternalStore } from "react";
import { api, setToken, API_BASE, queryClient } from "./queryClient";

export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<T> | ((s: T) => Partial<T>)) => {
      const p = typeof patch === "function" ? (patch as any)(state) : patch;
      state = { ...state, ...p };
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
    use<S>(sel: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state), () => sel(state));
    },
  };
}

// ---------- user & settings ----------
export interface Me { id: string; username: string; xp: number; level: number; guest: boolean; avatar: string | null; bio: string | null; privacy: string; settings: any; created: number }
export interface Settings { master: number; music: number; sfx: number; crowd: number; graphics: "auto" | "high" | "low" | "off"; trails: boolean; commentary: "pro" | "energetic" | "tactical" | "friends"; reducedMotion: boolean; voice: boolean; voiceVol: number; liveCommentary: boolean }
export const DEFAULT_SETTINGS: Settings = { master: 0.7, music: 0.35, sfx: 0.8, crowd: 0.5, graphics: "auto", trails: true, commentary: "pro", reducedMotion: false, voice: true, voiceVol: 0.9, liveCommentary: true };
export const session = createStore<{ me: Me | null; ready: boolean; settings: Settings }>({ me: null, ready: false, settings: DEFAULT_SETTINGS });

export async function bootSession() {
  try {
    const r = await api<{ user: Me | null; token: string | null }>("GET", "/api/me");
    if (r.user) { if (r.token) setToken(r.token); session.set({ me: r.user, settings: { ...DEFAULT_SETTINGS, ...(r.user.settings || {}) } }); }
  } catch {}
  session.set({ ready: true });
}
export function signedIn(r: { user: Me; token: string }) {
  setToken(r.token);
  session.set({ me: r.user, settings: { ...DEFAULT_SETTINGS, ...(r.user.settings || {}) } });
  queryClient.invalidateQueries();
}
let saveT: any = null;
export function updateSettings(p: Partial<Settings>) {
  session.set((s) => ({ settings: { ...s.settings, ...p } }));
  clearTimeout(saveT);
  saveT = setTimeout(() => { if (session.get().me) api("PATCH", "/api/me", { settings: session.get().settings }).catch(() => {}); }, 600);
}
export function graphicsLevel(): "high" | "low" | "off" {
  const g = session.get().settings.graphics;
  if (g !== "auto") return g;
  const cores = (navigator as any).hardwareConcurrency || 4;
  const mobile = window.matchMedia("(max-width: 768px)").matches;
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "off";
  } catch { return "off"; }
  return mobile || cores <= 4 ? "low" : "high";
}

// ---------- realtime room connection ----------
export function wsUrl() {
  const base = new URL(API_BASE || "/", window.location.href);
  const proto = base.protocol === "https:" ? "wss:" : "ws:";
  const path = base.pathname.replace(/\/$/, "");
  return `${proto}//${base.host}${path}/ws`;
}

type Ack = { ok: boolean; error?: string };
export class RoomConn {
  ws: WebSocket | null = null;
  code: string;
  token: string | null;
  store = createStore<{ state: any | null; status: "connecting" | "online" | "offline" | "error"; error: string | null; offset: number; latency: number | null }>({ state: null, status: "connecting", error: null, offset: 0, latency: null });
  pending = new Map<number, (a: Ack) => void>();
  seq = 1;
  retry = 0;
  closed = false;
  listeners = new Set<(ev: any) => void>();
  pingT: any;
  constructor(code: string, token: string | null) { this.code = code; this.token = token; this.open(); }
  open() {
    if (this.closed) return;
    this.store.set({ status: "connecting" });
    const ws = new WebSocket(`${wsUrl()}?token=${encodeURIComponent(this.token || "")}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ type: "join", code: this.code }));
      clearInterval(this.pingT);
      this.pingT = setInterval(() => this.raw({ type: "ping", t: Date.now() }), 5000);
      this.raw({ type: "ping", t: Date.now() });
    };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "state") {
        this.store.set({ state: d.state, status: "online", error: null, offset: d.state.now - Date.now() });
      } else if (d.type === "ack") {
        const f = this.pending.get(d.id); if (f) { this.pending.delete(d.id); f(d); }
      } else if (d.type === "event") this.listeners.forEach((f) => f(d));
      else if (d.type === "pong") this.store.set({ latency: Date.now() - d.t });
      else if (d.type === "error") this.store.set({ error: d.error, status: d.error === "Room not found" ? "error" : this.store.get().status });
      else if (d.type === "kicked") { this.store.set({ error: "You were removed from this room by the host", status: "error" }); this.close(); }
    };
    ws.onclose = () => {
      clearInterval(this.pingT);
      for (const f of this.pending.values()) f({ ok: false, error: "Connection lost — reconnecting" });
      this.pending.clear();
      if (this.closed || this.store.get().status === "error") return;
      this.store.set({ status: "offline" });
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), wait);
    };
  }
  raw(m: any) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  send(type: string, payload: any = {}): Promise<Ack> {
    return new Promise((res) => {
      if (this.ws?.readyState !== 1) return res({ ok: false, error: "Not connected — reconnecting" });
      const id = this.seq++;
      this.pending.set(id, res);
      this.ws.send(JSON.stringify({ type, id, ...payload }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); res({ ok: false, error: "Server did not respond" }); } }, 8000);
    });
  }
  onEvent(f: (ev: any) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  close() { this.closed = true; clearInterval(this.pingT); this.ws?.close(); }
}
