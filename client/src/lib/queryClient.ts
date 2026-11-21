import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function readStorage(key: string): string | null {
  try { return typeof window !== "undefined" ? window.localStorage.getItem(key) : null; }
  catch { return null; }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch { /* Storage may be unavailable in private/restricted browser contexts. */ }
}
function createVisitorId() {
  const existing = readStorage("ipl-arena-visitor");
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStorage("ipl-arena-visitor", id);
  return id;
}

let TOKEN: string | null = readStorage("ipl-arena-token");
const VISITOR_ID = createVisitorId();
export const getVisitorId = () => VISITOR_ID;
export const setToken = (t: string | null) => {
  TOKEN = t;
  writeStorage("ipl-arena-token", t);
};
export const getToken = () => TOKEN;
const authHeaders = (): Record<string, string> => ({
  "x-visitor-id": VISITOR_ID,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
});

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch {}
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, { headers: authHeaders() });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: { retry: false },
  },
});

export async function api<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await apiRequest(method, url, data);
  return res.json();
}
