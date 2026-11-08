-- Run once against the live database:
-- npx wrangler d1 execute guestbook --remote --file migrations/0001_where_from.sql
ALTER TABLE messages ADD COLUMN city TEXT;
ALTER TABLE messages ADD COLUMN region TEXT;
ALTER TABLE messages ADD COLUMN country TEXT;
ALTER TABLE messages ADD COLUMN network TEXT;
ALTER TABLE messages ADD COLUMN device TEXT;
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  ip_hash TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  network TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS visits_time ON visits (at);
CREATE INDEX IF NOT EXISTS visits_ip_time ON visits (ip_hash, at);
