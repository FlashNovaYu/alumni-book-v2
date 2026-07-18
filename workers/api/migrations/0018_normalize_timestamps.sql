-- Canonical UTC timestamps keep high-growth cursor columns text-sortable.
-- COALESCE preserves values SQLite cannot parse instead of replacing them with NULL.
UPDATE direct_messages
SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at)
WHERE created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at);

UPDATE direct_conversations
SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at),
    updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at), updated_at)
WHERE created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at)
   OR updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at), updated_at);

UPDATE public_messages
SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at),
    updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at), updated_at)
WHERE created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), created_at)
   OR updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at), updated_at);

UPDATE group_chat_mutes
SET muted_until = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', muted_until), muted_until)
WHERE muted_until IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', muted_until), muted_until);

UPDATE classmate_sessions
SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', expires_at), expires_at)
WHERE expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', expires_at), expires_at);

UPDATE admin_sessions
SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', expires_at), expires_at)
WHERE expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', expires_at), expires_at);

CREATE TRIGGER IF NOT EXISTS trg_direct_messages_normalize_created
AFTER INSERT ON direct_messages
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
BEGIN
  UPDATE direct_messages SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_direct_messages_normalize_updated
AFTER UPDATE OF created_at ON direct_messages
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
BEGIN
  UPDATE direct_messages SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_direct_conversations_normalize_created
AFTER INSERT ON direct_conversations
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
  OR NEW.updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
BEGIN
  UPDATE direct_conversations
  SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at),
      updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_direct_conversations_normalize_updated
AFTER UPDATE OF created_at, updated_at ON direct_conversations
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
  OR NEW.updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
BEGIN
  UPDATE direct_conversations
  SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at),
      updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_public_messages_normalize_timestamps
AFTER INSERT ON public_messages
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
  OR NEW.updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
BEGIN
  UPDATE public_messages
  SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at),
      updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_public_messages_normalize_updates
AFTER UPDATE OF created_at, updated_at ON public_messages
WHEN NEW.created_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at)
  OR NEW.updated_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
BEGIN
  UPDATE public_messages
  SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.created_at),
      updated_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at), NEW.updated_at)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_group_chat_mutes_normalize_insert
AFTER INSERT ON group_chat_mutes
WHEN NEW.muted_until IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.muted_until), NEW.muted_until)
BEGIN
  UPDATE group_chat_mutes SET muted_until = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.muted_until), NEW.muted_until) WHERE student_slug = NEW.student_slug;
END;

CREATE TRIGGER IF NOT EXISTS trg_group_chat_mutes_normalize_update
AFTER UPDATE OF muted_until ON group_chat_mutes
WHEN NEW.muted_until IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.muted_until), NEW.muted_until)
BEGIN
  UPDATE group_chat_mutes SET muted_until = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.muted_until), NEW.muted_until) WHERE student_slug = NEW.student_slug;
END;

CREATE TRIGGER IF NOT EXISTS trg_classmate_sessions_normalize_expires
AFTER INSERT ON classmate_sessions
WHEN NEW.expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at)
BEGIN
  UPDATE classmate_sessions SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at) WHERE token = NEW.token;
END;

CREATE TRIGGER IF NOT EXISTS trg_classmate_sessions_normalize_updates
AFTER UPDATE OF expires_at ON classmate_sessions
WHEN NEW.expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at)
BEGIN
  UPDATE classmate_sessions SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at) WHERE token = NEW.token;
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_sessions_normalize_expires
AFTER INSERT ON admin_sessions
WHEN NEW.expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at)
BEGIN
  UPDATE admin_sessions SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at) WHERE token = NEW.token;
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_sessions_normalize_updates
AFTER UPDATE OF expires_at ON admin_sessions
WHEN NEW.expires_at IS NOT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at)
BEGIN
  UPDATE admin_sessions SET expires_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at), NEW.expires_at) WHERE token = NEW.token;
END;
