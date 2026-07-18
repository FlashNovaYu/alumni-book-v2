import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { testMigrations } from './db-helper'

beforeAll(async () => {
  const chatMigration = testMigrations.find((migration) => migration.name === '0012_chat_rework')
  if (!chatMigration) throw new Error('缺少 0012_chat_rework 测试迁移')

  const beforeChat = testMigrations.filter((migration) => migration.name < '0012_chat_rework')
  const afterChat = testMigrations.filter((migration) => migration.name > '0012_chat_rework')
  await applyD1Migrations(env.DB, beforeChat)
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug)
    VALUES ('stu_test_init', '测试同学', 'test_init')
  `).run()
  await env.DB.prepare(`
    INSERT INTO public_messages (id, author_slug, author_name, content, status)
    VALUES ('pm_chat_rework_migration_fixture', 'test_init', '测试同学', '迁移前审核通过的消息', 'approved')
  `).run()
  await applyD1Migrations(env.DB, [chatMigration])
  await applyD1Migrations(env.DB, afterChat)
  await env.DB.prepare(`
    INSERT INTO public_messages (id, author_slug, author_name, content, status)
    VALUES ('pm_reaction_parent', 'test_init', '测试同学', '回应测试消息', 'visible')
  `).run()
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

  it('创建 partial nonce 唯一索引和所有聊天查询索引', async () => {
    const indexList = await env.DB.prepare('PRAGMA index_list(public_messages)').all() as any
    const nonceIndex = indexList.results.find((index: { name: string }) => index.name === 'idx_public_messages_nonce')
    const nonceColumns = await env.DB.prepare('PRAGMA index_info(idx_public_messages_nonce)').all() as any
    const indexSql = await env.DB.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_public_messages_nonce'
    `).first() as { sql: string }
    const allIndexes = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'idx_group_chat_updated',
          'idx_direct_conversation_a',
          'idx_direct_conversation_b',
          'idx_direct_messages_history',
          'idx_direct_messages_unread'
        )
    `).all() as any

    expect(nonceIndex).toMatchObject({ unique: 1, partial: 1 })
    expect(nonceColumns.results.map((column: { name: string }) => column.name)).toEqual([
      'author_slug',
      'client_nonce',
    ])
    expect(indexSql.sql).toContain('WHERE client_nonce IS NOT NULL')
    expect(allIndexes.results.map((index: { name: string }) => index.name)).toEqual(expect.arrayContaining([
      'idx_group_chat_updated',
      'idx_direct_conversation_a',
      'idx_direct_conversation_b',
      'idx_direct_messages_history',
      'idx_direct_messages_unread',
    ]))
  })

  it('对同一作者执行 nonce 幂等约束，同时允许空 nonce', async () => {
    const insertMessage = (id: string, nonce: string | null) => env.DB.prepare(`
      INSERT INTO public_messages (id, author_slug, author_name, content, status, client_nonce)
      VALUES (?, 'test_init', '测试同学', '消息', 'visible', ?)
    `).bind(id, nonce).run()

    await insertMessage('pm_nonce_first', 'nonce-1')
    await expect(insertMessage('pm_nonce_duplicate', 'nonce-1')).rejects.toThrow()
    await insertMessage('pm_nonce_null_first', null)
    await insertMessage('pm_nonce_null_second', null)
  })

  it('群聊回应使用复合主键并声明消息和学生外键', async () => {
    const tableInfo = await env.DB.prepare('PRAGMA table_info(group_chat_reactions)').all() as any
    const foreignKeys = await env.DB.prepare('PRAGMA foreign_key_list(group_chat_reactions)').all() as any
    const insertReaction = () => env.DB.prepare(`
      INSERT INTO group_chat_reactions (message_id, reactor_slug, reaction, created_at)
      VALUES ('pm_reaction_parent', 'test_init', '👍', datetime('now'))
    `).run()

    expect(tableInfo.results.filter((column: { pk: number }) => column.pk > 0)
      .map((column: { name: string }) => column.name)).toEqual(['message_id', 'reactor_slug'])
    expect(foreignKeys.results.map((key: { table: string }) => key.table)).toEqual(expect.arrayContaining([
      'public_messages',
      'students',
    ]))
    await insertReaction()
    await expect(insertReaction()).rejects.toThrow()
  })

  it('私聊会话强制排序参与者并保持唯一', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('stu_chat_alice', 'Alice', 'chat_alice')"),
      env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('stu_chat_bob', 'Bob', 'chat_bob')"),
    ])

    const foreignKeys = await env.DB.prepare('PRAGMA foreign_key_list(direct_conversations)').all() as any
    const insertConversation = (id: string, participantA = 'chat_alice', participantB = 'chat_bob') => env.DB.prepare(`
      INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, participantA, participantB).run()

    expect(foreignKeys.results.map((key: { table: string }) => key.table)).toEqual(expect.arrayContaining([
      'students',
    ]))
    await insertConversation('conv_schema')
    await expect(insertConversation('conv_schema_duplicate')).rejects.toThrow()
    await expect(insertConversation('conv_schema_reversed', 'chat_bob', 'chat_alice')).rejects.toThrow()
  })

  it('私聊消息对发送者 nonce 唯一并声明全部外键', async () => {
    const foreignKeys = await env.DB.prepare('PRAGMA foreign_key_list(direct_messages)').all() as any
    const insertMessage = (id: string, nonce: string) => env.DB.prepare(`
      INSERT INTO direct_messages (
        id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at
      ) VALUES (?, 'conv_schema', 'chat_alice', 'chat_bob', '你好', ?, datetime('now'))
    `).bind(id, nonce).run()

    expect(foreignKeys.results.map((key: { table: string }) => key.table)).toEqual(expect.arrayContaining([
      'direct_conversations',
      'students',
    ]))
    await insertMessage('dm_schema_first', 'direct-nonce-1')
    await expect(insertMessage('dm_schema_duplicate', 'direct-nonce-1')).rejects.toThrow()
  })

  it('在 0012 迁移中将历史 approved 消息转换为 visible', async () => {
    const message = await env.DB.prepare(`
      SELECT status FROM public_messages WHERE id = 'pm_chat_rework_migration_fixture'
    `).first() as { status: string } | null

    expect(message).toEqual({ status: 'visible' })
  })

  it('删除父消息和私聊会话时级联删除子记录', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('stu_chat_cascade_a', '级联甲', 'chat_cascade_a')"),
      env.DB.prepare("INSERT INTO students (id, name, slug) VALUES ('stu_chat_cascade_b', '级联乙', 'chat_cascade_b')"),
      env.DB.prepare(`
        INSERT INTO public_messages (id, author_slug, author_name, content, status)
        VALUES ('pm_cascade_parent', 'test_init', '测试同学', '级联回应消息', 'visible')
      `),
      env.DB.prepare(`
        INSERT INTO group_chat_reactions (message_id, reactor_slug, reaction, created_at)
        VALUES ('pm_cascade_parent', 'test_init', '🎉', datetime('now'))
      `),
      env.DB.prepare(`
        INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at)
        VALUES ('conv_cascade', 'chat_cascade_a', 'chat_cascade_b', datetime('now'), datetime('now'))
      `),
      env.DB.prepare(`
        INSERT INTO direct_messages (
          id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at
        ) VALUES ('dm_cascade', 'conv_cascade', 'chat_cascade_a', 'chat_cascade_b', '级联私聊', 'cascade-nonce', datetime('now'))
      `),
    ])

    await env.DB.batch([
      env.DB.prepare("DELETE FROM public_messages WHERE id = 'pm_cascade_parent'"),
      env.DB.prepare("DELETE FROM direct_conversations WHERE id = 'conv_cascade'"),
    ])

    const reaction = await env.DB.prepare("SELECT message_id FROM group_chat_reactions WHERE message_id = 'pm_cascade_parent'").first()
    const directMessage = await env.DB.prepare("SELECT id FROM direct_messages WHERE id = 'dm_cascade'").first()

    expect(reaction).toBeNull()
    expect(directMessage).toBeNull()
  })
})
