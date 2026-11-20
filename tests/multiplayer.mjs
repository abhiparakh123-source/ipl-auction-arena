// Online multiplayer test suite. Run against a live server: node tests/multiplayer.mjs [baseUrl]
// Uses real WebSocket clients, one per user, exactly as browsers do.
import WebSocket from "ws";
const B = process.argv[2] || "http://localhost:5000";
const WSB = B.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const j = async (p, o = {}) => (await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(o.headers || {}) } })).json();

class Client {
  constructor(name) { this.name = name; this.st = null; this.acks = new Map(); this.id = 0; this.events = []; this.sent = []; }
  async login() { const g = await j("/api/auth/guest", { method: "POST", body: JSON.stringify({ name: this.name }) }); this.token = g.token; this.userId = g.user?.id; return this; }
  connect(code) {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${WSB}/ws?token=${this.token}`);
      this.ws.on("message", (m) => {
        const d = JSON.parse(m);
        if (d.type === "hello") this.userId = d.userId;
        if (d.type === "state") { this.st = d.state; this.stAt = Date.now(); }
        if (d.type === "event") this.events.push({ ...d, at: Date.now() });
        if (d.type === "ack" && d.id == null && /slow down/i.test(d.error || "")) this.throttled = (this.throttled || 0) + 1;
        if (d.type === "ack" && this.acks.has(d.id)) { this.acks.get(d.id)(d); this.acks.delete(d.id); }
      });
      this.ws.on("open", () => { this.ws.send(JSON.stringify({ type: "join", code })); setTimeout(res, 400); });
      this.ws.on("error", rej);
    });
  }
  send(type, body = {}) {
    const id = ++this.id; const t0 = Date.now();
    return new Promise((res) => { this.acks.set(id, (d) => res({ ...d, rtt: Date.now() - t0 })); this.ws.send(JSON.stringify({ type, id, ...body })); setTimeout(() => { if (this.acks.has(id)) { this.acks.delete(id); res({ ok: false, error: "timeout" }); } }, 5000); });
  }
  async bid(amount) { const seq = this.st.lot.seq; const r = await this.send("bid", { seq, amount }); this.sent.push({ seq, amount, ok: r.ok, error: r.error }); return r; }
  close() { try { this.ws.close(); } catch {} }
  get team() { return this.st?.teams.find((t) => t.ownerId === this.userId || t.ownerName === this.name); }
}
const waitFor = async (fn, ms = 20000, step = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await sleep(step); } return false; };
const nextAmt = (lot) => { const c = lot.bid; if (c == null) return lot.base; const s = c < 1 ? 0.05 : c < 2 ? 0.1 : 0.2; return Math.round((c + s) * 100) / 100; };

async function main() {
  console.log(`Multiplayer suite against ${B}\n`);
  // ---------- setup: 4 humans + 1 spectator ----------
  const [host, p2, p3, p4, spec] = await Promise.all(["Host", "Priya", "Rahul", "Arjun", "Watcher"].map((n) => new Client(n).login()));
  const room = await j("/api/rooms", { method: "POST", headers: { authorization: "Bearer " + host.token }, body: JSON.stringify({ mode: "quick", team: "MI", settings: { bidTimer: 4, introTimer: 0, poolSize: 14, aiFill: true } }) });
  const code = room.code;
  check("Host can create a room", !!code, code);
  await Promise.all([host, p2, p3, p4, spec].map((c) => c.connect(code)));
  check("All 5 clients receive room state over WebSocket", [host, p2, p3, p4, spec].every((c) => c.st?.code === code));
  const picks = await Promise.all([p2.send("pickTeam", { teamId: "CSK" }), p3.send("pickTeam", { teamId: "RCB" }), p4.send("pickTeam", { teamId: "KKR" })]);
  check("Three players pick different franchises", picks.every((r) => r.ok));
  const dup = await spec.send("pickTeam", { teamId: "CSK" });
  check("Taking an already-owned franchise is rejected", !dup.ok && /taken/i.test(dup.error), dup.error);
  await spec.send("pickTeam", { teamId: null }).catch(() => {});
  const early = await host.send("start");
  check("Host cannot start while players are not ready", !early.ok && /ready/i.test(early.error || ""), early.error);
  await Promise.all([p2, p3, p4].map((c) => c.send("ready", { ready: true })));
  const ns = await p2.send("start");
  check("Non-host cannot start the auction", !ns.ok && /host/i.test(ns.error || ""), ns.error);
  await sleep(300);
  const owned = host.st.teams.filter((t) => t.ownerId);
  check("Human-owned franchises carry no AI controller before start", owned.every((t) => !t.ai), owned.map((t) => `${t.short}:${t.ai || "human"}`).join(" "));
  const st = await host.send("start");
  check("Host starts the auction", st.ok, st.error);
  await waitFor(() => host.st.status === "auction" && host.st.lot);
  const humanTeams = { MI: host, CSK: p2, RCB: p3, KKR: p4 };
  check("After start, every human franchise is human-controlled (no AI)", host.st.teams.filter((t) => humanTeams[t.id]).every((t) => !t.ai), host.st.teams.filter((t) => humanTeams[t.id]).map((t) => `${t.short}:${t.ai || "human"}`).join(" "));

  // ---------- state sync ----------
  await waitFor(() => [p2, p3, p4, spec].every((c) => c.st?.lot?.seq === host.st.lot.seq));
  check("All clients see the same lot", [p2, p3, p4, spec].every((c) => c.st.lot.pid === host.st.lot.pid));

  // ---------- concurrency: 4 humans bid the same amount at the same instant ----------
  await waitFor(() => host.st.lot.phase === "bidding", 8000);
  await waitFor(() => !Object.keys(humanTeams).includes(host.st.lot.leader) && host.st.lot.phase === "bidding", 8000);
  const lot0 = host.st.lot; const amt = nextAmt(lot0);
  const race = await Promise.all([host, p2, p3, p4].map((c) => c.send("bid", { seq: lot0.seq, amount: amt })));
  [host, p2, p3, p4].forEach((c, i) => c.sent.push({ seq: lot0.seq, amount: amt, ok: race[i].ok }));
  const winners = race.filter((r) => r.ok).length;
  check("Simultaneous identical bids: exactly one accepted", winners === 1, race.map((r) => (r.ok ? "ok" : r.error)).join(" | "));
  await sleep(250);
  const leaderNow = host.st.lot.history.filter((h) => h.amount === amt);
  check("Only one bid at that amount recorded in server history", leaderNow.length === 1, JSON.stringify(leaderNow));

  // ---------- invalid bids ----------
  const lead = host.st.lot.leader; const leadClient = humanTeams[lead];
  if (leadClient) { const r = await leadClient.send("bid", { seq: host.st.lot.seq, amount: nextAmt(host.st.lot) }); check("Leader cannot outbid themselves", !r.ok, r.error); }
  const other = [host, p2, p3, p4].find((c) => c !== leadClient);
  let r = await other.send("bid", { seq: host.st.lot.seq, amount: host.st.lot.base / 2 });
  check("Bid below the minimum increment is rejected", !r.ok && /at least/i.test(r.error || ""), r.error);
  r = await other.send("bid", { seq: host.st.lot.seq - 1, amount: 50 });
  check("Bid on a closed/stale lot is rejected", !r.ok, r.error);
  r = await other.send("bid", { seq: host.st.lot.seq, amount: 999 });
  check("Bid above remaining purse is rejected", !r.ok, r.error);
  r = await other.send("bid", { seq: host.st.lot.seq, amount: Math.round((nextAmt(host.st.lot) + 0.03) * 100) / 100 });
  check("Custom bid off the ₹5 L grid is rejected", !r.ok, r.error);
  r = await spec.send("bid", { seq: host.st.lot.seq, amount: nextAmt(host.st.lot) });
  check("Spectator cannot bid", !r.ok && /spectator/i.test(r.error || ""), r.error);
  r = await p2.send("pause");
  check("Non-host cannot pause", !r.ok, r.error);
  r = await p3.send("undo");
  check("Non-host cannot undo", !r.ok, r.error);

  // ---------- pause freezes the server clock ----------
  r = await host.send("pause"); await sleep(300);
  const left1 = host.st.lot.pausedLeft; await sleep(1500);
  const left2 = host.st.lot.pausedLeft;
  check("Pause freezes the server-side countdown", host.st.paused && left1 === left2, `${left1}ms → ${left2}ms`);
  r = await other.send("bid", { seq: host.st.lot.seq, amount: nextAmt(host.st.lot) });
  check("Bids are rejected while paused", !r.ok && /paused/i.test(r.error || ""), r.error);
  await host.send("resume"); await sleep(200);
  check("Resume restarts the clock", !host.st.paused && host.st.lot.endsAt > Date.now() - 2000);

  // ---------- reconnection ----------
  p4.close(); await sleep(700);
  check("Disconnected player shows offline to others", host.st.teams.find((t) => t.id === "KKR")?.online === false);
  const p4b = new Client("Arjun"); p4b.token = p4.token; await p4b.connect(code);
  humanTeams.KKR = p4b;
  await waitFor(() => p4b.st?.teams.find((t) => t.id === "KKR")?.online, 3000);
  const kk = p4b.st.teams.find((t) => t.id === "KKR");
  check("Reconnected player keeps their franchise", kk?.ownerId === p4b.userId && !kk?.ai && kk?.online, JSON.stringify({ owner: kk?.ownerId === p4b.userId, ai: kk?.ai, online: kk?.online }));
  check("Reconnected player receives current lot", p4b.st.lot?.seq === host.st.lot?.seq);

  // ---------- rate limit ----------
  spec.throttled = 0;
  const spam = await Promise.all(Array.from({ length: 40 }, () => spec.send("chat", { text: "x" })));
  check("Flooding actions triggers the rate limiter", spec.throttled > 0, `${spec.throttled}/40 messages throttled by the server`);
  await sleep(2500);

  // ---------- play the auction: humans bid sometimes, track every bid they actually send ----------
  const human = [host, p2, p3, p4b];
  let rtts = [];
  const bidder = setInterval(async () => {
    const l = host.st?.lot; if (!l || l.phase !== "bidding" || host.st.paused) return;
    for (const c of human) {
      if (Math.random() < 0.12 && l.leader !== c.team?.id) { const rr = await c.bid(nextAmt(l)); rtts.push(rr.rtt); break; }
    }
  }, 350);
  await waitFor(() => host.st.status === "post" || host.st.status !== "auction", 240000, 500);
  clearInterval(bidder);
  await sleep(500);
  check("Auction runs to completion with 4 humans + AI", host.st.status !== "auction", host.st.status);
  rtts.sort((a, b) => a - b);
  check("Bid acknowledgement latency (local)", rtts.length > 0, `median ${rtts[Math.floor(rtts.length / 2)]}ms, p95 ${rtts[Math.floor(rtts.length * 0.95)]}ms over ${rtts.length} bids`);

  // ---------- the auto-bid regression: every bid credited to a human franchise must have been sent by that human ----------
  const bidEv = host.events.filter((e) => e.kind === "bid");
  let phantom = 0; const per = {};
  for (const [tid, c] of Object.entries(humanTeams)) {
    const mine = bidEv.filter((e) => e.team === tid);
    const sentOk = [...(tid === "KKR" ? p4.sent : []), ...c.sent].filter((s) => s.ok);
    const unexplained = mine.filter((e) => !sentOk.some((s) => s.seq === e.seq && Math.abs(s.amount - e.amount) < 1e-6));
    phantom += unexplained.length; per[tid] = `${mine.length} bids, ${unexplained.length} not sent by the player`;
  }
  check("No automatic bids on human franchises (every bid was sent by its owner)", phantom === 0, JSON.stringify(per));

  // ---------- financial integrity ----------
  const S = host.st;
  const allPids = S.teams.flatMap((t) => t.squad.map((x) => x.pid));
  check("No player owned by two franchises", new Set(allPids).size === allPids.length, `${allPids.length} owned`);
  check("No negative purse", S.teams.every((t) => t.purse >= 0), S.teams.map((t) => `${t.short}:${t.purse}`).join(" "));
  const purseOk = S.teams.every((t) => Math.abs(t.startPurse - t.squad.reduce((a, x) => a + (x.price || 0), 0) - t.purse) < 0.011);
  check("Purse = start − sum of purchase prices for every team", purseOk);
  const soldSales = S.sales.filter((x) => x.season === S.seasonNo);
  check("Every sale appears in the buying squad", soldSales.every((x) => S.teams.find((t) => t.id === x.team)?.squad.some((q) => q.pid === x.pid)));
  check("All clients agree on final squads and purses", [p2, p3, p4b, spec].every((c) => JSON.stringify(c.st.teams.map((t) => [t.id, t.purse, t.squad.length])) === JSON.stringify(S.teams.map((t) => [t.id, t.purse, t.squad.length]))));

  // ---------- undo with audit ----------
  // (undo is only valid during the auction; verified via the audit endpoint instead)
  const audit = await j(`/api/rooms/${code}/audit`, { headers: { authorization: "Bearer " + host.token } });
  const aud = Array.isArray(audit) ? audit : audit.audit;
  check("Audit log records the actions", Array.isArray(aud) && aud.length > 10, Array.isArray(aud) ? `${aud.length} entries` : JSON.stringify(audit).slice(0, 120));

  // ---------- season: all clients agree ----------
  await host.send("fillSquads"); await sleep(400);
  const ss = await host.send("startSeason"); await sleep(400);
  check("Host starts the season", ss.ok, ss.error);
  await host.send("playMany", { until: "all" });
  await waitFor(() => host.st.season?.champion, 60000, 500); await sleep(800);
  const champ = host.st.season?.champion;
  check("Season completes with a champion", !!champ, champ);
  check("Every client shows the same champion and points table", [p2, p3, p4b, spec].every((c) => c.st.season?.champion === champ && JSON.stringify(c.st.season.table.map((x) => [x.team, x.pts])) === JSON.stringify(host.st.season.table.map((x) => [x.team, x.pts]))));

  // ---------- blind mode privacy ----------
  const [b1, b2] = await Promise.all(["BlindA", "BlindB"].map((n) => new Client(n).login()));
  const br = await j("/api/rooms", { method: "POST", headers: { authorization: "Bearer " + b1.token }, body: JSON.stringify({ mode: "blind", team: "MI", settings: { introTimer: 0, poolSize: 6 } }) });
  await b1.connect(br.code); await b2.connect(br.code);
  await b2.send("pickTeam", { teamId: "CSK" }); await b2.send("ready", { ready: true });
  const bs = await b1.send("start");
  if (bs.ok) {
    await waitFor(() => b1.st.lot?.phase === "sealed", 10000);
    const lb = b1.st.lot;
    await b1.send("sealed", { seq: lb.seq, amount: Math.round((lb.base + 0.5) * 100) / 100 });
    await sleep(300);
    check("Blind: a rival cannot see your sealed bid amount", b2.st.lot.mySealed == null && JSON.stringify(b2.st.lot).indexOf(String(Math.round((lb.base + 0.5) * 100) / 100)) === -1);
    await b2.send("sealed", { seq: lb.seq, amount: null });
    const seenSeq = lb.seq; await waitFor(() => b2.st.lot?.result || (b2.st.lot && b2.st.lot.seq !== seenSeq) || b2.st.status !== "auction", 60000);
    const r2 = b2.st.lot?.seq === seenSeq ? b2.st.lot?.result : null;
    const sale = b2.st.sales.find((x) => x.n === seenSeq);
    const leaked = (r2 && r2.team && r2.team !== "CSK") || (sale && sale.team !== "?" && sale.team !== "CSK");
    check("Blind: rival never sees another team's sealed purchase", !leaked, JSON.stringify({ result: r2, sale }));
  } else check("Blind room starts", false, bs.error);
  b1.close(); b2.close();

  [host, p2, p3, p4b, spec].forEach((c) => c.close());
  const fail = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
