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
  device TEXT
);
CREATE INDEX IF NOT EXISTS visits_time ON visits (at);
CREATE INDEX IF NOT EXISTS visits_ip_time ON visits (ip_hash, at);
