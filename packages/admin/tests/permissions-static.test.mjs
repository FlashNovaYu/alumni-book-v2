import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../src/views/DashboardView.vue', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/views/AdminLayout.vue', import.meta.url), 'utf8')

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

console.log('权限感知工作台静态检查通过')
