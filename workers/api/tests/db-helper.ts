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
  ]},
  { name: '0009_upgrade_museum', queries: [
    `ALTER TABLE albums ADD COLUMN featured INTEGER DEFAULT 0`,
    `ALTER TABLE timeline_events ADD COLUMN event_type TEXT DEFAULT 'class_event'`,
  ]},
  { name: '0010_classmate_accounts', queries: [
    `ALTER TABLE students ADD COLUMN account_password_hash TEXT`,
    `ALTER TABLE students ADD COLUMN account_initial_password_changed INTEGER DEFAULT 0`,
    `ALTER TABLE students ADD COLUMN account_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE students ADD COLUMN account_last_login_at TEXT`,
    `CREATE TABLE IF NOT EXISTS classmate_sessions (
      token TEXT PRIMARY KEY,
      student_slug TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_classmate_sessions_slug ON classmate_sessions(student_slug)`,
    `CREATE INDEX IF NOT EXISTS idx_classmate_sessions_expires ON classmate_sessions(expires_at)`,
  ]},
  { name: '0011_post_office_community', queries: [
    `CREATE TABLE IF NOT EXISTS public_messages (
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
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_public_messages_status ON public_messages(status, pinned, featured, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_public_messages_author ON public_messages(author_slug, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS content_reviews (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      admin_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_slug TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      related_type TEXT,
      related_id TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_slug, read_at, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS mail_threads (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      thread_type TEXT DEFAULT 'private',
      created_by_type TEXT NOT NULL,
      created_by_slug TEXT,
      allow_reply INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS mail_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_slug TEXT,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS mail_recipients (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      recipient_slug TEXT NOT NULL,
      read_at TEXT,
      archived_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mail_recipients_slug ON mail_recipients(recipient_slug, read_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id, created_at)`,
  ]},
  { name: '0012_admin_rbac', queries: [
    `CREATE TABLE IF NOT EXISTS admin_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admin_role_permissions (
      role_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      PRIMARY KEY (role_id, permission)
    )`,
    `CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL,
      username TEXT UNIQUE,
      display_name TEXT NOT NULL,
      student_slug TEXT UNIQUE,
      password_hash TEXT,
      role_id TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      is_owner INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admin_account_permissions (
      admin_account_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      effect TEXT NOT NULL,
      PRIMARY KEY (admin_account_id, permission)
    )`,
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_account_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      reason TEXT,
      before_summary TEXT,
      after_summary TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `ALTER TABLE admin_sessions ADD COLUMN admin_account_id TEXT`,
    `ALTER TABLE admin_sessions ADD COLUMN revoked_at TEXT`,
    `INSERT OR IGNORE INTO admin_roles (id, name, description) VALUES
      ('owner', '主管理员', '拥有全部后台权限'),
      ('content_admin', '内容管理员', '管理全部非核心业务模块'),
      ('moderator', '内容审核员', '审核与处置公共内容'),
      ('operator', '运营管理员', '发布通知、管理相册和时光轴')`,
  ]}
]

export async function initTestDb(db: any) {
  await applyD1Migrations(db, testMigrations)
  await db.prepare(`
    INSERT OR REPLACE INTO students (id, name, slug, info)
    VALUES (?, ?, ?, ?)
  `).bind(
    'stu_test_init',
    '测试同学',
    'test_init',
    JSON.stringify({
      name: '测试同学',
      nickname: '测试',
      motto: '天天向上',
      tags: ['打球', '看书'],
      completion: 80
    })
  ).run()
}
