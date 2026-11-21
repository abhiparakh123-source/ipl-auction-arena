import { useQuery } from "@tanstack/react-query";
import type { PlayerSummary, Franchise } from "@shared/game";
import { FRANCHISE_BY_ID } from "@shared/game";
import { useMemo } from "react";

export function usePlayers() {
  const q = useQuery<PlayerSummary[]>({ queryKey: ["/api/players"], staleTime: 60_000 });
  const byId = useMemo(() => Object.fromEntries((q.data || []).map((p) => [p.id, p])) as Record<string, PlayerSummary>, [q.data]);
  const look = useMemo(() => (id: string) => byId[id], [byId]);
  return { list: q.data || [], byId, look, loading: q.isLoading };
}
export function useMeta() {
  return useQuery<any>({ queryKey: ["/api/meta"], staleTime: Infinity }).data;
}

export function teamColor(id: string | null | undefined, room?: any): { primary: string; secondary: string; short: string; name: string } {
  if (!id) return { primary: "#334155", secondary: "#94a3b8", short: "—", name: "Unassigned" };
  const t = room?.teams?.find((x: any) => x.id === id);
  if (t) return { primary: t.primary, secondary: t.secondary, short: t.short, name: t.name };
  const f: Franchise | undefined = FRANCHISE_BY_ID[id.replace(/\d+$/, "")];
  return f ? { primary: f.primary, secondary: f.secondary, short: f.short, name: f.name } : { primary: "#475569", secondary: "#cbd5e1", short: id, name: id };
}

export const pct = (n: number | null | undefined, d = 0) => (n == null || isNaN(n) ? "—" : `${n.toFixed(d)}%`);
export const num = (n: number | null | undefined, d = 1) => (n == null || isNaN(n as number) ? "—" : Number(n).toFixed(d));
export const oversOf = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
export function photoUrl(p?: { photo: string | null } | null) {
  if (!p?.photo) return null;
  if (/^(https?:|data:)/.test(p.photo)) return p.photo;
  return "./" + p.photo.replace(/^\.?\//, "");
}
export function download(name: string, text: string, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function relTime(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
