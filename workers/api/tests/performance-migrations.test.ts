import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { testMigrations } from './db-helper'
import schemaSource from '../src/db/schema.sql?raw'

beforeAll(async () => {
  const throughIndexes = testMigrations.filter((migration) => migration.name <= '0017_performance_indexes')
  const timestampMigration = testMigrations.find((migration) => migration.name === '0018_normalize_timestamps')
  if (!timestampMigration) throw new Error('缺少 0018 测试迁移')
  await applyD1Migrations(env.DB, throughIndexes)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('migration-student-a', '迁移甲', 'migration-a')"),
    env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('migration-student-b', '迁移乙', 'migration-b')"),
    env.DB.prepare("INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at) VALUES ('migration-conversation', 'migration-a', 'migration-b', '2026-01-01 00:00:00', '2026-01-01 00:01:00')"),
    env.DB.prepare("INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-message', 'migration-conversation', 'migration-a', 'migration-b', '迁移', 'migration-nonce', '2026-01-01 00:02:00')"),
    env.DB.prepare("INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-no-ms', 'migration-conversation', 'migration-a', 'migration-b', '无毫秒', 'migration-no-ms-nonce', '2026-01-01T00:05:00Z')"),
    env.DB.prepare("INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-offset', 'migration-conversation', 'migration-a', 'migration-b', '偏移', 'migration-offset-nonce', '2026-01-01T08:06:00+08:00')"),
    env.DB.prepare("INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-invalid', 'migration-conversation', 'migration-a', 'migration-b', '无法解析', 'migration-invalid-nonce', 'not-a-time')"),
    env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('migration-public', 'migration-a', '迁移甲', '迁移', 'visible', '2026-01-01 00:03:00', '2026-01-01 00:04:00')"),
    env.DB.prepare("INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_by, created_at, updated_at) VALUES ('migration-a', '2026-01-01T08:07:00+08:00', '迁移测试', 'test', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"),
    env.DB.prepare("INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES ('migration-classmate-token', 'migration-a', '2099-01-01 00:00:00')"),
    env.DB.prepare("INSERT INTO admin_sessions (token, expires_at) VALUES ('migration-admin-token', '2099-01-01 00:00:00')"),
  ])
  await applyD1Migrations(env.DB, [timestampMigration])
})

describe('0017/0018 性能迁移', () => {
  it('新库 schema 只声明历史游标索引并包含规范化触发器', () => {
    expect(schemaSource).not.toContain('idx_direct_messages_conversation_cursor')
    expect(schemaSource.match(/CREATE INDEX IF NOT EXISTS idx_direct_messages_history/g)).toHaveLength(1)
    expect(schemaSource).toContain('trg_public_messages_normalize_updates')
    expect(schemaSource).toContain('trg_classmate_sessions_normalize_expires')
  })

  it('按真实顺序提供所需索引且不复制历史游标索引', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"
    ).all<any>()
    const names = (results || []).map((row: any) => row.name)
    expect(names).toContain('idx_group_chat_history')
    expect(names).toContain('idx_direct_messages_conversation_unread')
    expect(names.filter((name: string) => name === 'idx_direct_messages_history')).toHaveLength(1)
    expect(names).not.toContain('idx_direct_messages_conversation_cursor')
  })

  it('转换已有混合时间并让触发器规范化后续旧格式写入', async () => {
    const converted = await env.DB.prepare(
      "SELECT created_at FROM direct_messages WHERE id = 'migration-message'"
    ).first<any>()
    const sessions = await env.DB.prepare(
      "SELECT expires_at FROM classmate_sessions WHERE token = 'migration-classmate-token'"
    ).first<any>()
    expect(converted?.created_at).toBe('2026-01-01T00:02:00.000Z')
    expect(await env.DB.prepare("SELECT created_at FROM direct_messages WHERE id = 'migration-no-ms'").first()).toMatchObject({ created_at: '2026-01-01T00:05:00.000Z' })
    expect(await env.DB.prepare("SELECT created_at FROM direct_messages WHERE id = 'migration-offset'").first()).toMatchObject({ created_at: '2026-01-01T00:06:00.000Z' })
    expect(await env.DB.prepare("SELECT created_at FROM direct_messages WHERE id = 'migration-invalid'").first()).toMatchObject({ created_at: 'not-a-time' })
    expect(await env.DB.prepare("SELECT muted_until FROM group_chat_mutes WHERE student_slug = 'migration-a'").first()).toMatchObject({ muted_until: '2026-01-01T00:07:00.000Z' })
    expect(sessions?.expires_at).toBe('2099-01-01T00:00:00.000Z')

    await env.DB.prepare(
      "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-trigger-message', 'migration-conversation', 'migration-a', 'migration-b', '触发器', 'migration-trigger-nonce', '2026-02-01 00:00:00')"
    ).run()
    expect(await env.DB.prepare("SELECT created_at FROM direct_messages WHERE id = 'migration-trigger-message'").first())
      .toMatchObject({ created_at: '2026-02-01T00:00:00.000Z' })
    await env.DB.prepare(
      "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('migration-trigger-invalid', 'migration-conversation', 'migration-a', 'migration-b', '触发器无法解析', 'migration-trigger-invalid-nonce', 'not-a-time')"
    ).run()
    expect(await env.DB.prepare("SELECT created_at FROM direct_messages WHERE id = 'migration-trigger-invalid'").first())
      .toMatchObject({ created_at: 'not-a-time' })
  })
})
