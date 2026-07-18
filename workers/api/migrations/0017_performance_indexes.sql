-- Keep high-growth list and cursor reads index-backed as data accumulates.
CREATE INDEX IF NOT EXISTS idx_photos_album_sort_order
  ON photos(album_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_albums_sort_created
  ON albums(sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_cursor
  ON direct_messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_unread
  ON direct_messages(conversation_id, recipient_slug, read_at, created_at DESC);
