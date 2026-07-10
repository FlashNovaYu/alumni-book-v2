CREATE TABLE IF NOT EXISTS notification_sync_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT NOT NULL,
  recipient_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_sync_recipient
  ON notification_sync_events(recipient_slug, sequence);

INSERT INTO notification_sync_events (notification_id, recipient_slug, created_at)
SELECT id, recipient_slug, COALESCE(created_at, datetime('now'))
FROM notifications;

CREATE TRIGGER IF NOT EXISTS notification_sync_after_insert
AFTER INSERT ON notifications
BEGIN
  INSERT INTO notification_sync_events (notification_id, recipient_slug)
  VALUES (NEW.id, NEW.recipient_slug);
END;

CREATE TRIGGER IF NOT EXISTS notification_sync_after_read
AFTER UPDATE OF read_at ON notifications
WHEN OLD.read_at IS NOT NEW.read_at
BEGIN
  INSERT INTO notification_sync_events (notification_id, recipient_slug)
  VALUES (NEW.id, NEW.recipient_slug);
END;
