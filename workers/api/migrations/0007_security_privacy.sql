-- 0007_security_privacy.sql
ALTER TABLE students ADD COLUMN edit_secret_hash TEXT;
ALTER TABLE students ADD COLUMN edit_secret_updated_at TEXT;
ALTER TABLE students ADD COLUMN privacy_level TEXT DEFAULT 'classmates';
