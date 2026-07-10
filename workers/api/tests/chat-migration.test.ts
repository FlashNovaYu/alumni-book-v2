import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import {
  legacyChatMigrationStatements,
  generateChatMigrationReport,
  assertChatMigrationReport
} from '../../../scripts/lib/chatMigration'

const STUDENT_A = "direct-student-a"
const STUDENT_B = "direct-student-b"
const STUDENT_C = "O'Connor" // 含有单引号的特殊 slug

beforeAll(async () => {
  await initTestDb(env.DB)
})

beforeEach(async () => {
  // 清理所有相关表
  await env.DB.batch([
    env.DB.prepare('DELETE FROM direct_messages'),
    env.DB.prepare('DELETE FROM direct_conversations'),
    env.DB.prepare('DELETE FROM notifications'),
    env.DB.prepare('DELETE FROM public_messages'),
    env.DB.prepare('DELETE FROM mail_messages'),
    env.DB.prepare('DELETE FROM mail_recipients'),
    env.DB.prepare('DELETE FROM mail_threads'),
    env.DB.prepare('DELETE FROM students'),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status) VALUES ('direct-id-a', '同学甲', ?, 'active')").bind(STUDENT_A),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status) VALUES ('direct-id-b', '同学乙', ?, 'active')").bind(STUDENT_B),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status) VALUES ('direct-id-c', '奥康纳', ?, 'active')").bind(STUDENT_C),
  ])
})

