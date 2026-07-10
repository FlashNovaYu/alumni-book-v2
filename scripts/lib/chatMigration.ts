export interface ChatMigrationReport {
  conversationsCreated: number;
  messagesMigrated: number;
  notificationsCreated: number;
  anomalies: number;
}

export function assertChatMigrationReport(report: ChatMigrationReport): void {
  if (report.anomalies > 0) {
    throw new Error(`Migration completed with ${report.anomalies} anomalies!`);
  }
}

// 辅助函数：转义 SQL 字符串中的单引号
function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''");
}

export async function legacyChatMigrationStatements(db: any): Promise<{
  statements: string[];
  report: ChatMigrationReport;
}> {
  const statements: string[] = [];
  
  let conversationsCreated = 0;
  let messagesMigrated = 0;
  let notificationsCreated = 0;
  let anomalies = 0;

  // 1. 获取所有合法学生的 slug
  const studentsResult = await db.prepare('SELECT slug FROM students').all();
  const existingSlugs = new Set<string>((studentsResult.results || []).map((s: any) => s.slug));

  // 2. 获取现存的私聊会话，以便去重/复用
  const convsResult = await db.prepare('SELECT id, participant_a_slug, participant_b_slug FROM direct_conversations').all();
  const existingConvs = new Map<string, string>(); // 'slug_a:slug_b' -> convId
  for (const c of convsResult.results || []) {
    const key = `${c.participant_a_slug}:${c.participant_b_slug}`;
    existingConvs.set(key, c.id);
  }

  // 3. 获取已存在的私聊消息 ID
  const msgsResult = await db.prepare('SELECT id FROM direct_messages').all();
  const existingMsgIds = new Set<string>((msgsResult.results || []).map((m: any) => m.id));

  // 4. 获取已存在的 notifications ID
  const notifsResult = await db.prepare("SELECT id FROM notifications WHERE type = 'admin_notice'").all();
  const existingNotifIds = new Set<string>((notifsResult.results || []).map((n: any) => n.id));

  // 用于在本次迁移中跟踪新建的会话，避免在同一个 batch 里重复生成同一个会话的 INSERT
  const newlyCreatedConvs = new Map<string, string>(); // 'slug_a:slug_b' -> convId
  // 记录每个会话迁移的消息中的最新时间，用于在最后更新 updated_at
  const convLatestTimeMap = new Map<string, string>(); // convId -> latest time string

  // ==================== (一) 迁移双人私聊信件 ====================
  // 查询所有的私人信件，同时拉取其消息和收件人信息
  const privateMails = await db.prepare(`
    SELECT 
      t.id AS thread_id,
      t.subject AS thread_subject,
      t.created_by_slug AS creator_slug,
      m.id AS msg_id,
      m.sender_slug,
      m.body,
      m.created_at,
      r.recipient_slug,
      r.read_at
    FROM mail_threads t
    JOIN mail_messages m ON m.thread_id = t.id
    JOIN mail_recipients r ON r.thread_id = t.id
    WHERE t.thread_type = 'private' AND t.created_by_type = 'student'
    ORDER BY m.created_at ASC, m.id ASC
  `).all();

  for (const row of privateMails.results || []) {
    const creatorSlug = row.creator_slug;
    const recipientSlug = row.recipient_slug;
    const senderSlug = row.sender_slug;

    // 校验参与者是否存在
    let hasAnomaly = false;
    if (!creatorSlug || !existingSlugs.has(creatorSlug)) {
      anomalies++;
      hasAnomaly = true;
    }
    if (!recipientSlug || !existingSlugs.has(recipientSlug)) {
      anomalies++;
      hasAnomaly = true;
    }
    if (!senderSlug || !existingSlugs.has(senderSlug)) {
      anomalies++;
      hasAnomaly = true;
    }

    if (hasAnomaly) {
      continue; // 发生异常，跳过此消息迁移
    }

    // 确定当前消息的接收人
    let msgRecipientSlug = '';
    if (senderSlug === creatorSlug) {
      msgRecipientSlug = recipientSlug;
    } else if (senderSlug === recipientSlug) {
      msgRecipientSlug = creatorSlug;
    } else {
      // 发送人既不是创建者也不是收信人，异常数据
      anomalies++;
      continue;
    }

    // 建立双人对
    const pA = senderSlug < msgRecipientSlug ? senderSlug : msgRecipientSlug;
    const pB = senderSlug > msgRecipientSlug ? senderSlug : msgRecipientSlug;
    const pairKey = `${pA}:${pB}`;

    let convId = existingConvs.get(pairKey) || newlyCreatedConvs.get(pairKey);

    if (!convId) {
      // 产生新的会话 ID
      convId = `conv_migrated_${pA}_${pB}`;
      newlyCreatedConvs.set(pairKey, convId);
      
      const escPA = escapeSqlString(pA);
      const escPB = escapeSqlString(pB);
      const timeStr = row.created_at;

      statements.push(
        `INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at) VALUES ('${convId}', '${escPA}', '${escPB}', '${timeStr}', '${timeStr}')`
      );
      conversationsCreated++;
    }

    // 拼装迁移后的消息
    const targetMsgId = `migrated_mailmsg_${row.msg_id}`;
    const clientNonce = `legacy:${row.msg_id}`;

    if (!existingMsgIds.has(targetMsgId)) {
      const escBody = escapeSqlString(row.body);
      const escSender = escapeSqlString(senderSlug);
      const escRecipient = escapeSqlString(msgRecipientSlug);
      const timeStr = row.created_at;
      const readAtVal = row.read_at ? `'${escapeSqlString(row.read_at)}'` : 'NULL';

      statements.push(
        `INSERT OR IGNORE INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES ('${targetMsgId}', '${convId}', '${escSender}', '${escRecipient}', '${escBody}', '${clientNonce}', ${readAtVal}, '${timeStr}')`
      );
      messagesMigrated++;

      // 更新最新消息时间
      const currentLatest = convLatestTimeMap.get(convId) || '';
      if (timeStr > currentLatest) {
        convLatestTimeMap.set(convId, timeStr);
      }
    }
  }

  // 为新建或更新的会话，刷一下最新的 updated_at
  for (const [convId, latestTime] of convLatestTimeMap.entries()) {
    statements.push(
      `UPDATE direct_conversations SET updated_at = '${latestTime}' WHERE id = '${convId}'`
    );
  }

  // ==================== (二) 迁移系统/管理员信件为通知 ====================
  // 查询所有的管理员/系统信件线
  const adminThreads = await db.prepare(`
    SELECT id, subject, created_at
    FROM mail_threads
    WHERE created_by_type = 'admin' OR created_by_type = 'system'
  `).all();

  for (const thread of adminThreads.results || []) {
    const threadId = thread.id;
    const subject = thread.subject || '系统通知';

    // 每一个主题线可能发给了多个收件人，我们需要为每个收件人分别聚合消息并创建一条通知
    const recipients = await db.prepare(
      'SELECT recipient_slug, read_at FROM mail_recipients WHERE thread_id = ?'
    ).bind(threadId).all();

    for (const r of recipients.results || []) {
      const recSlug = r.recipient_slug;
      if (!recSlug || !existingSlugs.has(recSlug)) {
        anomalies++;
        continue;
      }

      const notifId = `migrated_notice_${threadId}_${recSlug}`;

      if (existingNotifIds.has(notifId)) {
        continue; // 通知已生成，跳过
      }

      // 获取当前 thread 下所有的消息，按时间、ID排序进行拼装
      const msgs = await db.prepare(
        'SELECT sender_type, body, created_at FROM mail_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC'
      ).bind(threadId).all();

      const bodyLines: string[] = [];
      let latestMsgTime = thread.created_at;

      for (const m of msgs.results || []) {
        const label = m.sender_type === 'admin' ? '[管理员]' : '[系统邮局]';
        bodyLines.push(`${label}: ${m.body}`);
        if (m.created_at && m.created_at > latestMsgTime) {
          latestMsgTime = m.created_at;
        }
      }

      const fullBody = bodyLines.join('\n');
      const escTitle = escapeSqlString(subject);
      const escBody = escapeSqlString(fullBody);
      const escRecipient = escapeSqlString(recSlug);
      const readAtVal = r.read_at ? `'${escapeSqlString(r.read_at)}'` : 'NULL';

      statements.push(
        `INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id, read_at, created_at) VALUES ('${notifId}', '${escRecipient}', 'admin_notice', '${escTitle}', '${escBody}', 'legacy_mail_thread', '${threadId}', ${readAtVal}, '${latestMsgTime}')`
      );
      notificationsCreated++;
    }
  }

  return {
    statements,
    report: {
      conversationsCreated,
      messagesMigrated,
      notificationsCreated,
      anomalies
    }
  };
}
