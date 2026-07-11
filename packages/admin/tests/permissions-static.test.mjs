import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../src/views/DashboardView.vue', import.meta.url), 'utf8')

assert.match(dashboard, /\/api\/admin\/workbench/)
assert.doesNotMatch(dashboard, /\/api\/admin\/stats/)
assert.doesNotMatch(dashboard, /studentCount|recentStudents|topVisited|auditAlerts/)

console.log('权限感知工作台静态检查通过')
