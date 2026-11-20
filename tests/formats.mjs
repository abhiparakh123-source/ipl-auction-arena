// International formats test: auction + season in T20I / ODI / Test modes. node tests/formats.mjs [baseUrl]
import WebSocket from "ws";
const B = process.argv[2] || "http://localhost:5000";
const WSB = B.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const j = async (p, o = {}) => (await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(o.headers || {}) } })).json();
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await sleep(200); } return false; };

async function run(mode, team) {
  const g = await j("/api/auth/guest", { method: "POST", body: JSON.stringify({ name: "Fmt" + mode.slice(0, 6) }) });
  const room = await j("/api/rooms", { method: "POST", headers: { authorization: "Bearer " + g.token }, body: JSON.stringify({ mode, team, settings: { bidTimer: 3, introTimer: 0, poolSize: 30, aiFill: true } }) });
  check(`[${mode}] room created`, !!room.code, room.code || JSON.stringify(room).slice(0, 120));
  if (!room.code) return;
  let st = null; const acks = new Map(); let id = 0;
  const ws = new WebSocket(`${WSB}/ws?token=${g.token}`);
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.type === "state") st = d.state; if (d.type === "ack" && acks.has(d.id)) { acks.get(d.id)(d); acks.delete(d.id); } });
  await new Promise((r) => ws.on("open", () => { ws.send(JSON.stringify({ type: "join", code: room.code })); setTimeout(r, 500); }));
  const send = (type, body = {}) => new Promise((res) => { const i = ++id; acks.set(i, res); ws.send(JSON.stringify({ type, id: i, ...body })); setTimeout(() => acks.has(i) && (acks.delete(i), res({ ok: false, error: "timeout" })), 8000); });
  const s0 = st.settings;
  check(`[${mode}] server forces format/pool from mode`, s0.format === mode.split("_")[0] && !!s0.intlPool, `${s0.format}/${s0.intlPool} teams=${st.teams.length}`);
  check(`[${mode}] custom side names`, st.teams.every((t) => t.name && !/Super Kings|Indians$/.test(t.name)), st.teams.map((t) => t.name).join(", "));
  const r = await send("start"); check(`[${mode}] auction starts`, r.ok, r.error);
  await sleep(2500);
  const pool = st.lot ? st.lot : null;
  check(`[${mode}] first lot has format stats`, !!pool, pool?.pid);
  await send("endAuction"); await sleep(600);
  const f = await send("fillSquads"); await sleep(600);
  check(`[${mode}] fill squads`, f.ok, f.error);
  const teams = st.teams;
  check(`[${mode}] every side has 11+ players`, teams.every((t) => t.squad.length >= 11), teams.map((t) => t.squad.length).join("/"));
  const all = teams.flatMap((t) => t.squad.map((x) => x.pid));
  check(`[${mode}] no duplicate ownership`, new Set(all).size === all.length);
  check(`[${mode}] no negative purse`, teams.every((t) => t.purse >= 0));
  if (mode.includes("india")) {
    const ps = await j("/api/players"); const L = Array.isArray(ps) ? ps : ps.players; const by = Object.fromEntries(L.map((p) => [p.id, p]));
    check(`[${mode}] India-only pool`, all.every((p) => by[p]?.country === "India"), all.filter((p) => by[p]?.country !== "India").slice(0, 3).join(","));
  }
  const ss = await send("startSeason"); await sleep(500);
  check(`[${mode}] season starts`, ss.ok, ss.error);
  await send("playMany", { until: "all" });
  const done = await waitFor(() => st.season?.champion, 180000);
  const S = st.season;
  check(`[${mode}] season completes with champion`, done, S?.champion);
  if (S) {
    const played = S.fixtures.filter((x) => x.result);
    check(`[${mode}] all fixtures have results`, played.length === S.fixtures.length, `${played.length}/${S.fixtures.length} fmt=${S.matchFormat}`);
    const draws = played.filter((x) => !x.result.winner).length;
    console.log(`   table: ${S.table.map((x) => `${x.team} ${x.pts}`).join(" | ")}  draws=${draws}  sample: ${JSON.stringify(played[0].result.scores)} ${played[0].result.margin}`);
    if (mode.startsWith("test")) check(`[${mode}] Test points: 12 win / 4 draw`, S.table.every((x) => x.pts === x.w * 12 + x.nr * 4), S.table.map((x) => `${x.w}w${x.nr}d=${x.pts}`).join(" "));
    else check(`[${mode}] points: 2 per win`, S.table.every((x) => x.pts === x.w * 2 + x.nr), "");
  }
  const mid = S?.fixtures?.[0]?.n;
  if (mid) { const m = await j(`/api/rooms/${room.code}/match/${st.seasonNo || 1}/${mid}`); check(`[${mode}] match record + checks ok`, m && !m.message && m.checks?.ok === true, JSON.stringify(m.checks || {}).slice(0, 120)); }
  ws.close();
}
for (const [m, t] of [["t20i_world", "CSK"], ["odi_india_all", "MI"], ["test_india_now", "CSK"], ["odi_allstars", "RCB"], ["test_world", "KKR"]]) await run(m, t);
// exhibition
for (const f of ["t20i", "odi", "test"]) {
  const m = await j("/api/sim/match", { method: "POST", body: JSON.stringify({ a: { kind: "real2026", team: "CSK" }, b: { kind: "real2026", team: "MI" }, format: f, seed: 7 }) });
  check(`exhibition ${f}`, m.format === f && m.innings?.length >= 2, `${m.innings?.map((i) => `${i.runs}/${i.wkts}`).join(" & ")} ${m.margin || ""}`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
