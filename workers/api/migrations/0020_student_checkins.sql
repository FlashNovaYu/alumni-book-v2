CREATE TABLE IF NOT EXISTS student_checkins (
  student_slug TEXT NOT NULL,
  visitor_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student_slug, visitor_slug),
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE,
  FOREIGN KEY (visitor_slug) REFERENCES students(slug) ON DELETE CASCADE
);

ALTER TABLE students ADD COLUMN checkin_count INTEGER DEFAULT 0;
