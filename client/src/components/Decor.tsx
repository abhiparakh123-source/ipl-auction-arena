import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useHof, hofColor } from "@/components/HallOfFame";
import {
  Gavel, LayoutGrid, Users, BrainCircuit, BarChart3, Shield, PlayCircle, Trophy, TrendingUp, Award, Telescope, UsersRound, Medal, Settings, Briefcase, Sparkles, Crown,
} from "lucide-react";

/** Purely decorative art. Nothing here reads or changes game state. */

const TEAM_STRIPES = ["#F9CD05", "#004BA0", "#EC1C24", "#3A225D", "#FF822A", "#EA1A85", "#17479E", "#DD1F2D", "#1C2C5B", "#A72056"];

export const THEMES: Record<string, { icon: any; a: string; b: string; art: "ball" | "stumps" | "bat" | "trophy" | "pitch" }> = {
  "/auction": { icon: Gavel, a: "#F5C542", b: "#FF5C8A", art: "trophy" },
  "/modes": { icon: LayoutGrid, a: "#22E4FF", b: "#7C5CFF", art: "ball" },
  "/players": { icon: Users, a: "#2E9BFF", b: "#22E4FF", art: "bat" },
  "/ai": { icon: BrainCircuit, a: "#B07CFF", b: "#22E4FF", art: "pitch" },
  "/stats": { icon: BarChart3, a: "#22E4FF", b: "#2EE59D", art: "pitch" },
  "/franchises": { icon: Shield, a: "#F5C542", b: "#2E6BFF", art: "stumps" },
  "/match": { icon: PlayCircle, a: "#2EE59D", b: "#22E4FF", art: "ball" },
  "/tournament": { icon: Trophy, a: "#F5C542", b: "#FF9F2E", art: "trophy" },
  "/rankings": { icon: TrendingUp, a: "#FF9F2E", b: "#FF5C8A", art: "stumps" },
  "/records": { icon: Award, a: "#F5C542", b: "#B07CFF", art: "bat" },
  "/scouting": { icon: Telescope, a: "#2EE59D", b: "#F5C542", art: "ball" },
  "/friends": { icon: UsersRound, a: "#FF5C8A", b: "#7C5CFF", art: "stumps" },
  "/trophies": { icon: Medal, a: "#F5C542", b: "#FFE7A3", art: "trophy" },
  "/career": { icon: Briefcase, a: "#22E4FF", b: "#F5C542", art: "bat" },
  "/cards": { icon: Sparkles, a: "#FF5C8A", b: "#22E4FF", art: "ball" },
  "/profile": { icon: Settings, a: "#7C5CFF", b: "#22E4FF", art: "pitch" },
  "/hall-of-fame": { icon: Crown, a: "#F5C542", b: "#FFE7A3", art: "trophy" },
};
export function themeFor(loc: string) {
  const k = Object.keys(THEMES).find((p) => loc === p || loc.startsWith(p + "/"));
  return k ? THEMES[k] : { icon: Sparkles, a: "#22E4FF", b: "#F5C542", art: "ball" as const };
}

export function CricketBall({ size = 120, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="cb-g" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#ff6b6b" /><stop offset=".55" stopColor="#b3121f" /><stop offset="1" stopColor="#4a050b" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#cb-g)" />
      <path d="M22 16 C40 38 40 62 22 84" fill="none" stroke="#f6e7c8" strokeWidth="2" opacity=".85" />
      <path d="M28 13 C46 37 46 63 28 87" fill="none" stroke="#f6e7c8" strokeWidth="2" opacity=".85" />
      {Array.from({ length: 11 }).map((_, i) => { const t = i / 10; const y = 18 + t * 64; const x = 25 + Math.sin(t * Math.PI) * 18; return <path key={i} d={`M${x - 3} ${y} L${x + 4} ${y + 1}`} stroke="#fff" strokeWidth="1.2" opacity=".7" />; })}
      <ellipse cx="36" cy="30" rx="14" ry="8" fill="#fff" opacity=".18" transform="rotate(-30 36 30)" />
    </svg>
  );
}

export function Stumps({ size = 120, className = "", color = "#F5C542" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      {[30, 48, 66].map((x) => <rect key={x} x={x} y="22" width="6" height="70" rx="3" fill={color} opacity=".9" />)}
      <rect x="28" y="16" width="22" height="4" rx="2" fill="#fff" opacity=".85" />
      <rect x="50" y="16" width="22" height="4" rx="2" fill="#fff" opacity=".85" transform="rotate(-8 61 18)" />
      <ellipse cx="51" cy="94" rx="34" ry="4" fill="#000" opacity=".35" />
    </svg>
  );
}

