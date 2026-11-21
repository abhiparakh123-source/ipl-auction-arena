import { useState, type ReactNode } from "react";
import type { PlayerSummary } from "@shared/game";
import { photoUrl, teamColor } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { PageBanner, EmptyArt } from "@/components/Decor";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Original monogram emblem. Official franchise logos are trademarks and are not reproduced. */
export function Emblem({ id, room, size = 40, className }: { id: string | null | undefined; room?: any; size?: number; className?: string }) {
  const c = teamColor(id, room);
  const gid = `g${(id || "x").replace(/\W/g, "")}${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={cn("shrink-0", className)} aria-label={`${c.name} emblem`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.primary} />
          <stop offset="1" stopColor={c.secondary} />
        </linearGradient>
      </defs>
      <path d="M24 2 L44 10 V26 C44 37 35 44 24 46 C13 44 4 37 4 26 V10 Z" fill={`url(#${gid})`} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      <path d="M24 6 L40 12.5 V26 C40 35 33 40.5 24 42.3 C15 40.5 8 35 8 26 V12.5 Z" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
      <text x="24" y="29" textAnchor="middle" fontFamily="Clash Display, General Sans, sans-serif" fontWeight="700" fontSize={c.short.length > 3 ? 11 : 13} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.35)", strokeWidth: 2 }}>
        {c.short}
      </text>
    </svg>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Team-kit illustration used when no freely licensed photo exists. No shirt numbers are shown (not verified data). */
export function JerseyArt({ p, team, room, size, w, h }: { p: PlayerSummary; team?: string | null; room?: any; size?: number; w?: number | string; h?: number | string }) {
  const tid = team || p.team2026 || (p as any).teams?.[(p as any).teams.length - 1] || null;
  const c = teamColor(tid, room);
  const id = `ja${p.id.replace(/\W/g, "")}${Math.round(Number(size || 0))}`;
  const surname = (p.name.split(/\s+/).slice(-1)[0] || p.name).toUpperCase().slice(0, 11);
  return (
    <svg viewBox="0 0 120 150" width={w ?? size} height={h ?? size} preserveAspectRatio="xMidYMid slice" aria-label={`${p.name} in ${c.name} colours (illustration; no licensed photo available)`}>
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="38%" r="75%"><stop offset="0" stopColor={c.primary} stopOpacity=".55" /><stop offset=".55" stopColor="#0b1430" /><stop offset="1" stopColor="#050814" /></radialGradient>
        <linearGradient id={`${id}j`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c.primary} /><stop offset=".7" stopColor={c.primary} /><stop offset="1" stopColor={c.secondary} /></linearGradient>
        <linearGradient id={`${id}sk`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a3550" /><stop offset="1" stopColor="#141b2e" /></linearGradient>
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".45" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity=".4" /></linearGradient>
      </defs>
      <rect width="120" height="150" fill={`url(#${id}bg)`} />
      {/* neck + head */}
      <path d="M52 66 L52 78 L68 78 L68 66 Z" fill={`url(#${id}sk)`} />
      <ellipse cx="60" cy="50" rx="17" ry="20" fill={`url(#${id}sk)`} />
      {/* cap */}
      <path d="M42 46 Q43 27 60 27 Q77 27 78 46 Q60 40 42 46 Z" fill={c.primary} />
      <path d="M42 46 Q60 40 78 46 L90 49 Q62 44 42 49 Z" fill={c.secondary} />
      <circle cx="60" cy="34" r="3" fill={c.secondary} opacity=".9" />
      {/* torso */}
      <path d="M14 150 L18 104 Q22 84 44 78 L52 76 L60 88 L68 76 L76 78 Q98 84 102 104 L106 150 Z" fill={`url(#${id}j)`} />
      <path d="M14 150 L18 104 Q22 84 44 78 L52 76 L60 88 L68 76 L76 78 Q98 84 102 104 L106 150 Z" fill={`url(#${id}sh)`} />
      <path d="M52 76 L60 92 L68 76" fill="none" stroke={c.secondary} strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 118 L98 100" stroke={c.secondary} strokeWidth="5" opacity=".55" />
      <path d="M20 126 L100 108" stroke="#fff" strokeWidth="1" opacity=".25" />
      <g transform="translate(74 92)"><path d="M0 0 L10 0 L10 7 Q10 12 5 14 Q0 12 0 7 Z" fill={c.secondary} stroke="rgba(255,255,255,.5)" strokeWidth=".6" /><text x="5" y="8.5" textAnchor="middle" fontSize="3.6" fontWeight="700" fill="#fff" fontFamily="General Sans, sans-serif">{c.short}</text></g>
      <text x="60" y="140" textAnchor="middle" fontFamily="Clash Display, General Sans, sans-serif" fontWeight="700" fontSize={surname.length > 8 ? 9 : 11} letterSpacing="1.2" fill="rgba(255,255,255,.88)">{surname}</text>
    </svg>
  );
}
function JerseyAvatar({ p, team, room, size }: { p: PlayerSummary; team?: string | null; room?: any; size: number }) {
  return <JerseyArt p={p} team={team} room={room} size={size} />;
}

export function PlayerAvatar({ p, size = 56, team, room, className, credit = false, rounded = "rounded-xl" }: { p?: PlayerSummary | null; size?: number; team?: string | null; room?: any; className?: string; credit?: boolean; rounded?: string }) {
  const [err, setErr] = useState(false);
  if (!p) return <div className={cn("bg-muted", rounded, className)} style={{ width: size, height: size }} />;
  const url = photoUrl(p);
  const c = teamColor(team || p.team2026, room);
  return (
    <div className={cn("relative overflow-hidden shrink-0", rounded, className)} style={{ width: size, height: size, boxShadow: `inset 0 0 0 2px ${c.primary}55` }}>
      {url && !err ? (
        <img src={url} alt={p.name} loading="lazy" onError={() => setErr(true)} className="h-full w-full object-cover object-top" style={{ width: size, height: size }} />
      ) : (
        <JerseyAvatar p={p} team={team} room={room} size={size} />
      )}
      {credit && p.photoCredit && url && !err && (
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] leading-tight text-white/80 px-1 py-0.5 truncate" title={p.photoCredit}>{p.photoCredit}</div>
      )}
      {credit && (!url || err) && <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white/70 px-1 py-0.5 text-center truncate whitespace-nowrap">Jersey avatar</div>}
    </div>
  );
}

const KIND_STYLE: Record<string, string> = {
  historical: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  calculated: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  prediction: "bg-violet-500/15 text-violet-300 border-violet-400/30",
  simulated: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  live: "bg-rose-500/15 text-rose-300 border-rose-400/30",
};
const KIND_LABEL: Record<string, string> = { historical: "Historical stats", calculated: "Calculated metric", prediction: "Model prediction", simulated: "Simulated", live: "Live game data" };
export function Kind({ k, className }: { k: keyof typeof KIND_STYLE; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", KIND_STYLE[k], className)} data-testid={`kind-${k}`}>{KIND_LABEL[k]}</span>;
}

export function Panel({ title, kind, right, children, className, bodyClass }: { title?: ReactNode; kind?: keyof typeof KIND_STYLE; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("glass panel-decor rounded-2xl min-w-0", className)}>
      {(title || right) && (
        <header className="panel-head flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 border-b border-white/5">
          {title && <h3 className="font-display text-[15px] font-semibold tracking-wide flex items-center gap-2"><span className="panel-pip" aria-hidden="true" />{title}</h3>}
          {kind && <Kind k={kind} />}
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, accent, testid }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; testid?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 min-w-0" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      <div className="tnum font-display text-xl font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

export function Explain({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex text-muted-foreground hover:text-foreground" aria-label="Explanation"><Info className="h-3.5 w-3.5" /></button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

export function Bar({ value, max = 100, color = "hsl(var(--cyan))", className }: { value: number; max?: number; color?: string; className?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-1.5 rounded-full bg-white/5 overflow-hidden", className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function RoleChip({ p }: { p: PlayerSummary }) {
  const map: Record<string, string> = { Batter: "BAT", Bowler: "BOWL", "All-rounder": "AR", "Wicket-keeper": "WK" };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider">
      <span className="rounded bg-white/10 px-1.5 py-0.5">{map[p.role]}</span>
      {p.overseas && <span className="rounded bg-violet-500/20 text-violet-200 px-1.5 py-0.5" title="Overseas">OS</span>}
      {!p.capped && <span className="rounded bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5" title="Uncapped">UNC</span>}
      {p.bowlType && p.role !== "Batter" && p.role !== "Wicket-keeper" && <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted-foreground">{p.bowlType}</span>}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center empty-decor">
      <EmptyArt />
      <div className="font-display text-lg">{title}</div>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, right, eyebrow }: { title: string; sub?: ReactNode; right?: ReactNode; eyebrow?: string }) {
  return <PageBanner title={title} sub={sub} right={right} eyebrow={eyebrow} />;
}
