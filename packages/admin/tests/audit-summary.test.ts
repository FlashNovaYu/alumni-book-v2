import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeAuditLog } from '../src/utils/auditSummary'

test('将相册更新转换为中文字段摘要', () => {
  const summary = summarizeAuditLog({
    action: 'album.update', resource_type: 'album', resource_id: 'album_internal_id', reason: null,
    before_summary: JSON.stringify({ title: '旧相册' }),
    after_summary: JSON.stringify({ title: '毕业旅行', coverR2Key: 'photos/cover.jpg', featured: true }),
  } as any)

  assert.equal(summary.title, '更新了相册「毕业旅行」')
  assert.equal(summary.detail, '修改了：相册名称、封面照片、精选状态')
})

test('未知旧日志不泄露内部动作和资源 ID', () => {
  const summary = summarizeAuditLog({
    action: 'future.action', resource_type: 'future_resource', resource_id: 'secret_id', reason: null,
    before_summary: null, after_summary: null,
  } as any)

  assert.equal(summary.title, '完成了一项管理操作')
  assert.equal(summary.detail, null)
})
