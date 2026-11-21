import { WebSocketServer, type WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import { userByToken, db, getUser } from "./db";
import { getRoom } from "./auction";

export function attachWS(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://x");
    if (!url.pathname.endsWith("/ws")) return; // let vite HMR etc handle others
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", "http://x");
    let user = userByToken(url.searchParams.get("token") || undefined);
    const visitor = (req.headers["x-visitor-id"] as string | undefined) || url.searchParams.get("visitor") || undefined;
    if (!user && visitor) {
      const v = db.prepare("SELECT user_id FROM visitors WHERE visitor=?").get(visitor) as { user_id: string } | undefined;
      if (v) user = getUser(v.user_id);
    }
    if (!user) { ws.send(JSON.stringify({ type: "error", error: "Not signed in" })); ws.close(4001, "auth"); return; }
    const userId = user.id;
    let room: ReturnType<typeof getRoom> | undefined;
    let bucket = 20, last = Date.now();
    const alive = { v: true };
    ws.on("pong", () => (alive.v = true));
    const ping = setInterval(() => { if (!alive.v) { ws.terminate(); return; } alive.v = false; try { ws.ping(); } catch {} }, 25000);
    ws.send(JSON.stringify({ type: "hello", userId }));
    ws.on("message", (raw) => {
      const now = Date.now();
      bucket = Math.min(20, bucket + ((now - last) / 1000) * 10); last = now;
      if (bucket < 1) { ws.send(JSON.stringify({ type: "ack", ok: false, error: "Slow down: too many actions" })); return; }
      bucket--;
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === "join") {
        const r = getRoom(String(msg.code || ""));
        if (!r) { ws.send(JSON.stringify({ type: "error", error: "Room not found", code: msg.code })); return; }
        if (room && room !== r) room.detach(userId, ws);
        room = r;
        r.attach(userId, ws);
        return;
      }
      if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong", t: msg.t, now })); return; }
      if (!room) { ws.send(JSON.stringify({ type: "ack", id: msg.id, ok: false, error: "Join a room first" })); return; }
      const res = room.handle(userId, msg);
      ws.send(JSON.stringify({ type: "ack", id: msg.id, action: msg.type, ...res }));
    });
    ws.on("close", () => { clearInterval(ping); room?.detach(userId, ws); });
  });
  return wss;
}
