import type { AdminAuditLog } from '@alumni/shared'

type AuditInput = Pick<AdminAuditLog, 'action' | 'resource_type' | 'resource_id' | 'reason' | 'before_summary' | 'after_summary'>

const actionTitles: Record<string, string> = {
  // 管理员账号相关
  'admin_account.create': '创建了管理员账号',
  'admin_account.update': '更新了管理员账号',
  'admin_account.disable': '禁用了管理员账号',
  'admin_account.reset_password': '重置了管理员密码',
  'admin_account.revoke_sessions': '下线了管理员会话',
  'admin_account.change_password': '修改了管理密码',

  // 同学档案相关
  'student.create': '创建了同学档案',
  'student.update': '更新了同学档案',
  'student.delete': '删除了同学档案',

  // 相册及照片相关
  'album.create': '创建了相册',
  'album.update': '更新了相册',
  'album.delete': '删除了相册',
  'photo.update': '更新了照片信息',
  'photo.delete': '删除了照片',

  // 留言与公共投稿相关
  'message.approve': '通过了个人留言审核',
  'message.hide': '隐藏了个人留言',
  'message.unhide': '取消隐藏了个人留言',
  'message.pin': '置顶了个人留言',
  'message.unpin': '取消置顶了个人留言',
  'message.delete': '删除了个人留言',
  'message.batch_approve': '批量通过了个人留言',
  'message.batch_hide': '批量隐藏了个人留言',
  'message.batch_delete': '批量删除了个人留言',

  'public_message.approve': '通过了公共投稿审核',
  'public_message.reject': '驳回了公共投稿',
  'public_message.hide': '隐藏了公共投稿',
  'public_message.unhide': '取消隐藏了公共投稿',
  'public_message.pin': '置顶了公共投稿',
  'public_message.unpin': '取消置顶了公共投稿',
  'public_message.feature': '设为了精选公共投稿',
  'public_message.unfeature': '取消了精选公共投稿',
  'public_message.delete': '删除了公共投稿',
  'approve': '通过了投稿审核',
  'reject': '驳回了投稿审核',

  // 系统通知相关
  'notification.send': '发送了后台通知',
  'notification.broadcast': '广播了全局通知',

  // 时光轴、文件与设置
  'timeline_event.create': '创建了时光轴事件',
  'timeline_event.update': '更新了时光轴事件',
  'timeline_event.reorder': '调整了时光轴事件顺序',
  'timeline_event.delete': '删除了时光轴事件',
  'file.upload': '上传了文件',
  'site_config.update': '更新了站点设置',
}

const fieldLabels: Record<string, string> = {
  title: '标题/名称',
  name: '姓名',
  displayName: '显示名称',
  username: '用户名',
  role: '角色',
  status: '状态',
  slug: '专属标识',
  description: '描述',
  coverR2Key: '封面照片',
  featured: '精选状态',
  eventDate: '日期',
  eventType: '事件类型',
  isMilestone: '里程碑',
  photoR2Key: '事件照片',
  siteName: '站点名称',
  className: '班级名称',
  classYear: '届别',
  shareDescription: '分享摘要',
  isApproved: '审核状态',
  isHidden: '隐藏状态',
  pinned: '置顶状态',
  avatarUrl: '头像',
  bio: '个人简介',
  content: '留言内容',
  filename: '文件名',
  r2Key: '存储路径',
  sessionsRevoked: '下线会话',
  changedFields: '修改字段项',
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractResourceLabel(after: Record<string, unknown> | null, before: Record<string, unknown> | null, resourceId?: string): string {
  const candidateKeys = ['title', 'name', 'displayName', 'username', 'filename', 'authorName', 'slug']
  
  for (const obj of [after, before]) {
    if (!obj) continue
    for (const key of candidateKeys) {
      const val = obj[key]
      if (typeof val === 'string' && val.trim()) {
        return `「${val.trim()}」`
      }
    }
  }

  // 若后边有 album 内部字段或 student 资源 ID
  if (before?.album && typeof (before.album as any).title === 'string') {
    return `「${((before.album as any).title as string).trim()}」`
  }

  if (resourceId && !resourceId.startsWith('audit_') && !resourceId.includes('-') && resourceId.length <= 20) {
    return `「${resourceId}」`
  }

  return ''
}

export function summarizeAuditLog(log: AuditInput) {
  const after = parseObject(log.after_summary)
  const before = parseObject(log.before_summary)
  const label = extractResourceLabel(after, before, log.resource_id)
  
  let changedKeys: string[] = []
  if (after) {
    changedKeys = Object.keys(after).filter(k => fieldLabels[k])
    if (Array.isArray(after.changedFields)) {
      const extraFields = (after.changedFields as string[])
        .map(f => fieldLabels[f] || f)
      changedKeys.push(...extraFields)
    }
  }
  
  const changedLabels = Array.from(new Set(changedKeys.map(k => fieldLabels[k] || k)))
  const action = actionTitles[log.action]

  return {
    title: action ? `${action}${label}` : (label ? `处理了 ${label}` : '完成了一项管理操作'),
    detail: changedLabels.length ? `修改了：${changedLabels.join('、')}` : null,
    reason: log.reason || null,
  }
}

