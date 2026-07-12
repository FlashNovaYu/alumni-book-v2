import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')

assert.match(client, /from ['"]\.\/network['"]/, '认证客户端必须复用统一网络模块')
assert.match(client, /requestJson/, '认证客户端必须通过 requestJson 发起请求')
assert.match(client, /export async function verifyAdminToken/, '认证客户端必须统一提供 Token 验证')
assert.match(client, /error\.status\s*!==\s*undefined/, '明确的 HTTP 错误必须判定 Token 验证失败')
assert.doesNotMatch(client, /\bfetch\s*\(/, '认证客户端不得绕过统一网络模块直接 fetch')

assert.match(main, /fetchCurrentAdmin/, '路由守卫必须通过统一客户端加载当前管理身份')
assert.match(main, /sessionStorage\.getItem\('admin_token'\)/, '网络异常时必须根据令牌是否仍存在决定是否清理会话')
assert.doesNotMatch(main, /\bfetch\s*\(/, '路由守卫不得直接 fetch')

console.log('后台认证网络整合静态契约通过')
