CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  ip TEXT NOT NULL,
  account TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER,
  last_failed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_cleanup
  ON auth_login_attempts (last_failed_at);
