# Gemini Revision Feedback

Both submitted packages are currently rejected for integration. Rebase each branch
onto the current implementation head before fixing:

```powershell
git fetch --all --prune
git rebase codex/class-space-chat-rework
```

Do not combine the two packages. Do not merge or deploy. Return the replacement
commit SHA, changed files, exact test output, and a short explanation of each
fixed acceptance criterion.

## Package A: Direct Conversations Revision

Rejected commit: `729160e` on `gemini/direct-conversations`.

### Required fixes

1. **Concurrent first conversation creation**

   Two simultaneous first messages between the same pair can both observe no
   conversation, then one crashes on the pair unique index. Add a real
   `Promise.all` regression using two different nonces. It must create exactly
   one conversation, preserve both messages, and never return `500`.

   Keep the normal first creation as a `DB.batch`. Resolve the unique-pair race
   with a deterministic pair identifier or a narrowly handled unique-conflict
   reread/retry; do not swallow unrelated D1 failures.

2. **Message-write password gate**

   Follow the existing group-chat policy for new content: block the two POST
   endpoints for `identity.mustChangePassword` with `403`. Do not block
   conversation/history reads or the read-through endpoint: Task 5 does not
   define a blanket first-login browsing lock. Add write-block tests.

3. **Strict request and pagination validation**

   - Parse request JSON with controlled `400` errors.
   - Require trimmed string `recipientSlug`, string `body`, and trimmed string
     `clientNonce`; keep body at 1-2000 and limit nonce to 128 characters.
   - Reject malformed JSON and invalid types without a `500`.
   - Parse `limit` with the project convention: valid integer range 1..30;
     invalid/non-positive values must not reach D1 as a raw limit.
   - Validate history cursors as the existing cursor helpers require.

4. **Mixed legacy/new time formats**

   Migration writes legacy SQLite timestamps while live direct messages use ISO
   timestamps. History pagination and read-through must compare time values with
   `julianday(...)` plus `id` tie-breaking, not textual timestamp comparison.
   Add a test covering SQLite-format and ISO-format messages at the same time
   boundary so pagination neither skips nor duplicates messages.

5. **Keep existing guarantees**

   Preserve participant SQL checks and third-party `404`, sender-hidden
   `read_at`, nonce idempotency, unread counts, and exact
   `{ throughMessageId: string }` validation.

Run:

```powershell
pnpm --filter worker exec vitest run tests/direct-conversations.test.ts
pnpm verify:worker
pnpm --filter worker exec tsc --noEmit
git diff --check
```

Suggested commit: `fix: harden direct conversation API`.

## Package B: Legacy Migration Core Revision

Rejected commit: `4e206b5` on `gemini/chat-migration-core`.

### Required fixes

1. **Restore the planned public contract**

   Export a static `legacyChatMigrationStatements: string[]`, the full
   `ChatMigrationReport` shape:

```ts
{
  sourcePrivateThreads: number
  sourcePrivateMessages: number
  directConversations: number
  directMessages: number
  migratedNotifications: number
  anomalies: number
}
```

   and `assertChatMigrationReport(report)`. Additional helpers are allowed,
   but the named contract must exist.

2. **Use safe static SQL and preserve IDs**

   Do not interpolate database values into SQL strings. Generate migration SQL
   from static statements using SQL expressions and `INSERT OR IGNORE`, or use
   bound parameters in a controlled execution path. This must remain valid when
   slugs, titles, and message bodies contain apostrophes.

   Preserve every legacy message ID as the new direct-message ID, and use
   `client_nonce = legacy:<oldMessageId>`. Do not add a replacement
   `migrated_mailmsg_` prefix.

3. **Runner must verify after execution**

   The runner must:

   - collect source counts before executing;
   - write and execute the migration SQL through Wrangler for `--local` or
     `--remote` (default local);
   - collect actual target counts and anomalies after execution;
   - print the final JSON report only after those checks;
   - set a nonzero exit code for anomalies or source/target count mismatch.

   A projected pre-execution report is insufficient. Do not allow
   `INSERT OR IGNORE` conflicts to silently pass a count check.

4. **Ordering and anomaly tests**

   Add same-`created_at` messages with different IDs and assert
   `(created_at, id)` order for direct messages and concatenated admin notice
   body. Add apostrophe data and malformed creator/recipient/sender cases.
   Preserve pending/rejected public messages unchanged.

5. **Keep scope**

   Remain limited to the migration scripts, package command, and migration tests.
   Compatibility route work stays on the main branch.

Run:

```powershell
pnpm --filter worker exec vitest run tests/chat-migration.test.ts
pnpm --filter worker exec wrangler d1 migrations apply alumni-book-db --local
pnpm migrate:chat-data -- --local
pnpm --filter worker exec tsc --noEmit
git diff --check
```

Suggested commit: `fix: verify legacy chat migration`.

