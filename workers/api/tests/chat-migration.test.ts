import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import { legacyChatMigrationStatements, assertChatMigrationReport } from '../../../scripts/lib/chatMigration'

const STUDENT_A = 'direct-student-a'
const STUDENT_B = 'direct-student-b'
const STUDENT_C = 'direct-student-c'

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
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status) VALUES ('direct-id-c', '同学丙', ?, 'active')").bind(STUDENT_C),
  ])
})

describe('Legacy Chat Migration Core', () => {
  it('performs idempotent migration for private threads, admin notices and public entries', async () => {
    // 1. 构造双向私信 Fixture
    // Thread 1: A -> B
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

    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m1-2', ?, 'student', ?, 'reply from B 1', '2026-01-01 10:05:00')"
    ).bind(t1, STUDENT_B).run()

    // Thread 2: B -> A
    const t2 = 'thread-2'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'Subject 2', 'private', 'student', ?)"
    ).bind(t2, STUDENT_B).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m2-1', ?, 'student', ?, 'hello A 2', '2026-01-01 10:10:00')"
    ).bind(t2, STUDENT_B).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('r2-1', ?, ?, '2026-01-01 10:11:00')"
    ).bind(t2, STUDENT_A).run()

    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('m2-2', ?, 'student', ?, 'reply from A 2', '2026-01-01 10:15:00')"
    ).bind(t2, STUDENT_A).run()

    // 2. 构造管理员/系统信件 Fixture
    const tAdmin = 'thread-admin'
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug) VALUES (?, 'System Alert', 'private', 'admin', 'admin-user')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('ma-1', ?, 'admin', NULL, 'system check 1', '2026-01-01 11:00:00')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('ma-2', ?, 'admin', NULL, 'system check 2', '2026-01-01 11:05:00')"
    ).bind(tAdmin).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('ra-1', ?, ?, NULL)"
    ).bind(tAdmin, STUDENT_A).run()

    // 3. 构造公开留言 Fixture (保持状态)
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pub-1', ?, '同学甲', 'public content', 'pending')"
    ).bind(STUDENT_A).run()

    // --- 第一次迁移 ---
    const { statements: stmt1, report: r1 } = await legacyChatMigrationStatements(env.DB)
    
    // 断言第一次迁移报告数据符合预期
    expect(r1.conversationsCreated).toBe(1)
    expect(r1.messagesMigrated).toBe(4)
    expect(r1.notificationsCreated).toBe(1)
    expect(r1.anomalies).toBe(0)
    
    assertChatMigrationReport(r1) // 应不报错

    // 执行迁移 SQL
    for (const sql of stmt1) {
      await env.DB.prepare(sql).run()
    }

    // 验证私聊会话已生成并合并
    const convs = await env.DB.prepare('SELECT * FROM direct_conversations').all()
    expect(convs.results).toHaveLength(1)
    const conv = convs.results[0] as any
    expect(conv.participant_a_slug).toBe(STUDENT_A)
    expect(conv.participant_b_slug).toBe(STUDENT_B)
    expect(conv.updated_at).toBe('2026-01-01 10:15:00') // 应与最新一条消息时间吻合

    // 验证私聊消息已生成且排序/nonce 正确
    const msgs = await env.DB.prepare('SELECT * FROM direct_messages ORDER BY created_at ASC').all()
    expect(msgs.results).toHaveLength(4)
    const m1 = msgs.results[0] as any
    expect(m1.id).toBe('migrated_mailmsg_m1-1')
    expect(m1.client_nonce).toBe('legacy:m1-1')
    expect(m1.body).toBe('hello B 1')

    const m4 = msgs.results[3] as any
    expect(m4.id).toBe('migrated_mailmsg_m2-2')
    expect(m4.client_nonce).toBe('legacy:m2-2')
    expect(m4.body).toBe('reply from A 2')

    // 验证 admin 通知生成且内容按时序拼接
    const notifs = await env.DB.prepare('SELECT * FROM notifications').all()
    expect(notifs.results).toHaveLength(1)
    const notif = notifs.results[0] as any
    expect(notif.id).toBe(`migrated_notice_${tAdmin}_${STUDENT_A}`)
    expect(notif.recipient_slug).toBe(STUDENT_A)
    expect(notif.type).toBe('admin_notice')
    expect(notif.title).toBe('System Alert')
    expect(notif.body).toContain('[管理员]: system check 1')
    expect(notif.body).toContain('[管理员]: system check 2')
    
    // 验证 public 留言状态未受影响
    const pub = await env.DB.prepare("SELECT status FROM public_messages WHERE id = 'pub-1'").first() as any
    expect(pub.status).toBe('pending')

    // --- 第二次迁移 (幂等性校验) ---
    const { statements: stmt2, report: r2 } = await legacyChatMigrationStatements(env.DB)
    expect(r2.conversationsCreated).toBe(0)
    expect(r2.messagesMigrated).toBe(0)
    expect(r2.notificationsCreated).toBe(0)
    expect(r2.anomalies).toBe(0)

    // 执行第二次生成的 SQL（应该无变化或无错执行）
    for (const sql of stmt2) {
      await env.DB.prepare(sql).run()
    }

    const convs2 = await env.DB.prepare('SELECT * FROM direct_conversations').all()
    expect(convs2.results).toHaveLength(1)
    const msgs2 = await env.DB.prepare('SELECT * FROM direct_messages').all()
    expect(msgs2.results).toHaveLength(4)
    const notifs2 = await env.DB.prepare('SELECT * FROM notifications').all()
    expect(notifs2.results).toHaveLength(1)
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

    const { report } = await legacyChatMigrationStatements(env.DB)
    expect(report.anomalies).toBeGreaterThan(0)
    expect(() => assertChatMigrationReport(report)).toThrow()
  })
})
