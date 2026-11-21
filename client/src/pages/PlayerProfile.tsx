import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { num, photoUrl } from "@/lib/data";
import { Panel, PlayerAvatar, RoleChip, Kind, Emblem, Stat, Explain } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fmtCr, ageOn } from "@shared/game";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Line, ComposedChart, Legend } from "recharts";
import { ArrowLeft, Pencil, Eye, Undo2, ImagePlus } from "lucide-react";

const sr = (r: number, b: number) => (b ? ((r / b) * 100).toFixed(1) : "—");
const av = (r: number, o: number) => (o ? (r / o).toFixed(1) : r ? `${r}*` : "—");
const ec = (r: number, b: number) => (b ? ((r / b) * 6).toFixed(2) : "—");
const TT = { contentStyle: { background: "#0b1226", border: "1px solid #1e293b", fontSize: 12 } };

function EditDialog({ d, open, onClose }: { d: any; open: boolean; onClose: () => void }) {
  const s = d.summary;
  const [f, setF] = useState<any>({ name: s.name, fullName: s.fullName, country: s.country, role: s.role, batting: s.batting || "", bowling: s.bowling || "", bowlType: s.bowlType || "none", dob: s.dob || "", basePrice: String(s.basePrice), capped: s.capped, overseas: s.overseas, customPhoto: d.edits?.data?.customPhoto || "" });
  const qc = useQueryClient();
  const { toast } = useToast();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    try {
      await api("PATCH", `/api/players/${s.id}`, { ...f, bowlType: f.bowlType === "none" ? null : f.bowlType, dob: f.dob || undefined, basePrice: Number(f.basePrice) });
      qc.invalidateQueries({ queryKey: ["/api/players"] }); qc.invalidateQueries({ queryKey: ["player", s.id] }); toast({ title: "Profile updated (logged in audit)" }); onClose();
    } catch (e: any) { toast({ title: "Edit rejected", description: e.message, variant: "destructive" }); }
  };
  const upload = (file?: File) => {
    if (!file) return;
    if (file.size > 300_000) return toast({ title: "Image too large", description: "Use an image under 300 KB", variant: "destructive" });
    const r = new FileReader(); r.onload = () => setF({ ...f, customPhoto: r.result as string }); r.readAsDataURL(file);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl glass-strong max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit {s.name}</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground">You can correct profile fields and set a photo. Historical statistics are computed from Cricsheet data and can't be edited. Every edit is audited and can be reverted.</div>
        <div className="grid grid-cols-2 gap-2">
          {[["name", "Display name"], ["fullName", "Full name"], ["country", "Country"], ["batting", "Batting style"], ["bowling", "Bowling style"], ["dob", "DOB (YYYY-MM-DD)"], ["basePrice", "Base price (₹ cr)"]].map(([k, l]) => <label key={k} className="text-xs">{l}<Input value={f[k]} onChange={set(k)} className="h-9 mt-1" data-testid={`edit-${k}`} /></label>)}
          <label className="text-xs">Role<Select value={f.role} onValueChange={set("role")}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent>{["Batter", "Wicket-keeper", "All-rounder", "Bowler"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></label>
          <label className="text-xs">Bowling type<Select value={f.bowlType} onValueChange={set("bowlType")}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="Pace">Pace</SelectItem><SelectItem value="Spin">Spin</SelectItem></SelectContent></Select></label>
          <label className="text-xs flex items-center gap-2 mt-5"><input type="checkbox" checked={f.capped} onChange={(e) => setF({ ...f, capped: e.target.checked })} />Capped</label>
          <label className="text-xs flex items-center gap-2 mt-5"><input type="checkbox" checked={f.overseas} onChange={(e) => setF({ ...f, overseas: e.target.checked })} />Overseas</label>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-sm font-semibold flex items-center gap-2"><ImagePlus className="h-4 w-4" />Photo manager</div>
          <div className="text-[11px] text-muted-foreground mb-2">Paste an https image URL you have the right to use (for example an official jersey headshot your league licenses), or upload a JPG/PNG/WebP under 300 KB. Leave empty to use the bundled Wikimedia Commons photo or the jersey avatar.</div>
          <div className="flex gap-2 items-center"><Input placeholder="https://…" value={f.customPhoto.startsWith("data:") ? "(uploaded image)" : f.customPhoto} onChange={set("customPhoto")} className="h-9" data-testid="input-photo-url" /><Input type="file" accept="image/png,image/jpeg,image/webp" className="h-9 w-48" onChange={(e) => upload(e.target.files?.[0])} data-testid="input-photo-file" /></div>
          {f.customPhoto && <div className="flex items-center gap-2 mt-2"><img src={f.customPhoto} alt="preview" className="h-16 w-16 rounded-lg object-cover" /><Button size="sm" variant="ghost" onClick={() => setF({ ...f, customPhoto: "" })}>Remove custom photo</Button></div>}
        </div>
        <Button onClick={save} data-testid="button-save-player">Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function PlayerProfile({ id }: { id: string }) {
  const q = useQuery<any>({ queryKey: ["player", id], queryFn: () => api("GET", `/api/players/${id}`) });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [edit, setEdit] = useState(false);
  if (q.isLoading) return <div className="text-muted-foreground">Loading player…</div>;
  if (!q.data) return <div>Player not found. <Link href="/players" className="underline">Back to players</Link></div>;
  const d = q.data, s = d.summary, ipl = d.ipl || {}, bat = ipl.bat || {}, bowl = ipl.bowl || {};
  const age = ageOn(s.dob);
  const seasons = Object.entries<any>(ipl.seasons || {}).map(([y, v]) => ({ y, runs: v.bat?.runs || 0, wkts: v.bowl?.wkts || 0, sr: v.bat?.balls ? +((v.bat.runs / v.bat.balls) * 100).toFixed(1) : null, m: v.m, econ: v.bowl?.balls ? +((v.bowl.runs / v.bowl.balls) * 6).toFixed(2) : null }));
  const phases = ["pp", "mid", "death"].map((k) => ({ k: k === "pp" ? "Powerplay (1-6)" : k === "mid" ? "Middle (7-15)" : "Death (16-20)", b: d.phaseBat?.[k], w: d.phaseBowl?.[k] }));
  const recent = (d.recentScores || []).map(([date, r, b, out]: any) => ({ date: date.slice(5), r, sr: b ? +((r / b) * 100).toFixed(0) : 0, out }));
  const watch = async () => { await api("POST", "/api/watchlist", { pid: id, note: "" }); qc.invalidateQueries({ queryKey: ["/api/watchlist"] }); toast({ title: `${s.name} added to your scouting watchlist` }); };
  const hasBat = (bat.balls || 0) > 0, hasBowl = (bowl.balls || 0) > 0;
  return (
    <div className="space-y-4">
      <Link href="/players" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-white"><ArrowLeft className="h-4 w-4" />Player Universe</Link>
      <div className="glass-strong holo rounded-3xl p-5 md:p-6 grid md:grid-cols-[auto_1fr_auto] gap-6 items-center">
        <div>
          <PlayerAvatar p={s} size={168} team={s.team2026} credit className="shadow-2xl" />
          {d.photo?.page && !d.edits?.data?.customPhoto && <a href={d.photo.page} target="_blank" rel="noreferrer" className="block text-[10px] text-muted-foreground mt-1 max-w-[168px] truncate hover:underline" data-testid="link-photo-credit">Photo: {d.photo.artist || "Wikimedia Commons"} · {d.photo.license}</a>}
          {d.edits?.data?.customPhoto && <div className="text-[10px] text-muted-foreground mt-1">Custom photo set by {d.edits.by}</div>}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">{s.status}</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold" data-testid="text-player-name">{s.name}</h1>
          {s.fullName !== s.name && <div className="text-sm text-muted-foreground">{s.fullName}</div>}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm"><RoleChip p={s} /><span>{s.country}</span><span className="text-muted-foreground">·</span><span>{s.capped ? "Capped" : "Uncapped"}</span>{s.overseas && <span className="text-violet-300">Overseas</span>}{s.legend && <span className="text-amber-300">Legend</span>}</div>
          <div className="text-sm text-slate-300 mt-2">{s.batting || "Batting style n/a"} · {s.bowling || "Does not bowl"}{s.dob && <> · Born {s.dob}{age != null ? ` (age ${age})` : ""}</>}{!s.dob && <span className="text-muted-foreground"> · DOB not verified</span>}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">{Object.entries<number[]>(ipl.teams || {}).map(([t, ys]) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs"><Emblem id={t} size={14} />{t} {ys[0]}{ys.length > 1 ? `–${ys[ys.length - 1]}` : ""}</span>)}</div>
        </div>
        <div className="flex md:flex-col gap-2">
          <div className="text-center rounded-2xl bg-white/[0.04] px-4 py-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rating</div><div className="font-display text-4xl text-cyan-200 tnum">{s.ratings.overall.toFixed(0)}</div><Kind k="calculated" /></div>
          <Button variant="outline" size="sm" onClick={watch} data-testid="button-watch"><Eye className="h-4 w-4 mr-1" />Watchlist</Button>
          <Button variant="outline" size="sm" onClick={() => setEdit(true)} data-testid="button-edit"><Pencil className="h-4 w-4 mr-1" />Edit</Button>
          {d.edits && <Button variant="ghost" size="sm" onClick={async () => { await api("DELETE", `/api/players/${id}/edits`); qc.invalidateQueries(); toast({ title: "Edits reverted" }); }}><Undo2 className="h-4 w-4 mr-1" />Revert edits</Button>}
        </div>
      </div>
      {d.intl && <Panel title="International record (men's T20I / ODI / Test)" kind="historical">
        <div className="overflow-x-auto"><table className="w-full text-sm tnum" data-testid="table-intl">
          <thead><tr className="text-[11px] text-muted-foreground text-left"><th className="py-1 pr-3">Format</th><th>Span</th><th>M</th><th>Runs</th><th>HS</th><th>Avg</th><th>SR</th><th>100/50</th><th>Wkts</th><th>Best</th><th>Econ</th><th>5w</th><th>Ct</th><th className="text-right">Rating</th></tr></thead>
          <tbody>{(["t20i", "odi", "test"] as const).filter((k) => d.intl[k]).map((k) => { const f = d.intl[k]; return (
            <tr key={k} className="border-t border-white/5"><td className="py-1.5 pr-3 font-medium">{k === "t20i" ? "T20I" : k === "odi" ? "ODI" : "Test"}</td><td>{f.first}–{f.last}</td><td>{f.m}</td><td>{f.runs}</td><td>{f.hs}</td><td>{av(f.runs, f.outs)}</td><td>{sr(f.runs, f.balls)}</td><td>{f.c100}/{f.c50}</td><td>{f.wk}</td><td>{f.wb ? `${f.best[0]}/${f.best[1]}` : "–"}</td><td>{ec(f.wr, f.wb)}</td><td>{f.w5}</td><td>{f.ct}</td><td className="text-right text-cyan-200">{Math.round(f.ratings.overall)}</td></tr>
          ); })}</tbody>
        </table></div>
        <div className="text-[11px] text-muted-foreground mt-2">Computed from Cricsheet ball-by-ball archives (full-member matches only; coverage begins around 2001-2005, so earlier career matches are missing and totals may be lower than official records). Ratings are calculated by this game.</div>
      </Panel>}
      {!s.intlOnly && d.intl && <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground -mb-2">IPL career 2008-2026</div>}
      {!s.intlOnly && <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat label="Matches" value={ipl.matches || 0} /><Stat label="Runs" value={bat.runs || 0} sub={`HS ${bat.hs || 0}${bat.hsno ? "*" : ""}`} /><Stat label="Average" value={av(bat.runs || 0, bat.outs || 0)} /><Stat label="Strike rate" value={sr(bat.runs || 0, bat.balls || 0)} />
        <Stat label="50s / 100s" value={`${bat.c50 || 0} / ${bat.c100 || 0}`} /><Stat label="Wickets" value={bowl.wkts || 0} sub={bowl.best ? `Best ${bowl.best[0]}/${bowl.best[1]}` : ""} /><Stat label="Economy" value={ec(bowl.runs || 0, bowl.balls || 0)} /><Stat label="Catches" value={ipl.catches || 0} sub={ipl.stumpings ? `${ipl.stumpings} st` : ""} />
      </div>}
      {s.intlOnly && <div className="text-xs text-muted-foreground glass rounded-xl px-3 py-2">This player has no IPL record in the Cricsheet IPL archive, so only international statistics are shown. They appear in T20I, ODI and Test modes.</div>}
      <div className={`grid xl:grid-cols-2 gap-4 ${s.intlOnly ? "hidden" : ""}`}>
        <Panel title="Season-by-season" kind="historical">
          <div className="h-64"><ResponsiveContainer><ComposedChart data={seasons}><XAxis dataKey="y" stroke="#64748b" fontSize={11} /><YAxis yAxisId="l" stroke="#64748b" fontSize={11} /><YAxis yAxisId="r" orientation="right" stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Legend />{hasBat && <Bar yAxisId="l" dataKey="runs" name="Runs" fill="#22E4FF" />}{hasBowl && <Line yAxisId="r" dataKey="wkts" name="Wickets" stroke="#F5C542" strokeWidth={2} />}{hasBat && <Line yAxisId="r" dataKey="sr" name="SR" stroke="#B983FF" dot={false} />}</ComposedChart></ResponsiveContainer></div>
          <div className="overflow-x-auto max-h-56 scrollbar-thin mt-2"><table className="w-full text-xs"><thead className="text-muted-foreground text-left"><tr><th>Season</th><th className="text-right">M</th><th className="text-right">Runs</th><th className="text-right">SR</th><th className="text-right">Wkts</th><th className="text-right">Econ</th></tr></thead><tbody>{[...seasons].reverse().map((r) => <tr key={r.y} className="border-t border-white/5"><td className="py-0.5">{r.y}</td><td className="text-right tnum">{r.m}</td><td className="text-right tnum">{r.runs}</td><td className="text-right tnum">{r.sr ?? "—"}</td><td className="text-right tnum">{r.wkts}</td><td className="text-right tnum">{r.econ ?? "—"}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel title="Phase splits" kind="historical">
          <table className="w-full text-sm"><thead className="text-[11px] text-muted-foreground text-left"><tr><th>Phase</th><th className="text-right">Runs</th><th className="text-right">SR</th><th className="text-right">Dot %</th><th className="text-right">Wkts</th><th className="text-right">Econ</th><th className="text-right">Bowl dot %</th></tr></thead>
            <tbody>{phases.map((p) => <tr key={p.k} className="border-t border-white/5"><td className="py-1.5">{p.k}</td><td className="text-right tnum">{p.b?.runs ?? "—"}</td><td className="text-right tnum">{p.b ? sr(p.b.runs, p.b.balls) : "—"}</td><td className="text-right tnum">{p.b?.balls ? ((p.b.dots / p.b.balls) * 100).toFixed(0) : "—"}</td><td className="text-right tnum">{p.w?.wkts ?? "—"}</td><td className="text-right tnum">{p.w ? ec(p.w.runs, p.w.balls) : "—"}</td><td className="text-right tnum">{p.w?.balls ? ((p.w.dots / p.w.balls) * 100).toFixed(0) : "—"}</td></tr>)}</tbody></table>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] uppercase text-muted-foreground mb-1">Home / away (bat)</div><div>Home: {d.home?.runs ?? 0} runs, SR {sr(d.home?.runs || 0, d.home?.balls || 0)}, avg {av(d.home?.runs || 0, d.home?.outs || 0)}</div><div>Away: {d.away?.runs ?? 0} runs, SR {sr(d.away?.runs || 0, d.away?.balls || 0)}, avg {av(d.away?.runs || 0, d.away?.outs || 0)}</div></div>
            <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] uppercase text-muted-foreground mb-1">Chasing (pressure)</div><div>{d.chase?.runs ?? 0} runs in {d.chase?.inn ?? 0} inns</div><div>Avg {av(d.chase?.runs || 0, d.chase?.outs || 0)}, SR {sr(d.chase?.runs || 0, d.chase?.balls || 0)}</div></div>
            {d.vsPaceSpin && ["Pace", "Spin"].map((k) => d.vsPaceSpin[k] && <div key={k} className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] uppercase text-muted-foreground mb-1">Batting vs {k.toLowerCase()}</div><div>{d.vsPaceSpin[k].runs} runs off {d.vsPaceSpin[k].balls}</div><div>SR {sr(d.vsPaceSpin[k].runs, d.vsPaceSpin[k].balls)} · avg {av(d.vsPaceSpin[k].runs, d.vsPaceSpin[k].outs)}</div></div>)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">Consistency score {s.ratings.consistency ?? "—"} and form score {s.ratings.form != null ? num(s.ratings.form, 0) : "—"} are calculated metrics.</div>
        </Panel>
        {recent.length > 0 && <Panel title="Recent form · last innings" kind="historical"><div className="h-52"><ResponsiveContainer><BarChart data={recent}><XAxis dataKey="date" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Bar dataKey="r" name="Runs" fill="#22E4FF" /></BarChart></ResponsiveContainer></div></Panel>}
        <Panel title="Venues & opponents" kind="historical">
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {[["Top venues", d.venue], ["Against teams", d.vs]].map(([l, obj]: any) => (
              <div key={l}><div className="text-[11px] uppercase text-muted-foreground mb-1">{l}</div><table className="w-full"><tbody>{Object.entries<any>(obj || {}).sort((a, b) => b[1].m - a[1].m).slice(0, 8).map(([k, v]) => <tr key={k} className="border-t border-white/5"><td className="py-0.5 truncate max-w-[9rem]">{k}</td><td className="text-right tnum">{v.m}m</td><td className="text-right tnum">{v.runs}r</td><td className="text-right tnum">{v.balls ? sr(v.runs, v.balls) : "—"}</td><td className="text-right tnum">{v.wkts}w</td></tr>)}</tbody></table></div>
            ))}
          </div>
        </Panel>
        <Panel title="Auction history & value">
          {(d.auction || []).length ? (d.auction as any[]).map((a, i) => <div key={i} className="flex items-center gap-2 text-sm border-t border-white/5 py-1.5 first:border-0"><span className="tnum w-12">{a.year}</span>{a.team && <Emblem id={a.team} size={18} />}<span className="capitalize">{a.type}</span><span className="text-muted-foreground">{a.team || ""}{a.prevTeam ? ` (from ${a.prevTeam})` : ""}</span><span className="ml-auto tnum font-semibold">{a.priceCr != null ? fmtCr(a.priceCr) : "—"}</span>{a.baseCr != null && <span className="text-xs text-muted-foreground">base {fmtCr(a.baseCr)}</span>}</div>) : <div className="text-sm text-muted-foreground">No verified 2025/2026 auction record.</div>}
          <div className="grid grid-cols-3 gap-2 mt-3"><Stat label="Game base price" value={fmtCr(s.basePrice)} /><Stat label="Fair value" value={fmtCr(d.fairValue)} sub="calculated" /><Stat label="Potential" value={d.potential} sub="calculated" /></div>
          <Explain>Fair value maps the calculated rating to a ₹120 cr purse. Potential adds a youth factor (under 27) and recent-form trend. These are estimates, not predictions of real auction prices.</Explain>
          <div className="text-[10px] text-muted-foreground mt-2">Auction data: Wikipedia personnel change lists for 2025 and 2026. Stats: Cricsheet (ODC-BY). Identity: Wikidata / Cricsheet register{d.cricinfo ? ` · ESPNcricinfo ID ${d.cricinfo}` : ""}.</div>
        </Panel>
      </div>
      {edit && <EditDialog d={d} open={edit} onClose={() => setEdit(false)} />}
    </div>
  );
}
