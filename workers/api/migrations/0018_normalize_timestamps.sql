-- Canonical UTC timestamps keep the high-growth cursor columns text-sortable.
-- SQLite datetime() accepts both legacy "YYYY-MM-DD HH:MM:SS" and ISO input.
UPDATE direct_messages
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
WHERE created_at NOT LIKE '%T%Z';

UPDATE direct_conversations
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE created_at NOT LIKE '%T%Z' OR updated_at NOT LIKE '%T%Z';

UPDATE public_messages
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE created_at NOT LIKE '%T%Z' OR updated_at NOT LIKE '%T%Z';

UPDATE group_chat_mutes
SET muted_until = strftime('%Y-%m-%dT%H:%M:%fZ', muted_until)
WHERE muted_until IS NOT NULL AND muted_until NOT LIKE '%T%Z';

CREATE TRIGGER IF NOT EXISTS trg_direct_messages_normalize_created
AFTER INSERT ON direct_messages
WHEN NEW.created_at NOT LIKE '%T%Z'
BEGIN
  UPDATE direct_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_direct_messages_normalize_updated
AFTER UPDATE OF created_at ON direct_messages
WHEN NEW.created_at NOT LIKE '%T%Z'
BEGIN
  UPDATE direct_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_direct_conversations_normalize_created
AFTER INSERT ON direct_conversations
WHEN NEW.created_at NOT LIKE '%T%Z' OR NEW.updated_at NOT LIKE '%T%Z'
BEGIN
  UPDATE direct_conversations
  SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_public_messages_normalize_timestamps
AFTER INSERT ON public_messages
WHEN NEW.created_at NOT LIKE '%T%Z' OR NEW.updated_at NOT LIKE '%T%Z'
BEGIN
  UPDATE public_messages
  SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_public_messages_normalize_updates
AFTER UPDATE OF created_at, updated_at ON public_messages
WHEN NEW.created_at NOT LIKE '%T%Z' OR NEW.updated_at NOT LIKE '%T%Z'
BEGIN
  UPDATE public_messages
  SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at)
  WHERE id = NEW.id;
END;
