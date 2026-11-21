# SQLite to Supabase PostgreSQL migration plan

## Current architecture

The production server is still backed by `better-sqlite3`. The database API is synchronous and is used throughout the backend, so changing only the connection string or driver is not a safe migration.

Affected modules include:

- `server/db.ts`: schema bootstrap and shared user, token, XP, audit and achievement helpers.
- `server/routes.ts`: authentication and most HTTP API persistence (dozens of prepared statements).
- `server/auction.ts`: room state and auction persistence.
- `server/tournament.ts`: match and game-record persistence.
- `server/data.ts`: player overrides and custom-player reads.
- `server/ws.ts`: visitor and WebSocket identity lookups.
- `server/index.ts`: startup ordering and readiness.

## Migration sequence

1. Add a server-only PostgreSQL connection module using the Supabase Session Pooler URL from `DATABASE_URL`. Do not put database credentials or service-role keys in client code.
2. Convert the shared database helpers to asynchronous functions and define explicit row types.
3. Convert all callers in routes, auction, tournaments, data loading and WebSockets. Await every database operation; preserve existing response shapes and authorization checks.
4. Translate SQLite-specific SQL deliberately:
   - `?` placeholders to PostgreSQL parameters.
   - `INSERT OR IGNORE` to `ON CONFLICT DO NOTHING`.
   - `INSERT OR REPLACE` to explicit `INSERT ... ON CONFLICT ... DO UPDATE`.
   - `lastInsertRowid` assumptions to `RETURNING id`.
   - SQLite integer booleans and JSON text to the existing PostgreSQL schema's compatible representations.
5. Add transaction boundaries for multi-step writes (registration/token creation, room membership/state, auction completion and tournament records).
6. Add startup checks that fail clearly when `DATABASE_URL` is missing or PostgreSQL is unreachable. Do not silently fall back to an ephemeral SQLite database in production.
7. Run automated tests against a disposable PostgreSQL database, then verify registration, login, refresh, logout, visitor identity, room create/join/reconnect, auction save/reload, tournament save/reload and concurrent writes.
8. Only after tests pass, configure `DATABASE_URL` as a private Render environment variable, deploy, and verify production behavior. Keep the old SQLite file as a backup until data migration and verification are complete.

## Safety constraints

- The Supabase schema and RLS setup are database preparation only; they do not mean the application has migrated.
- Never expose `DATABASE_URL`, database passwords, or Supabase service-role/secret keys to the browser.
- Do not merge or deploy an incomplete migration.
- Do not claim existing SQLite data has been migrated until a verified export/import and row-count check has been completed.

## Acceptance checklist

- [ ] No production code imports `better-sqlite3`.
- [ ] No SQLite-only SQL remains in server modules.
- [ ] Every database operation is awaited and errors are handled.
- [ ] Registration persists across process restart.
- [ ] Login and existing sessions work after refresh/restart.
- [ ] User profile, friends, achievements and watchlist persist.
- [ ] Rooms, memberships and auction state persist and reconnect correctly.
- [ ] Tournament matches and game records persist.
- [ ] Concurrent requests do not lose updates or create duplicate records.
- [ ] CI and PostgreSQL integration tests pass.
- [ ] Render deployment is verified against Supabase PostgreSQL.
