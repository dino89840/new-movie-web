PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK(role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'blocked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tmdb_id INTEGER,
  tmdb_type TEXT DEFAULT '',
  category TEXT NOT NULL
    CHECK(category IN ('movies', 'series', 'lugyi')),
  title TEXT NOT NULL,
  original_title TEXT DEFAULT '',
  overview TEXT DEFAULT '',
  poster_url TEXT DEFAULT '',
  backdrop_url TEXT DEFAULT '',
  release_date TEXT DEFAULT '',
  year INTEGER,
  rating REAL DEFAULT 0,
  genres TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  video_type TEXT NOT NULL DEFAULT 'auto'
    CHECK(video_type IN ('auto', 'mp4', 'm3u8')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'public')),
  featured INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_titles_public_category
ON titles(status, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_titles_slug
ON titles(slug);

CREATE INDEX IF NOT EXISTS idx_titles_tmdb
ON titles(tmdb_id, tmdb_type);

CREATE INDEX IF NOT EXISTS idx_titles_search
ON titles(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER NOT NULL,
  episode_title TEXT DEFAULT '',
  video_url TEXT NOT NULL,
  video_type TEXT NOT NULL DEFAULT 'auto'
    CHECK(video_type IN ('auto', 'mp4', 'm3u8')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(title_id) REFERENCES titles(id) ON DELETE CASCADE,
  UNIQUE(title_id, season_number, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_title_order
ON episodes(title_id, season_number, episode_number);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, title_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(title_id) REFERENCES titles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_user
ON favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings
(setting_key, setting_value, updated_at)
VALUES
('maintenance_mode', '0', 0),
('maintenance_message', 'CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။', 0);
CREATE INDEX IF NOT EXISTS idx_titles_catalog
ON titles(
  status,
  category,
  featured DESC,
  created_at DESC,
  id DESC
);
