export interface ChatMigrationReport {
  sourcePrivateThreads: number;
  sourcePrivateMessages: number;
  directConversations: number;
  directMessages: number;
  migratedNotifications: number;
  anomalies: number;
}

export function assertChatMigrationReport(report: ChatMigrationReport): void {
  if (report.anomalies > 0) {
    throw new Error(`Migration completed with ${report.anomalies} anomalies!`);
  }
}

// 静态 SQL 语句数组，使用纯 SQL 表达式进行在数据库内部的原子迁移，杜绝任何 JS 变量插值拼接及引号转义风险
export const legacyChatMigrationStatements: string[] = [
  // 1. 迁移私聊会话 (对 slugs 排序拼接作为稳定会话 ID，支持幂等合并)
  `INSERT OR IGNORE INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at)
   SELECT
     'conv_' || CASE WHEN t.created_by_slug < r.recipient_slug THEN t.created_by_slug ELSE r.recipient_slug END || '_' || CASE WHEN t.created_by_slug < r.recipient_slug THEN r.recipient_slug ELSE t.created_by_slug END AS id,
     CASE WHEN t.created_by_slug < r.recipient_slug THEN t.created_by_slug ELSE r.recipient_slug END AS participant_a_slug,
     CASE WHEN t.created_by_slug < r.recipient_slug THEN r.recipient_slug ELSE t.created_by_slug END AS participant_b_slug,
     MIN(t.created_at) AS created_at,
     MAX(t.created_at) AS updated_at
   FROM mail_threads t
   JOIN mail_recipients r ON r.thread_id = t.id
   WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
     AND t.created_by_slug IS NOT NULL AND r.recipient_slug IS NOT NULL
     AND t.created_by_slug IN (SELECT slug FROM students)
     AND r.recipient_slug IN (SELECT slug FROM students)
   GROUP BY participant_a_slug, participant_b_slug`,

  // 2. 迁移私聊消息 (保留原 legacy message ID 作为新 ID，使用 client_nonce = 'legacy:<oldId>')
  `INSERT OR IGNORE INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at)
   SELECT
     m.id AS id,
     'conv_' || CASE WHEN t.created_by_slug < r.recipient_slug THEN t.created_by_slug ELSE r.recipient_slug END || '_' || CASE WHEN t.created_by_slug < r.recipient_slug THEN r.recipient_slug ELSE t.created_by_slug END AS conversation_id,
     m.sender_slug AS sender_slug,
     CASE WHEN m.sender_slug = t.created_by_slug THEN r.recipient_slug ELSE t.created_by_slug END AS recipient_slug,
     m.body AS body,
     'legacy:' || m.id AS client_nonce,
     r.read_at AS read_at,
     m.created_at AS created_at
   FROM mail_messages m
   JOIN mail_threads t ON t.id = m.thread_id
   JOIN mail_recipients r ON r.thread_id = t.id
   WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
     AND t.created_by_slug IS NOT NULL AND r.recipient_slug IS NOT NULL
     AND m.sender_slug IS NOT NULL
     AND t.created_by_slug IN (SELECT slug FROM students)
     AND r.recipient_slug IN (SELECT slug FROM students)
     AND m.sender_slug IN (SELECT slug FROM students)`,

  // 3. 将会话 updated_at 同步为其中最新消息的 created_at (防并发打散)
  `UPDATE direct_conversations
   SET updated_at = (
     SELECT MAX(created_at)
     FROM direct_messages
     WHERE conversation_id = direct_conversations.id
   )
   WHERE EXISTS (
     SELECT 1 FROM direct_messages WHERE conversation_id = direct_conversations.id
   )`,

  // 4. 将系统和管理员邮件拼接为类型是 admin_notice 的通知 (使用子查询通过 julianday 及 ID 双重排序，保证拼接时序)
  `INSERT OR IGNORE INTO notifications (id, recipient_slug, type, title, body, related_type, related_id, read_at, created_at)
   SELECT
     'migrated_notice_' || thread_id || '_' || recipient_slug AS id,
     recipient_slug,
     'admin_notice' AS type,
     thread_subject AS title,
     group_concat(label_body, char(10)) AS body,
     'legacy_mail_thread' AS related_type,
     thread_id AS related_id,
     read_at,
     MAX(created_at) AS created_at
   FROM (
     SELECT
       m.thread_id,
       t.subject AS thread_subject,
       r.recipient_slug,
       r.read_at,
       (CASE WHEN m.sender_type = 'admin' THEN '[管理员]: ' ELSE '[系统邮局]: ' END || m.body) AS label_body,
       m.created_at
     FROM mail_messages m
     JOIN mail_recipients r ON r.thread_id = m.thread_id
     JOIN mail_threads t ON t.id = m.thread_id
     WHERE (t.created_by_type = 'admin' OR t.created_by_type = 'system')
       AND r.recipient_slug IN (SELECT slug FROM students)
     ORDER BY julianday(m.created_at) ASC, m.id ASC
   )
   GROUP BY thread_id, recipient_slug`
];

