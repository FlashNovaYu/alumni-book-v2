# Gemini Parallel Work Packages

Base: `d3dd8be` on `codex/class-space-chat-rework`.

Use a separate branch and worktree for each package. Do not merge, deploy, or
change files outside the listed ownership. Return the commit SHA, changed files,
and actual test output. Copy local `.dev.vars` only when needed; never commit it.

```powershell
git worktree add ..\alumni-book-v2-gemini-direct -b gemini/direct-conversations d3dd8be
git worktree add ..\alumni-book-v2-gemini-migration -b gemini/chat-migration-core d3dd8be
```

## Package A: Task 5 Direct Conversations API

Files owned:

- Create `workers/api/src/routes/directConversations.ts`
- Create `workers/api/tests/direct-conversations.test.ts`
- Modify `workers/api/src/index.ts`

Do not modify migrations, shared types, inbox routes, or frontend code.

Implement, with failing tests first:

```text
GET  /api/direct-conversations
POST /api/direct-conversations
GET  /api/direct-conversations/:id/messages
POST /api/direct-conversations/:id/messages
PUT  /api/direct-conversations/:id/read
```

Requirements:

- Require a classmate session on every endpoint.
- Use lexically ordered slugs for the unique pair; reject self and locked recipients.
- First conversation and first message must be one `DB.batch`.
- One pair always has one persistent conversation. Repeated `clientNonce` returns
  the existing message.
- Only participants can list/read/send/mark read. A third student receives
  `404` for all conversation detail routes.
- Trim message body and accept 1-2000 characters.
- Return existing `DirectConversation` / `DirectMessage` contracts without
  `read_at`. Read receipts are not a product feature.
- Read body is exactly `{ throughMessageId: string }`, updating only messages
  received by the current user through that message.
- History has a validated opaque before cursor and chronological output.

Tests must cover reuse, both participants, third-party `404`, unread count,
nonce idempotency, pagination, read-through, and no sender-visible read receipt.

```powershell
pnpm --filter worker exec vitest run tests/direct-conversations.test.ts
pnpm verify:worker
pnpm --filter worker exec tsc --noEmit
git diff --check
```

Commit: `feat: add direct conversations API`.

## Package B: Task 7 Legacy Migration Core

Keep this limited to migration scripts and tests. Compatibility route work remains
on the main branch.

Files owned:

- Create `scripts/lib/chatMigration.ts`
- Create `scripts/migrate-chat-data.ts`
- Create `workers/api/tests/chat-migration.test.ts`
- Modify root `package.json` only to add `migrate:chat-data`

Do not modify Worker routes, migrations, shared types, site, or admin code.

Requirements:

- Export `legacyChatMigrationStatements`, `ChatMigrationReport`, and
  `assertChatMigrationReport`.
- Migration is idempotent. Two legacy private threads for the same pair become
  one stable sorted-slug conversation, preserving all messages chronologically.
- Direct messages use `client_nonce = legacy:<oldMessageId>`.
- Legacy admin/system threads create one `admin_notice` per recipient with a
  stable ID; concatenate entries in `(created_at, id)` order with sender labels.
- Preserve pending/rejected public entries. Missing creator/recipient/sender
  references must increase report `anomalies`, never be silently discarded.
- Runner supports `--local` and `--remote`, defaults to local, executes D1
  migration SQL through Wrangler, prints JSON report, and fails on anomalies or
  count mismatches.

Fixture: two private threads for one pair, four bidirectional messages, one admin
thread, and one pending public item. Run twice and assert one conversation, four
messages, one `admin_notice`, chronological order, legacy nonces, unchanged
pending status, and no second-run count changes.

```powershell
pnpm --filter worker exec vitest run tests/chat-migration.test.ts
pnpm --filter worker exec wrangler d1 migrations apply alumni-book-db --local
pnpm migrate:chat-data -- --local
git diff --check
```

Commit: `feat: add legacy chat migration core`.

## Integration Order

1. Merge Package A before Task 6 because inbox sync consumes it.
2. Package B is independently reviewable and must land before Task 18.
3. Do not start Tasks 6, 8, 14, 15, or 16 in these worktrees.

