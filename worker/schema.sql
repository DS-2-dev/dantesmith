CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  network TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS messages_ip_time ON messages (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS messages_time ON messages (created_at);

-- One row per page view, from the site's beacon. ip_hash is the same key the
-- messages use, so a message can be matched to the visits around it.
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
  device TEXT,
  view TEXT,
  tag TEXT,
  seconds INTEGER
);
CREATE INDEX IF NOT EXISTS visits_view ON visits (view);
CREATE INDEX IF NOT EXISTS visits_time ON visits (at);
CREATE INDEX IF NOT EXISTS visits_ip_time ON visits (ip_hash, at);

-- What a visitor did during one visit: links followed, work opened, searches.
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  what TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clicks_visit ON clicks (visit_id);
