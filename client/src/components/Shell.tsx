import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { session, graphicsLevel } from "@/lib/store";
import { unlockAudio, sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { ChampionTicker, SiteFooter, TeamRibbon } from "@/components/Decor";
import {
  Gavel, LayoutGrid, Users, BrainCircuit, BarChart3, Shield, PlayCircle, Trophy, TrendingUp, Award, Telescope, UsersRound, Medal, Settings, Menu, X, Home, Sparkles, Briefcase, Crown,
} from "lucide-react";

const GROUPS: Record<string, string> = { "/": "Play", "/players": "Scout and analyse", "/franchises": "Compete", "/hall-of-fame": "Legacy", "/friends": "Your club" };

export const NAV = [
  { href: "/", label: "Main Menu", icon: Home },
  { href: "/auction", label: "Auction Centre", icon: Gavel },
  { href: "/modes", label: "Game Modes", icon: LayoutGrid },
  { href: "/players", label: "Player Universe", icon: Users },
  { href: "/ai", label: "AI Intelligence", icon: BrainCircuit },
  { href: "/stats", label: "Statistics Hub", icon: BarChart3 },
  { href: "/franchises", label: "Franchise Manager", icon: Shield },
  { href: "/match", label: "Match Simulator", icon: PlayCircle },
  { href: "/tournament", label: "IPL Tournament", icon: Trophy },
  { href: "/rankings", label: "Power Rankings", icon: TrendingUp },
  { href: "/hall-of-fame", label: "Hall of Fame", icon: Crown },
  { href: "/records", label: "Records & Awards", icon: Award },
  { href: "/scouting", label: "Scouting Centre", icon: Telescope },
  { href: "/friends", label: "Friends League", icon: UsersRound },
  { href: "/trophies", label: "Trophy Room", icon: Medal },
  { href: "/career", label: "Career Mode", icon: Briefcase },
  { href: "/cards", label: "Trading Cards", icon: Sparkles },
  { href: "/profile", label: "Profile & Settings", icon: Settings },
];

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center group shrink-0" data-testid="link-logo" aria-label="IPL Auction Arena home">
      <img
        src="/brand/brand-cutout.png"
        alt="IPL Auction Arena — Made with love by Abhi Parakh"
        className={small ? "h-11 w-16 object-contain object-left" : "h-14 w-36 sm:w-44 object-contain object-left"}
        draggable={false}
      />
    </Link>
  );
}

function DecorLayer() {
  const parts = Array.from({ length: 14 }, (_, i) => ({ left: (i * 37) % 100, dur: 14 + ((i * 7) % 12), delay: -((i * 5) % 20), size: 2 + (i % 3) }));
  return (
    <div className="decor-layer" aria-hidden="true">
      <div className="decor-flood" style={{ left: "-12vw", top: "-18vw", background: "radial-gradient(circle, #7cc8ff, transparent 65%)" }} />
      <div className="decor-flood" style={{ right: "-14vw", top: "-16vw", background: "radial-gradient(circle, #ffd37a, transparent 65%)", animationDelay: "-7s" }} />
      {parts.map((p, i) => <span key={i} className="decor-particle" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />)}
      <svg className="decor-stadium" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <defs><linearGradient id="dsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14254d" stopOpacity="0" /><stop offset="1" stopColor="#0a1430" stopOpacity=".95" /></linearGradient></defs>
        <path d="M0 200 L0 120 Q200 70 420 92 L520 60 L920 60 L1020 92 Q1240 70 1440 120 L1440 200 Z" fill="url(#dsg)" />
        {[90, 470, 970, 1350].map((x) => <g key={x}><rect x={x} y="10" width="3" height="110" fill="#1d3263" /><rect x={x - 16} y="4" width="35" height="12" rx="2" fill="#2a4a8a" /><circle cx={x + 1.5} cy="10" r="26" fill="#bfe3ff" opacity=".10" /></g>)}
        <ellipse cx="720" cy="196" rx="520" ry="18" fill="#18a35b" opacity=".12" />
      </svg>
    </div>
  );
}

function PointerTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  const on = session.use((s) => s.settings.trails && !s.settings.reducedMotion && s.settings.graphics !== "off");
  useEffect(() => {
    if (!on) return;
    const c = ref.current!; const ctx = c.getContext("2d")!;
    let pts: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    const resize = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; };
    resize();
    const mv = (e: PointerEvent) => { if (e.pointerType === "mouse") pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); };
    addEventListener("pointermove", mv); addEventListener("resize", resize);
    const loop = () => {
      const now = performance.now();
      pts = pts.filter((p) => now - p.t < 380);
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const life = 1 - (now - b.t) / 380;
        ctx.strokeStyle = `hsla(${190 + i * 2}, 100%, 65%, ${life * 0.55})`;
        ctx.lineWidth = life * 3 * devicePixelRatio;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.x * devicePixelRatio, a.y * devicePixelRatio); ctx.lineTo(b.x * devicePixelRatio, b.y * devicePixelRatio); ctx.stroke();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", mv); removeEventListener("resize", resize); };
  }, [on]);
  if (!on) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[100] h-full w-full" aria-hidden />;
}

export function Shell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const me = session.use((s) => s.me);
  useEffect(() => { setOpen(false); }, [loc]);
  useEffect(() => {
    const f = () => unlockAudio();
    const evs = ["pointerdown", "touchend", "keydown"];
    evs.forEach((e) => addEventListener(e, f, { passive: true }));
    document.documentElement.dataset.gfx = graphicsLevel();
    return () => evs.forEach((e) => removeEventListener(e, f));
  }, []);
  const active = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));
  return (
    <div className="app-bg text-foreground">
      <DecorLayer />
      <PointerTrail />
      <div className="flex min-h-dvh app-content">
        <aside className={cn("sidebar-decor fixed inset-y-0 left-0 z-50 w-64 glass-strong border-r border-white/5 transform transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-dvh", open ? "translate-x-0" : "-translate-x-full")}>
          <div className="relative flex items-center justify-between px-5 h-16 border-b border-white/5">
            <Logo />
            <TeamRibbon className="absolute bottom-0 left-5 right-5 !h-[2px] opacity-60" />
            <button className="lg:hidden p-1" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          <nav className="p-3 space-y-0.5 overflow-y-auto h-[calc(100dvh-8rem)] scrollbar-thin">
            {NAV.map((n) => (
              <div key={n.href}>
              {GROUPS[n.href] && <div className="nav-group mt-2.5 mb-0.5 px-3 text-[9px] uppercase tracking-[0.3em] text-white/35 flex items-center gap-2"><span>{GROUPS[n.href]}</span><span className="flex-1 h-px bg-gradient-to-r from-white/15 to-transparent" /></div>}
              <Link key={n.href} href={n.href} onClick={() => sfx.click()} data-testid={`nav-${n.href.slice(1) || "home"}`}
                className={cn("nav-item relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-sm transition-colors", active(n.href) ? "bg-gradient-to-r from-cyan-500/20 to-transparent text-white ring-glow" : "text-slate-300/80 hover:text-white hover:bg-white/5")}>
                <n.icon className={cn("h-4 w-4", active(n.href) ? "text-cyan-300" : "")} />
                {n.label}
                {active(n.href) && <span className="nav-active-bar" aria-hidden="true" />}
              </Link>
              </div>
            ))}
          </nav>
          <div className="absolute bottom-0 inset-x-0 h-16 border-t border-white/5 px-4 flex items-center gap-3">
            {me ? (
              <Link href="/profile" className="flex items-center gap-3 min-w-0" data-testid="link-me">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 grid place-items-center font-display font-bold text-sm text-black">{me.username.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{me.username}</div>
                  <div className="text-[11px] text-muted-foreground">Level {me.level} · {me.xp} XP{me.guest ? " · guest" : ""}</div>
                </div>
              </Link>
            ) : <span className="text-xs text-muted-foreground">Not signed in</span>}
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="flex-1 min-w-0">
          <header className="lg:hidden sticky top-0 z-30 h-14 glass-strong border-b border-white/5 flex items-center px-4 gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-menu"><Menu className="h-5 w-5" /></button>
            <Logo small />
            <span className="font-display text-sm tracking-wider">IPL AUCTION ARENA</span>
          </header>
          {!bare && <ChampionTicker />}
          <main className={cn(bare ? "" : "px-4 md:px-8 py-6 md:py-8 max-w-[1500px] mx-auto")}>{children}</main>
          {!bare && <SiteFooter />}
        </div>
      </div>
    </div>
  );
}
