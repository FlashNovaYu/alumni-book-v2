import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../src/views/ChangeAdminPasswordView.vue', import.meta.url), 'utf8')

assert.match(view, /修改初始密码/)
assert.match(view, /旧密码/)
assert.match(view, /确认新密码/)
assert.match(view, /changeAdminPassword/)

console.log('管理员强制改密界面静态检查通过')