// 从数据库中实时提取、计算统计指标并发现 Anomalies 异常数据的只读扫描函数
export async function generateChatMigrationReport(db: any): Promise<ChatMigrationReport> {
  // 1. 源私聊线程数量
  const sourcePrivateThreadsRow = await db.prepare(
    "SELECT COUNT(*) as count FROM mail_threads WHERE thread_type = 'private' AND created_by_type = 'student'"
  ).first();
  const sourcePrivateThreads = Number(sourcePrivateThreadsRow?.count || 0);

  // 2. 源私有消息数量
  const sourcePrivateMessagesRow = await db.prepare(
    "SELECT COUNT(*) as count FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id WHERE t.thread_type = 'private' AND t.created_by_type = 'student'"
  ).first();
  const sourcePrivateMessages = Number(sourcePrivateMessagesRow?.count || 0);

  // 3. 目标私聊会话数量 (根据 stable 派生算法)
  const directConversationsRow = await db.prepare(
    "SELECT COUNT(*) as count FROM direct_conversations WHERE id LIKE 'conv_%'"
  ).first();
  const directConversations = Number(directConversationsRow?.count || 0);

  // 4. 目标私聊消息数量 (含有 legacy 前缀 nonce 的代表是从邮件系统里迁移过来的)
  const directMessagesRow = await db.prepare(
    "SELECT COUNT(*) as count FROM direct_messages WHERE client_nonce LIKE 'legacy:%'"
  ).first();
  const directMessages = Number(directMessagesRow?.count || 0);

  // 5. 目标迁移通知数量
  const migratedNotificationsRow = await db.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE id LIKE 'migrated_notice_%' AND type = 'admin_notice'"
  ).first();
  const migratedNotifications = Number(migratedNotificationsRow?.count || 0);

  // 6. Anomalies 统计：孤立或无法解析关联实体的脏数据
  // a) 私有收件人不存在于学生表
  const badPrivateRecipientsRow = await db.prepare(`
    SELECT COUNT(DISTINCT r.id) as count
    FROM mail_recipients r
    JOIN mail_threads t ON t.id = r.thread_id
    WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
      AND r.recipient_slug NOT IN (SELECT slug FROM students)
  `).first();
  const badPrivateRecipients = Number(badPrivateRecipientsRow?.count || 0);

  // b) 私有发件人不存在于学生表 (且不为系统/管理员类型)
  const badPrivateSendersRow = await db.prepare(`
    SELECT COUNT(DISTINCT m.id) as count
    FROM mail_messages m
    JOIN mail_threads t ON t.id = m.thread_id
    WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
      AND m.sender_type = 'student'
      AND m.sender_slug NOT IN (SELECT slug FROM students)
  `).first();
  const badPrivateSenders = Number(badPrivateSendersRow?.count || 0);

  // c) 私有会话创建人不存在于学生表
  const badPrivateCreatorsRow = await db.prepare(`
    SELECT COUNT(DISTINCT t.id) as count
    FROM mail_threads t
    WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
      AND t.created_by_slug NOT IN (SELECT slug FROM students)
  `).first();
  const badPrivateCreators = Number(badPrivateCreatorsRow?.count || 0);

  // d) 系统/管理员通知收件人不存在于学生表
  const badAdminRecipientsRow = await db.prepare(`
    SELECT COUNT(DISTINCT r.id) as count
    FROM mail_recipients r
    JOIN mail_threads t ON t.id = r.thread_id
    WHERE (t.created_by_type = 'admin' OR t.created_by_type = 'system')
      AND r.recipient_slug NOT IN (SELECT slug FROM students)
  `).first();
  const badAdminRecipients = Number(badAdminRecipientsRow?.count || 0);

  const anomalies = badPrivateRecipients + badPrivateSenders + badPrivateCreators + badAdminRecipients;

  return {
    sourcePrivateThreads,
    sourcePrivateMessages,
    directConversations,
    directMessages,
    migratedNotifications,
    anomalies
  };
}
