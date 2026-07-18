/** 只读 R2 孤儿对象报告；通过 owner-only Worker 运维接口读取，不执行任何删除。 */
const isRemote = process.argv.includes('--remote')
const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length)
const baseUrl = baseUrlArg || process.env.OPS_BASE_URL || (isRemote ? '' : 'http://127.0.0.1:8787')
const token = process.env.OPS_ADMIN_TOKEN

if (!baseUrl || !token) throw new Error('只读报告需要 --base-url/OPS_BASE_URL 与 OPS_ADMIN_TOKEN')
if (isRemote && !baseUrl.startsWith('https://')) throw new Error('--remote 必须使用 HTTPS 运维地址')

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/admin/operations/r2-orphans`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!response.ok) throw new Error(`运维报告请求失败：HTTP ${response.status}`)

const body = await response.json() as { data?: Record<string, unknown> }
console.log(JSON.stringify({ mode: isRemote ? 'remote-read-only' : 'local-read-only', ...body.data }, null, 2))
