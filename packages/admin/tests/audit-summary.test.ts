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
  assert.equal(summary.detail, '修改了：标题/名称、封面照片、精选状态')
})

test('解析管理员账号创建与禁用日志', () => {
  const createSummary = summarizeAuditLog({
    action: 'admin_account.create', resource_type: 'admin_account', resource_id: 'acc_123', reason: null,
    before_summary: null,
    after_summary: JSON.stringify({ displayName: '副管理员小王', role: 'editor', status: 'active' }),
  } as any)

  assert.equal(createSummary.title, '创建了管理员账号「副管理员小王」')
  assert.equal(createSummary.detail, '修改了：显示名称、角色、状态')

  const disableSummary = summarizeAuditLog({
    action: 'admin_account.disable', resource_type: 'admin_account', resource_id: 'acc_123', reason: '违反安全守则',
    before_summary: JSON.stringify({ displayName: '副管理员小王', status: 'active' }),
    after_summary: JSON.stringify({ status: 'disabled' }),
  } as any)

  assert.equal(disableSummary.title, '禁用了管理员账号「副管理员小王」')
  assert.equal(disableSummary.detail, '修改了：状态')
  assert.equal(disableSummary.reason, '违反安全守则')
})

test('解析同学档案更新与删除日志', () => {
  const updateSummary = summarizeAuditLog({
    action: 'student.update', resource_type: 'student', resource_id: 'zhangsan', reason: null,
    before_summary: JSON.stringify({ name: '张三' }),
    after_summary: JSON.stringify({ name: '张三', changedFields: ['bio', 'avatarUrl'] }),
  } as any)

  assert.equal(updateSummary.title, '更新了同学档案「张三」')
  assert.equal(updateSummary.detail, '修改了：姓名、修改字段项、个人简介、头像')

  const deleteSummary = summarizeAuditLog({
    action: 'student.delete', resource_type: 'student', resource_id: 'lisi', reason: '重复数据清洗',
    before_summary: JSON.stringify({ name: '李四', slug: 'lisi' }),
    after_summary: null,
  } as any)

  assert.equal(deleteSummary.title, '删除了同学档案「李四」')
  assert.equal(deleteSummary.reason, '重复数据清洗')
})

test('解析投稿与留言审核日志', () => {
  const approveSummary = summarizeAuditLog({
    action: 'public_message.approve', resource_type: 'public_message', resource_id: 'msg_999', reason: null,
    before_summary: null,
    after_summary: JSON.stringify({ isApproved: true, authorName: '王五' }),
  } as any)

  assert.equal(approveSummary.title, '通过了公共投稿审核「王五」')
  assert.equal(approveSummary.detail, '修改了：审核状态')
})

test('未知旧日志不泄露内部动作和资源 ID', () => {
  const summary = summarizeAuditLog({
    action: 'future.action', resource_type: 'future_resource', resource_id: 'secret_uuid_12345-67890', reason: null,
    before_summary: null, after_summary: null,
  } as any)

  assert.equal(summary.title, '完成了一项管理操作')
  assert.equal(summary.detail, null)
})

