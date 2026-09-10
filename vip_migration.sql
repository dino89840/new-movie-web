PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN vip_until INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
ADD COLUMN vip_device_id TEXT DEFAULT NULL;

ALTER TABLE sessions
ADD COLUMN device_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_vip_until
ON users(vip_until);

CREATE INDEX IF NOT EXISTS idx_sessions_user_device
ON sessions(user_id, device_id);
