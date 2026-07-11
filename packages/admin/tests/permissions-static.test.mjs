import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../src/views/DashboardView.vue', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/views/AdminLayout.vue', import.meta.url), 'utf8')
const accountsApi = readFileSync(new URL('../src/api/adminAccounts.ts', import.meta.url), 'utf8')
const accountsView = readFileSync(new URL('../src/views/AdminAccountsView.vue', import.meta.url), 'utf8')
const auditView = readFileSync(new URL('../src/views/AuditLogView.vue', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const messagesView = readFileSync(new URL('../src/views/MessagesView.vue', import.meta.url), 'utf8')
const mailView = readFileSync(new URL('../src/views/MailView.vue', import.meta.url), 'utf8')

assert.match(dashboard, /\/api\/admin\/workbench/)
assert.doesNotMatch(dashboard, /\/api\/admin\/stats/)
assert.doesNotMatch(dashboard, /studentCount|recentStudents|topVisited|auditAlerts/)

for (const [path, permission] of [
  ['students', 'students.manage'],
  ['albums', 'content.manage'],
  ['messages', 'moderation.view'],
  ['timeline', 'content.manage'],
  ['settings', 'site.settings.manage'],
  ['mail', 'notifications.view'],
  ['accounts', 'admins.manage'],
  ['audit-logs', 'audit.view'],
]) {
  assert.match(main, new RegExp(`path: '${path}'.*meta: \\{ permission: '${permission.replace('.', '\\.')}'\\s*\\}`))
}

assert.match(main, /canAccess\(admin, permission\)/)
assert.match(layout, /can\('students\.manage'\)/)
assert.match(layout, /can\('admins\.manage'\)/)

assert.match(accountsApi, /updateAdminAccount/)
assert.match(accountsApi, /resetAdminPassword/)
assert.match(accountsApi, /revokeAdminSessions/)
assert.match(accountsView, /权限覆盖/)
assert.match(accountsView, /最终权限/)
assert.match(accountsView, /重置密码/)
assert.match(accountsView, /撤销会话/)
assert.match(auditView, /操作人/)
assert.match(auditView, /资源类型/)
assert.match(auditView, /开始日期/)
assert.match(client, /changeAdminPassword/)
assert.match(main, /path: '\/change-password'/)
assert.match(main, /admin\.mustChangePassword/)
assert.match(messagesView, /canManage/)
assert.match(mailView, /canPublish/)

console.log('权限感知工作台静态检查通过')
