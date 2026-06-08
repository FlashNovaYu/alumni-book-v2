-- 0008_profile_modules_and_messages.sql
ALTER TABLE messages ADD COLUMN card_style TEXT DEFAULT 'paper';
ALTER TABLE messages ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE albums ADD COLUMN cover_r2_key TEXT;
ALTER TABLE albums ADD COLUMN tags TEXT DEFAULT '[]';
