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
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
