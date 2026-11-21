-- Remove inherited/non-DML table and sequence privileges from browser roles.
-- The IPL Auction Arena server will connect with a private server-side database URL.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
