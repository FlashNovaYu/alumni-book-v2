-- Responsive image derivative metadata. Legacy rows remain valid with an empty object.
ALTER TABLE students ADD COLUMN media_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE photos ADD COLUMN media_json TEXT NOT NULL DEFAULT '{}';
