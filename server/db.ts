import Database from "better-sqlite3";
import crypto from "node:crypto";

export const db = new Database(process.env.DB_PATH || "data.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass TEXT NOT NULL, salt TEXT NOT NULL,
  created INTEGER NOT NULL, avatar TEXT, bio TEXT, privacy TEXT DEFAULT 'friends', xp INTEGER DEFAULT 0, settings TEXT DEFAULT '{}', guest INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visitors (visitor TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS friends (user_id TEXT NOT NULL, friend_id TEXT NOT NULL, status TEXT NOT NULL, created INTEGER, PRIMARY KEY(user_id, friend_id));
CREATE TABLE IF NOT EXISTS invites (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT, to_id TEXT, room_code TEXT, created INTEGER, seen INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated INTEGER, host_id TEXT, mode TEXT, public INTEGER DEFAULT 0, status TEXT, name TEXT);
CREATE TABLE IF NOT EXISTS room_members (code TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(code, user_id));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, ts INTEGER, actor TEXT, action TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS achievements (user_id TEXT NOT NULL, key TEXT NOT NULL, ts INTEGER, room TEXT, PRIMARY KEY(user_id, key));
CREATE TABLE IF NOT EXISTS player_overrides (pid TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER, by TEXT);
CREATE TABLE IF NOT EXISTS custom_players (pid TEXT PRIMARY KEY, data TEXT NOT NULL, created INTEGER, by TEXT);
CREATE TABLE IF NOT EXISTS watchlist (user_id TEXT NOT NULL, pid TEXT NOT NULL, note TEXT, PRIMARY KEY(user_id, pid));
CREATE TABLE IF NOT EXISTS leagues (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, members TEXT NOT NULL, created INTEGER, code TEXT);
CREATE TABLE IF NOT EXISTS scenarios (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, code TEXT, data TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS careers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, pid TEXT, data TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS custom_tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, data TEXT, created INTEGER);
`);

export function uid(n = 10) {
  return crypto.randomBytes(16).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, n);
}
export function roomCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[crypto.randomInt(A.length)];
  return s;
}
export function hashPass(p: string, salt: string) {
  return crypto.scryptSync(p, salt, 32).toString("hex");
}
export function audit(code: string, actor: string, action: string, data: any) {
  db.prepare("INSERT INTO audit (code, ts, actor, action, data) VALUES (?,?,?,?,?)").run(code, Date.now(), actor, action, JSON.stringify(data ?? null));
}

export interface UserRow { id: string; username: string; avatar: string | null; bio: string | null; privacy: string; xp: number; settings: string; guest: number; created: number }
export function publicUser(u: UserRow | undefined) {
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: u.avatar, bio: u.bio, xp: u.xp, level: levelOf(u.xp), guest: !!u.guest, created: u.created };
}
export function levelOf(xp: number) {
  return Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
}
export function getUser(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}
export function userByToken(token: string | undefined): UserRow | undefined {
  if (!token) return undefined;
  const t = db.prepare("SELECT user_id FROM tokens WHERE token = ?").get(token) as { user_id: string } | undefined;
  return t ? getUser(t.user_id) : undefined;
}
export function issueToken(userId: string) {
  const token = uid(32);
  db.prepare("INSERT INTO tokens (token, user_id, created) VALUES (?,?,?)").run(token, userId, Date.now());
  return token;
}
export function addXp(userId: string, xp: number) {
  db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").run(xp, userId);
}

export const ACHIEVEMENTS: Record<string, { label: string; desc: string; xp: number }> = {
  first_purchase: { label: "First Player Purchased", desc: "Win your first lot in any auction.", xp: 50 },
  bidding_war: { label: "First Bidding War", desc: "Win a lot that 3+ franchises bid on.", xp: 75 },
  budget_master: { label: "Budget Master", desc: "Complete a minimum squad while keeping 10%+ of purse.", xp: 120 },
  smartest_auction: { label: "Smartest Auction", desc: "Earn an A or better post-auction grade.", xp: 150 },
  best_bowling: { label: "Best Bowling Attack", desc: "Finish an auction with the #1 bowling rating.", xp: 120 },
  best_batting: { label: "Best Batting Lineup", desc: "Finish an auction with the #1 batting rating.", xp: 120 },
  champion: { label: "Championship Winner", desc: "Win a simulated IPL tournament.", xp: 300 },
  economical: { label: "Most Economical Franchise", desc: "Spend the least while finishing top-4 in power rankings.", xp: 150 },
  comeback: { label: "Comeback Champion", desc: "Win the title after finishing 3rd or 4th in the league.", xp: 250 },
  scout: { label: "Scouting Expert", desc: "Add 10 players to your scouting watchlist.", xp: 60 },
  first_match: { label: "Opening Day", desc: "Simulate your first match.", xp: 40 },
  trader: { label: "Deal Maker", desc: "Complete a player trade.", xp: 80 },
};
export function grantAchievement(userId: string, key: string, room?: string) {
  if (!ACHIEVEMENTS[key] || !userId || userId.startsWith("ai:")) return false;
  const r = db.prepare("INSERT OR IGNORE INTO achievements (user_id, key, ts, room) VALUES (?,?,?,?)").run(userId, key, Date.now(), room || null);
  if (r.changes) {
    addXp(userId, ACHIEVEMENTS[key].xp);
    return true;
  }
  return false;
}
