-- 同学录 v2 数据库 Schema (完全版)

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_owner INTEGER DEFAULT 0,
  avatar_url TEXT,
  music_url TEXT,
  music_title TEXT,
  music_autoplay INTEGER DEFAULT 0,
  background_url TEXT,
  background_color TEXT,
  custom_html TEXT,
  mbti TEXT DEFAULT '',
  graduation_year TEXT DEFAULT '',
  school TEXT DEFAULT '',
  class_name TEXT DEFAULT '',
  visit_count INTEGER DEFAULT 0,
  edit_secret_hash TEXT,
  edit_secret_updated_at TEXT,
  privacy_level TEXT DEFAULT 'classmates',
  info TEXT DEFAULT '{}',
  photos TEXT DEFAULT '[]',
  account_password_hash TEXT,
  account_initial_password_changed INTEGER DEFAULT 0,
  account_status TEXT DEFAULT 'pending',
  account_last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  frame_style TEXT DEFAULT 'none',
  sort_order INTEGER DEFAULT 0,
  cover_r2_key TEXT,
  tags TEXT DEFAULT '[]',
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  caption TEXT DEFAULT '',
  r2_key TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  student_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_hidden INTEGER DEFAULT 0,
  is_approved INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  reply TEXT,
  reply_at TEXT,
  card_style TEXT DEFAULT 'paper',
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_slug, is_approved, created_at DESC);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  photo_r2_key TEXT,
  is_milestone INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  event_type TEXT DEFAULT 'class_event',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_account_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission),
  FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('standalone', 'classmate_linked')),
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  student_slug TEXT UNIQUE,
  password_hash TEXT,
  role_id TEXT NOT NULL REFERENCES admin_roles(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  is_owner INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  CHECK((account_type = 'standalone' AND username IS NOT NULL AND password_hash IS NOT NULL AND student_slug IS NULL) OR (account_type = 'classmate_linked' AND username IS NULL AND password_hash IS NULL AND student_slug IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS admin_account_permissions (
  admin_account_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny')),
  PRIMARY KEY (admin_account_id, permission),
  FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_account_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  reason TEXT,
  before_summary TEXT,
  after_summary TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_student_slug ON admin_accounts(student_slug);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_account ON admin_sessions(admin_account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created ON admin_audit_logs(admin_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS classmate_sessions (
  token TEXT PRIMARY KEY,
  student_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classmate_sessions_slug ON classmate_sessions(student_slug);
CREATE INDEX IF NOT EXISTS idx_classmate_sessions_expires ON classmate_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public_messages (
  id TEXT PRIMARY KEY,
  author_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  card_style TEXT DEFAULT 'paper',
  status TEXT DEFAULT 'pending',
  review_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  featured INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (author_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_messages_status
  ON public_messages(status, pinned, featured, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_messages_author
  ON public_messages(author_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS content_reviews (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  admin_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_slug TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_type TEXT,
  related_id TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(recipient_slug, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS mail_threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  thread_type TEXT DEFAULT 'private',
  created_by_type TEXT NOT NULL,
  created_by_slug TEXT,
  allow_reply INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_slug TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_recipients (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  recipient_slug TEXT NOT NULL,
  read_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mail_recipients_slug
  ON mail_recipients(recipient_slug, read_at);

CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
  ON mail_messages(thread_id, created_at);

