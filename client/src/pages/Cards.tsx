import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePlayers, teamColor, num } from "@/lib/data";
import { PageHeader, PlayerAvatar, Explain } from "@/components/game";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRANCHISES } from "@shared/game";

const RARITY = (r: number) => (r >= 85 ? { k: "Legendary", c: "from-amber-300 via-yellow-200 to-amber-500", t: "text-black" } : r >= 75 ? { k: "Epic", c: "from-violet-500 via-fuchsia-400 to-violet-700", t: "text-white" } : r >= 65 ? { k: "Rare", c: "from-cyan-400 via-sky-300 to-blue-600", t: "text-black" } : { k: "Common", c: "from-slate-500 via-slate-400 to-slate-700", t: "text-white" });

export function TradingCard({ p }: { p: any }) {
  const r = RARITY(p.ratings.overall);
  const tc = teamColor(p.team2026);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  return (
    <Link href={`/players/${p.id}`}>
      <div onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTilt({ x: ((e.clientY - b.top) / b.height - 0.5) * -14, y: ((e.clientX - b.left) / b.width - 0.5) * 14 }); }} onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        className={`relative rounded-2xl p-[2px] bg-gradient-to-br ${r.c} transition-transform duration-100 cursor-pointer`} style={{ transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }} data-testid={`tcard-${p.id}`}>
        <div className="rounded-[14px] overflow-hidden bg-[#070b1a] holo">
          <div className="relative h-48" style={{ background: `linear-gradient(160deg, ${tc.primary}, ${tc.secondary})` }}>
            <div className="absolute inset-0 flex items-end justify-center"><PlayerAvatar p={p} size={170} team={p.team2026} rounded="rounded-none" className="!bg-transparent" /></div>
            <div className={`absolute top-2 left-2 font-display text-3xl font-bold drop-shadow ${r.t === "text-black" ? "text-white" : "text-white"}`}>{Math.round(p.ratings.overall)}</div>
            <div className="absolute top-3 right-2 text-[10px] uppercase tracking-widest bg-black/50 rounded px-1.5 py-0.5">{r.k}</div>
          </div>
          <div className="p-3">
            <div className="font-display text-base font-bold truncate">{p.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{p.role} · {p.country}{p.team2026 ? ` · ${p.team2026}` : ""}</div>
            <div className="grid grid-cols-4 gap-1 mt-2 text-center">{[["BAT", p.ratings.bat], ["BWL", p.ratings.bowl], ["RUN", p.runs], ["WKT", p.wkts]].map(([l, v]) => <div key={l as string} className="rounded bg-white/5 py-1"><div className="text-[9px] text-muted-foreground">{l}</div><div className="text-xs font-bold tnum">{typeof v === "number" && v < 100 && !Number.isInteger(v) ? num(v, 0) : v}</div></div>)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Cards() {
  const { list } = usePlayers();
  const [team, setTeam] = useState("all");
  const [rar, setRar] = useState("all");
  const [q, setQ] = useState("");
  const [photos, setPhotos] = useState("photo");
  const cards = useMemo(() => list.filter((p) => (team === "all" || p.team2026 === team) && (rar === "all" || RARITY(p.ratings.overall).k === rar) && (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (photos === "all" || p.photo) && !p.retired).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 60), [list, team, rar, q, photos]);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Trading Cards" title="Holographic player cards" sub="Rarity follows each player's calculated rating: Legendary 85+, Epic 75+, Rare 65+. Photos are freely licensed Wikimedia Commons images; others show a jersey avatar in team colours." />
      <div className="glass rounded-2xl p-3 flex flex-wrap gap-2">
        <Input className="w-56 h-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={team} onValueChange={setTeam}><SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All teams</SelectItem>{FRANCHISES.map((f) => <SelectItem key={f.id} value={f.id}>{f.short}</SelectItem>)}</SelectContent></Select>
        <Select value={rar} onValueChange={setRar}><SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All rarities</SelectItem>{["Legendary", "Epic", "Rare", "Common"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        <Select value={photos} onValueChange={setPhotos}><SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="photo">With photos</SelectItem><SelectItem value="all">All players</SelectItem></SelectContent></Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">{cards.map((p) => <TradingCard key={p.id} p={p} />)}</div>
      <Explain>Card ratings are calculated metrics from real IPL data. Official IPL jersey headshots are copyrighted by the BCCI/IPL and aren't bundled; you can attach licensed images per player in the photo manager on any player profile.</Explain>
    </div>
  );
}
