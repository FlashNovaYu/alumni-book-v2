import { applyD1Migrations } from 'cloudflare:test'

export const testMigrations = [
  { name: '0001_init', queries: [
    `CREATE TABLE IF NOT EXISTS students (
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
      info TEXT DEFAULT '{}',
      photos TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      frame_style TEXT DEFAULT 'none',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      caption TEXT DEFAULT '',
      r2_key TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]},
  { name: '0002_add_custom_html', queries: [
    `ALTER TABLE students ADD COLUMN custom_html TEXT`,
  ]},
  { name: '0003_add_messages', queries: [
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      student_slug TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      reactions TEXT DEFAULT '{}',
      reply TEXT,
      reply_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_slug, is_approved, created_at DESC)`,
  ]},
  { name: '0004_add_timeline', queries: [
    `CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      photo_r2_key TEXT,
      is_milestone INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date DESC)`,
  ]},
  { name: '0005_info_columns', queries: [
    `ALTER TABLE students ADD COLUMN mbti TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN graduation_year TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN school TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN class_name TEXT DEFAULT ''`,
  ]},
  { name: '0006_self_service_fields', queries: [
    `ALTER TABLE students ADD COLUMN visit_count INTEGER DEFAULT 0`,
  ]},
  { name: '0007_security_privacy', queries: [
    `ALTER TABLE students ADD COLUMN edit_secret_hash TEXT`,
    `ALTER TABLE students ADD COLUMN edit_secret_updated_at TEXT`,
    `ALTER TABLE students ADD COLUMN privacy_level TEXT DEFAULT 'classmates'`,
  ]},
  { name: '0008_profile_modules_and_messages', queries: [
    `ALTER TABLE messages ADD COLUMN card_style TEXT DEFAULT 'paper'`,
    `ALTER TABLE messages ADD COLUMN pinned INTEGER DEFAULT 0`,
    `ALTER TABLE albums ADD COLUMN cover_r2_key TEXT`,
    `ALTER TABLE albums ADD COLUMN tags TEXT DEFAULT '[]'`,
  ]}
]

export async function initTestDb(db: any) {
  await applyD1Migrations(db, testMigrations)
}
