ALTER TABLE public_messages ADD COLUMN reply_to_id TEXT;
ALTER TABLE public_messages ADD COLUMN client_nonce TEXT;
ALTER TABLE public_messages ADD COLUMN recalled_by_type TEXT;
ALTER TABLE public_messages ADD COLUMN recalled_at TEXT;
ALTER TABLE public_messages ADD COLUMN moderation_reason TEXT;

UPDATE public_messages SET status = 'visible' WHERE status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_messages_nonce
  ON public_messages(author_slug, client_nonce)
  WHERE client_nonce IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_chat_updated
  ON public_messages(updated_at, id);

CREATE TABLE IF NOT EXISTS group_chat_reactions (
  message_id TEXT NOT NULL,
  reactor_slug TEXT NOT NULL,
  reaction TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, reactor_slug),
  FOREIGN KEY (message_id) REFERENCES public_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (reactor_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_chat_mutes (
  student_slug TEXT PRIMARY KEY,
  muted_until TEXT,
  reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS direct_conversations (
  id TEXT PRIMARY KEY,
  participant_a_slug TEXT NOT NULL,
  participant_b_slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (participant_a_slug, participant_b_slug),
  CHECK (participant_a_slug < participant_b_slug),
  FOREIGN KEY (participant_a_slug) REFERENCES students(slug) ON DELETE CASCADE,
  FOREIGN KEY (participant_b_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_direct_conversation_a
  ON direct_conversations(participant_a_slug, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_conversation_b
  ON direct_conversations(participant_b_slug, updated_at DESC);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_slug TEXT NOT NULL,
  recipient_slug TEXT NOT NULL,
  body TEXT NOT NULL,
  client_nonce TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (sender_slug, client_nonce),
  FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_slug) REFERENCES students(slug) ON DELETE CASCADE,
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_history
  ON direct_messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
  ON direct_messages(recipient_slug, read_at, created_at DESC);
