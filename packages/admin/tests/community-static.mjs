import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = resolve(import.meta.dirname, '../src')
const read = (path) => readFileSync(resolve(src, path), 'utf-8')

assert.equal(existsSync(resolve(src, 'api/community.ts')), true, '缺少后台社群治理 API 客户端')
const client = read('api/community.ts')
for (const endpoint of [
  '/api/admin/group-chat/messages',
  '/api/admin/group-chat/mutes',
  '/api/admin/notifications/send',
  '/api/admin/notifications/broadcast',
  '/api/admin/notifications/history',
]) assert.match(client, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
for (const action of ['adminFetch', 'setGroupChatHidden', 'recallGroupChatMessage', 'muteClassmate', 'unmuteClassmate']) {
  assert.match(client, new RegExp(action))
}

const messages = read('views/MessagesView.vue')
for (const label of ['个人留言', '公共群聊', '历史公共投稿', '隐藏', '恢复', '管理员撤回', '禁言', '解除禁言']) {
  assert.match(messages, new RegExp(label))
}
for (const action of ['fetchGroupChatMessages', 'setGroupChatHidden', 'recallGroupChatMessage', 'muteClassmate', 'unmuteClassmate']) {
  assert.match(messages, new RegExp(action))
}
assert.match(messages, /loadVersion/)

const mail = read('views/MailView.vue')
const layout = read('views/AdminLayout.vue')
const main = read('main.ts')
for (const token of ['通知中心', 'sendAdminNotification', 'broadcastAdminNotification', 'fetchAdminNotificationHistory']) {
  assert.match(mail, new RegExp(token))
}
assert.doesNotMatch(mail, /allowReply/)
assert.doesNotMatch(mail, /\/api\/admin\/mail\//)
assert.match(mail, /historyRequest/)
assert.match(layout, /通知中心/)
assert.match(main, /path: 'mail', name: 'notifications'/)

console.log('后台社群治理与通知中心静态契约通过')
