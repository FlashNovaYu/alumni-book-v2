ALTER TABLE albums ADD COLUMN accepts_classmate_uploads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN submitted_by_slug TEXT;
ALTER TABLE photos ADD COLUMN upload_source TEXT NOT NULL DEFAULT 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_one_classmate_submission_target
  ON albums(accepts_classmate_uploads) WHERE accepts_classmate_uploads = 1;
CREATE INDEX IF NOT EXISTS idx_photos_classmate_submission_quota
  ON photos(submitted_by_slug, upload_source);

CREATE TRIGGER IF NOT EXISTS trg_photos_classmate_submission_limit
BEFORE INSERT ON photos
WHEN NEW.upload_source = 'classmate' AND (
  SELECT COUNT(*) FROM photos
  WHERE submitted_by_slug = NEW.submitted_by_slug AND upload_source = 'classmate'
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'classmate album submission limit reached');
END;