export function Bat({ size = 120, className = "", color = "#F5C542" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g transform="rotate(35 50 50)">
        <rect x="46" y="4" width="8" height="28" rx="3" fill="#2b2b2b" />
        {[8, 13, 18, 23, 28].map((y) => <rect key={y} x="45" y={y} width="10" height="2" fill="#555" />)}
        <path d="M40 32 H60 L62 90 Q50 98 38 90 Z" fill={color} />
        <path d="M50 34 V90" stroke="#fff" strokeOpacity=".25" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function TrophyArt({ size = 120, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs><linearGradient id="ta-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE7A3" /><stop offset=".5" stopColor="#F5C542" /><stop offset="1" stopColor="#8a5a14" /></linearGradient></defs>
      <path d="M28 12 H72 V30 C72 48 62 58 50 60 C38 58 28 48 28 30 Z" fill="url(#ta-g)" />
      <path d="M28 18 H16 C16 34 24 40 30 40 M72 18 H84 C84 34 76 40 70 40" fill="none" stroke="url(#ta-g)" strokeWidth="5" />
      <rect x="45" y="60" width="10" height="14" fill="url(#ta-g)" />
      <rect x="32" y="74" width="36" height="8" rx="2" fill="url(#ta-g)" />
      <rect x="26" y="82" width="48" height="8" rx="2" fill="#7a4f14" />
      <path d="M50 22 L53 30 L61 30 L55 35 L57 43 L50 38 L43 43 L45 35 L39 30 L47 30 Z" fill="#fff" opacity=".7" />
    </svg>
  );
}

export function PitchArt({ size = 120, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#0f5c35" opacity=".7" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
      <rect x="45" y="30" width="10" height="40" fill="#c9b27a" />
      <path d="M43 34 H57 M43 66 H57" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

const ARTS = { ball: CricketBall, stumps: Stumps, bat: Bat, trophy: TrophyArt, pitch: PitchArt };

export function TeamRibbon({ className = "" }: { className?: string }) {
  return <div className={`flex h-1 overflow-hidden rounded-full ${className}`} aria-hidden="true">{TEAM_STRIPES.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>;
}

export function SeamDivider({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-full h-3 ${className}`} viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6 Q100 1 200 6 T400 6" fill="none" stroke="#F5C542" strokeOpacity=".55" strokeWidth="1" />
      {Array.from({ length: 40 }).map((_, i) => <path key={i} d={`M${i * 10 + 3} ${3.5} L${i * 10 + 7} ${8.5}`} stroke="#FFE7A3" strokeOpacity=".45" strokeWidth="1" />)}
    </svg>
  );
}

/** Decorative page banner shared by every page header. */
export function PageBanner({ eyebrow, title, sub, right }: { eyebrow?: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  const [loc] = useLocation();
  const t = themeFor(loc);
  const Art = ARTS[t.art];
  const Icon = t.icon;
  return (
    <div className="page-banner relative mb-6 overflow-hidden rounded-3xl border border-white/10" style={{ ["--ba" as any]: t.a, ["--bb" as any]: t.b }} data-testid="page-banner">
      <div className="absolute inset-0 page-banner-bg" />
      <div className="absolute inset-0 stage-beams opacity-50" />
      <div className="absolute inset-0 hof-sparkle opacity-70" />
      <div className="absolute inset-0 banner-grid" />
      <div className="absolute right-2 sm:right-8 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 sm:opacity-95"><div className="banner-art"><Art size={118} className="w-[84px] h-[84px] sm:w-[118px] sm:h-[118px] drop-shadow-[0_10px_30px_rgba(0,0,0,.6)]" /></div></div>
      <Icon className="absolute right-40 top-4 h-24 w-24 opacity-[0.06] hidden md:block pointer-events-none" />
      <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
      <div className="relative flex flex-wrap items-end gap-4 px-5 py-5 sm:px-7 sm:py-6 pr-20 sm:pr-44">
        <div className="min-w-0 flex items-start gap-3.5">
          <div className="hidden sm:grid shrink-0 h-12 w-12 place-items-center rounded-2xl border border-white/15 banner-icon"><Icon className="h-6 w-6" style={{ color: t.a }} /></div>
          <div className="min-w-0">
            {eyebrow && <div className="text-[11px] uppercase tracking-[0.3em] mb-1 flex items-center gap-2" style={{ color: t.a }}><span className="inline-block h-px w-6" style={{ background: t.a }} />{eyebrow}</div>}
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight title-shine">{title}</h1>
            {sub && <p className="mt-1 text-sm text-white/70 max-w-3xl">{sub}</p>}
          </div>
        </div>
      </div>
      {right && <div className="relative flex flex-wrap gap-2 px-5 pb-4 sm:px-7 -mt-1">{right}</div>}
      <TeamRibbon className="absolute bottom-0 inset-x-0 !rounded-none opacity-80" />
    </div>
  );
}

/** Scrolling strip of real IPL champions (historical, from Cricsheet). */
export function ChampionTicker() {
  const hof = useHof();
  const seasons: any[] = hof.data?.seasons || [];
  if (!seasons.length) return null;
  const items = [...seasons].reverse().map((s) => ({ y: s.year, w: s.final.winner, id: s.final.winnerId, pom: s.final.pom?.[0]?.name }));
  const row = (k: string) => items.map((x) => {
    const c = hofColor(x.id);
    return (
      <span key={k + x.y} className="inline-flex items-center gap-2 px-4 text-[11px] whitespace-nowrap">
        <Trophy className="h-3 w-3 text-amber-300" />
        <span className="font-display tnum text-amber-200">{x.y}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: c.primary, boxShadow: `0 0 8px ${c.primary}` }} />
        <span className="text-white/85">{x.w}</span>
        {x.pom && <span className="text-white/40">· final MVP {x.pom}</span>}
        <span className="text-white/20 pl-2">◆</span>
      </span>
    );
  });
  return (
    <Link href="/hall-of-fame" className="champ-ticker relative flex h-8 items-center overflow-hidden border-b border-white/5 bg-black/30" data-testid="ticker-champions" aria-label="IPL champions by season. Open Hall of Fame">
      <span className="relative z-10 shrink-0 h-full flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-black bg-gradient-to-r from-amber-300 to-amber-500">Champions</span>
      <div className="relative flex-1 h-full overflow-hidden"><div className="ticker-track absolute left-0 top-0 h-full flex items-center w-max">{row("a")}{row("b")}</div></div>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-12 overflow-hidden border-t border-white/5" data-testid="site-footer">
      <TeamRibbon className="!rounded-none opacity-70" />
      <div className="absolute inset-0 footer-glow pointer-events-none" />
      <div className="relative max-w-[1500px] mx-auto px-4 md:px-8 py-8 grid gap-6 md:grid-cols-[1.2fr_1fr_1fr] items-start">
        <div className="flex items-start gap-4">
          <CricketBall size={54} className="ball-spin shrink-0" />
          <div>
            <div className="font-display text-lg font-semibold">IPL Auction Arena</div>
            <p className="text-xs text-white/55 mt-1 max-w-sm">A fan-made auction and franchise game. Team marks are original monograms, not official logos. Match results and commentary in the game are simulated.</p>
          </div>
        </div>
        <div className="text-xs text-white/55 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80 mb-2">Real data from</div>
          <a className="block hover:text-white" href="https://cricsheet.org/downloads/" target="_blank" rel="noreferrer">Cricsheet ball-by-ball (ODC-BY)</a>
          <a className="block hover:text-white" href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons photos</a>
          <a className="block hover:text-white" href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata and Wikipedia</a>
        </div>
        <div className="text-xs text-white/55 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80 mb-2">Jump in</div>
          <Link className="block hover:text-white" href="/auction">Auction Centre</Link>
          <Link className="block hover:text-white" href="/hall-of-fame">Hall of Fame</Link>
          <Link className="block hover:text-white" href="/cards">Trading Cards</Link>
        </div>
      </div>
      <svg className="relative block w-full h-10 opacity-40" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 L0 28 Q360 6 720 14 Q1080 6 1440 28 L1440 40 Z" fill="#0f5c35" />
        <path d="M0 30 Q360 10 720 18 Q1080 10 1440 30" fill="none" stroke="#fff" strokeOpacity=".5" strokeDasharray="4 6" />
      </svg>
      <div className="relative border-t border-white/5 px-4 py-4 text-center text-xs tracking-wide text-white/50">
        Made with <span className="text-rose-400">❤️</span> by Abhi Parakh
      </div>
    </footer>
  );
}

/** Small decorative empty-state art. */
export function EmptyArt() {
  return (
    <div className="relative mx-auto mb-2 h-20 w-28" aria-hidden="true">
      <Stumps size={80} className="absolute left-0 top-0" color="#7c8db5" />
      <CricketBall size={30} className="absolute right-1 bottom-1 ball-bounce" />
    </div>
  );
}
