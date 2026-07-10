import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
})

describe('聊天改版数据库结构', () => {
  it('public_messages 包含聊天改版字段', async () => {
    const result = await env.DB.prepare('PRAGMA table_info(public_messages)').all() as any
    const columnNames = result.results.map((column: { name: string }) => column.name)

    expect(columnNames).toContain('reply_to_id')
    expect(columnNames).toContain('client_nonce')
    expect(columnNames).toContain('recalled_by_type')
    expect(columnNames).toContain('recalled_at')
    expect(columnNames).toContain('moderation_reason')
  })

  it('创建群聊和私聊所需的数据表', async () => {
    const result = await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('group_chat_reactions', 'group_chat_mutes', 'direct_conversations', 'direct_messages')
    `).all() as any
    const tableNames = result.results.map((table: { name: string }) => table.name)

    expect(tableNames).toEqual(expect.arrayContaining([
      'group_chat_reactions',
      'group_chat_mutes',
      'direct_conversations',
      'direct_messages',
    ]))
  })
})
