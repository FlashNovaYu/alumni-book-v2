import type { AdminAuditLog } from '@alumni/shared'

type AuditInput = Pick<AdminAuditLog, 'action' | 'resource_type' | 'resource_id' | 'reason' | 'before_summary' | 'after_summary'>

const actionTitles: Record<string, string> = {
  'album.create': '创建了相册',
  'album.update': '更新了相册',
  'album.delete': '删除了相册',
  'photo.update': '更新了照片信息',
  'photo.delete': '删除了照片',
  'file.upload': '上传了文件',
  'timeline_event.create': '创建了时光轴事件',
  'timeline_event.update': '更新了时光轴事件',
  'timeline_event.reorder': '调整了时光轴事件顺序',
  'timeline_event.delete': '删除了时光轴事件',
  'public_message.delete': '删除了历史公共投稿',
  'message.delete': '删除了个人留言',
  'message.approve': '通过了个人留言审核',
  'site_config.update': '更新了站点设置',
}

const fieldLabels: Record<string, string> = {
  title: '相册名称',
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

export function summarizeAuditLog(log: AuditInput) {
  const after = parseObject(log.after_summary)
  const title = typeof after?.title === 'string' && after.title.trim() ? `「${after.title.trim()}」` : ''
  const changed = Object.keys(after || {}).flatMap((key) => fieldLabels[key] ? [fieldLabels[key]] : [])
  const action = actionTitles[log.action]

  return {
    title: action ? `${action}${title}` : '完成了一项管理操作',
    detail: changed.length ? `修改了：${changed.join('、')}` : null,
    reason: log.reason || null,
  }
}