describe('Legacy Chat Migration Core', () => {
  it('performs idempotent migration for private threads, admin notices and public entries', async () => {
    // 1. 构造双向私信 Fixture
    // Thread 1: A -> B (含有单引号内容测试防注入)
    const t1 = 'thread-1'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'Subject 1', 'private', 'student', ?)"
    ).bind(t1, STUDENT_A).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m1-1', ?, 'student', ?, 'hello B 1', '2026-01-01 10:00:00')"
    ).bind(t1, STUDENT_A).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('r1-1', ?, ?, '2026-01-01 10:01:00')"
    ).bind(t1, STUDENT_B).run()

    // 含有单引号的消息内容：don't panic
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m1-2', ?, 'student', ?, 'don''t panic reply', '2026-01-01 10:05:00')"
    ).bind(t1, STUDENT_B).run()

    // Thread 2: B -> A
    const t2 = 'thread-2'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'Subject 2', 'private', 'student', ?)"
    ).bind(t2, STUDENT_B).run()

    // 制造相同创建时间 (created_at) 的多条消息，断言是否根据 ID 升序进行了重排
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m2-2-id-second', ?, 'student', ?, 'same-time second msg', '2026-01-01 10:10:00')"
    ).bind(t2, STUDENT_B).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('r2-1', ?, ?, '2026-01-01 10:11:00')"
    ).bind(t2, STUDENT_A).run()

    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m2-1-id-first', ?, 'student', ?, 'same-time first msg', '2026-01-01 10:10:00')"
    ).bind(t2, STUDENT_B).run()

    // 3. 构造与包含单引号的学生 C 发信信件
    const t3 = 'thread-quote'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'Subject Quote', 'private', 'student', ?)"
    ).bind(t3, STUDENT_C).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m3-1', ?, 'student', ?, 'O''Connor message', '2026-01-01 10:20:00')"
    ).bind(t3, STUDENT_C).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('r3-1', ?, ?, NULL)"
    ).bind(t3, STUDENT_A).run()

    // 4. 构造管理员/系统信件 Fixture (含有相同时间的消息，且发信内容带单引号)
    const tAdmin = 'thread-admin'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'System''s Alert', 'private', 'admin', 'admin-user')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('ma-2-second', ?, 'admin', NULL, 'system check 2', '2026-01-01 11:00:00')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('ma-1-first', ?, 'admin', NULL, 'system check 1', '2026-01-01 11:00:00')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('ra-1', ?, ?, NULL)"
    ).bind(tAdmin, STUDENT_A).run()

    // 5. 构造公开留言 Fixture (保持状态)
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pub-1', ?, '同学甲', 'public content', 'pending')"
    ).bind(STUDENT_A).run()

    // --- 第一次迁移 ---
    // 执行迁移 SQL
    for (const sql of legacyChatMigrationStatements) {
      await env.DB.prepare(sql).run()
    }

    const r1 = await generateChatMigrationReport(env.DB)
    
    // 断言第一次迁移报告数据符合预期
    expect(r1.sourcePrivateThreads).toBe(3)
    expect(r1.sourcePrivateMessages).toBe(5)
    expect(r1.directConversations).toBe(2) // A与B，A与C（奥康纳）
    expect(r1.directMessages).toBe(5)
    expect(r1.migratedNotifications).toBe(1)
    expect(r1.anomalies).toBe(0)
    
    assertChatMigrationReport(r1) // 应不报错

    // 验证私聊会话已生成并合并，ID是原 legacy ID，nonce 格式正确
    const convs = await env.DB.prepare("SELECT * FROM direct_conversations WHERE id = 'conv_direct-student-a_direct-student-b'").all()
    expect(convs.results).toHaveLength(1)
    const conv = convs.results[0] as any
    expect(conv.participant_a_slug).toBe(STUDENT_A)
    expect(conv.participant_b_slug).toBe(STUDENT_B)
    expect(conv.updated_at).toBe('2026-01-01 10:10:00')

    // 验证私聊消息排序/ID/nonce 正确
    const msgs = await env.DB.prepare("SELECT * FROM direct_messages WHERE conversation_id = 'conv_direct-student-a_direct-student-b' ORDER BY julianday(created_at) ASC, id ASC").all()
    expect(msgs.results).toHaveLength(4)

    // m1
    const m1 = msgs.results[0] as any
    expect(m1.id).toBe('m1-1') // 保留原 legacy message ID
    expect(m1.client_nonce).toBe('legacy:m1-1')
    expect(m1.body).toBe('hello B 1')

    // 相同时间消息的 ID 升序排列：m2-1-id-first 应该排在 m2-2-id-second 前面
    const mSecond = msgs.results[2] as any
    const mThird = msgs.results[3] as any
    expect(mSecond.id).toBe('m2-1-id-first')
    expect(mSecond.body).toBe('same-time first msg')
    expect(mThird.id).toBe('m2-2-id-second')
    expect(mThird.body).toBe('same-time second msg')

    // 验证单引号学生 C 的会话与消息被正确写入而无 SQL 崩溃
    const convsC = await env.DB.prepare("SELECT * FROM direct_conversations WHERE id = 'conv_O''Connor_direct-student-a'").all()
    expect(convsC.results).toHaveLength(1)
    const msgsC = await env.DB.prepare("SELECT * FROM direct_messages WHERE conversation_id = 'conv_O''Connor_direct-student-a'").all()
    expect(msgsC.results).toHaveLength(1)
    expect(msgsC.results[0].body).toBe("O'Connor message")

    // 验证 admin 通知生成且内容按时序（同一时间通过 ID 决胜）拼接，且有单引号
    const notifs = await env.DB.prepare('SELECT * FROM notifications').all()
    expect(notifs.results).toHaveLength(1)
    const notif = notifs.results[0] as any
    expect(notif.id).toBe(`migrated_notice_${tAdmin}_${STUDENT_A}`)
    expect(notif.recipient_slug).toBe(STUDENT_A)
    expect(notif.type).toBe('admin_notice')
    expect(notif.title).toBe("System's Alert")
    // 同一时刻，ma-1-first 必须被排在 ma-2-second 之前
    const expectedBody = '[管理员]: system check 1\n[管理员]: system check 2'
    expect(notif.body).toBe(expectedBody)
    
    // 验证 public 留言状态未受影响
    const pub = await env.DB.prepare("SELECT status FROM public_messages WHERE id = 'pub-1'").first() as any
    expect(pub.status).toBe('pending')

    // --- 第二次迁移 (幂等性校验) ---
    for (const sql of legacyChatMigrationStatements) {
      await env.DB.prepare(sql).run()
    }
    const r2 = await generateChatMigrationReport(env.DB)
    // 幂等下，目标创建数量应该保持一致，无新增变化
    expect(r2.directConversations).toBe(2)
    expect(r2.directMessages).toBe(5)
    expect(r2.migratedNotifications).toBe(1)
    expect(r2.anomalies).toBe(0)
  })

  it('detects anomalies for invalid student references', async () => {
    // 构造一个收件人不存在的异常信件
    const tBad = 'thread-bad'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'Bad', 'private', 'student', ?)"
    ).bind(tBad, STUDENT_A).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m-bad-1', ?, 'student', ?, 'hello', '2026-01-01 12:00:00')"
    ).bind(tBad, STUDENT_A).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('r-bad-1', ?, 'non-existent-student')"
    ).bind(tBad).run()

    const report = await generateChatMigrationReport(env.DB)
    expect(report.anomalies).toBeGreaterThan(0)
    expect(() => assertChatMigrationReport(report)).toThrow()
  })
})
