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
