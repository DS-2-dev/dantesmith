-- Run once against the live database, before deploying the Worker that uses it:
-- npx wrangler d1 execute guestbook --remote --file migrations/0002_time_and_clicks.sql
ALTER TABLE visits ADD COLUMN view TEXT;
ALTER TABLE visits ADD COLUMN tag TEXT;
ALTER TABLE visits ADD COLUMN seconds INTEGER;
CREATE INDEX IF NOT EXISTS visits_view ON visits (view);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  what TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clicks_visit ON clicks (visit_id);
