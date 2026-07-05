-- 0010_classmate_accounts.sql
-- CCSwitch: 为每位同学增加独立账号状态、默认初始密码哈希、首次登录改密状态与会话表。
ALTER TABLE students ADD COLUMN account_password_hash TEXT;
ALTER TABLE students ADD COLUMN account_initial_password_changed INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN account_status TEXT DEFAULT 'pending';
ALTER TABLE students ADD COLUMN account_last_login_at TEXT;

CREATE TABLE IF NOT EXISTS classmate_sessions (
  token TEXT PRIMARY KEY,
  student_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classmate_sessions_slug ON classmate_sessions(student_slug);
CREATE INDEX IF NOT EXISTS idx_classmate_sessions_expires ON classmate_sessions(expires_at);
