import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { usePlayers, num } from "@/lib/data";
import { PageHeader, Panel, PlayerAvatar, RoleChip, Kind, Explain } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { potential, fairValue } from "@shared/analytics";
import { ageOn, fmtCr } from "@shared/game";
import { Eye, Trash2, Telescope } from "lucide-react";

export default function Scouting() {
  const { list, look } = usePlayers();
  const qc = useQueryClient();
  const wl = useQuery<{ pid: string; note: string }[]>({ queryKey: ["/api/watchlist"] });
  const [focus, setFocus] = useState("young");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const ids = new Set((wl.data || []).map((w) => w.pid));
  const scouted = useMemo(() => {
    const act = list.filter((p) => !p.retired && (p.lastSeason ?? 0) >= 2024 && !p.custom);
    const sc = (p: any) => ({ p, pot: potential(p), age: ageOn(p.dob), fv: fairValue(p.ratings.overall) });
    const all = act.map(sc);
    if (focus === "young") return all.filter((x) => x.age != null && x.age <= 24).sort((a, b) => b.pot - a.pot).slice(0, 18);
    if (focus === "uncapped") return all.filter((x) => !x.p.capped).sort((a, b) => b.pot - a.pot).slice(0, 18);
    if (focus === "form") return all.filter((x) => x.p.ratings.form != null && x.p.matches >= 8).sort((a, b) => (b.p.ratings.form! - b.p.ratings.overall) - (a.p.ratings.form! - a.p.ratings.overall)).slice(0, 18);
    if (focus === "bargain") return all.filter((x) => x.p.price2026 && x.p.price2026 > 0).sort((a, b) => b.fv / b.p.price2026! - a.fv / a.p.price2026!).slice(0, 18);
    return all.filter((x) => !x.p.team2026).sort((a, b) => b.p.ratings.overall - a.p.ratings.overall).slice(0, 18);
  }, [list, focus]);
  const add = async (pid: string) => { await api("POST", "/api/watchlist", { pid, note: notes[pid] || "" }); qc.invalidateQueries({ queryKey: ["/api/watchlist"] }); };
  const del = async (pid: string) => { await api("DELETE", `/api/watchlist/${pid}`); qc.invalidateQueries({ queryKey: ["/api/watchlist"] }); };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Scouting Centre" title="Find tomorrow's stars" sub="Scout reports combine real IPL output with calculated potential. Watchlisted players are highlighted for you in every auction room." />
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
        <Panel title={<span className="flex items-center gap-2"><Telescope className="h-4 w-4" />Scout reports</span>} kind="calculated" right={<Select value={focus} onValueChange={setFocus}><SelectTrigger className="h-8 w-52" data-testid="select-focus"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="young">Young talent (≤24)</SelectItem><SelectItem value="uncapped">Uncapped gems</SelectItem><SelectItem value="form">Rising form</SelectItem><SelectItem value="bargain">2026 bargains</SelectItem><SelectItem value="free">Unsigned for 2026</SelectItem></SelectContent></Select>}>
          <div className="grid md:grid-cols-2 gap-2">{scouted.map(({ p, pot, age, fv }) => (
            <div key={p.id} className="rounded-xl bg-white/[0.03] p-2 flex gap-2" data-testid={`scout-${p.id}`}>
              <PlayerAvatar p={p} size={52} team={p.team2026} />
              <div className="min-w-0 flex-1">
                <Link href={`/players/${p.id}`} className="text-sm font-semibold truncate block hover:text-cyan-200">{p.name}</Link>
                <div className="flex items-center gap-1.5"><RoleChip p={p} /><span className="text-[11px] text-muted-foreground">{age != null ? `${age} yrs` : "age n/a"} · {p.matches} m</span></div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rating {p.ratings.overall.toFixed(0)} → potential <b className="text-emerald-300">{pot}</b> · form {num(p.ratings.form, 0)} · fair {fmtCr(fv)}{p.price2026 ? ` · paid ${fmtCr(p.price2026)}` : ""}</div>
              </div>
              <Button size="sm" variant={ids.has(p.id) ? "secondary" : "outline"} className="h-7 self-center" onClick={() => (ids.has(p.id) ? del(p.id) : add(p.id))} data-testid={`watch-${p.id}`}><Eye className="h-3.5 w-3.5" /></Button>
            </div>
          ))}</div>
          <Explain>Potential = current rating + youth factor (2.2 per year under 27) + 40% of the gap between recent form and overall rating. It is an estimate, not a forecast of real development.</Explain>
        </Panel>
        <Panel title={`Watchlist (${wl.data?.length || 0})`}>
          {(wl.data || []).length === 0 ? <div className="text-sm text-muted-foreground">Add players with the eye button. Ten watchlisted players unlocks the Scout achievement.</div> : (wl.data || []).map((w) => { const p = look(w.pid); return p && (
            <div key={w.pid} className="flex items-center gap-2 py-1.5 border-t border-white/5 first:border-0">
              <PlayerAvatar p={p} size={32} rounded="rounded-md" />
              <div className="min-w-0 flex-1"><div className="text-sm truncate">{p.name}</div><Input className="h-7 text-xs mt-0.5" placeholder="Scouting note…" defaultValue={w.note} onBlur={(e) => { setNotes({ ...notes, [w.pid]: e.target.value }); api("POST", "/api/watchlist", { pid: w.pid, note: e.target.value }); }} /></div>
              <button onClick={() => del(w.pid)} aria-label="Remove"><Trash2 className="h-4 w-4 text-rose-300" /></button>
            </div>
          ); })}
          <div className="mt-2"><Kind k="historical" /></div>
        </Panel>
      </div>
    </div>
  );
}
