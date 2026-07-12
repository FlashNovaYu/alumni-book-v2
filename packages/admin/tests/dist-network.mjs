import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')

assert.match(
  viteConfig,
  /process\.env\.VITE_API_BASE_URL\s*\?\?\s*['"]['"]/,
  'Vite 的 API 默认基址必须为空，以便生产构建使用同源 /api',
)

async function listAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listAssets(path))
    else if (['.html', '.js', '.css'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const forbidden = [
  { pattern: /workers\.dev/i, reason: 'Cloudflare Worker 公网域名' },
  { pattern: /https?:\/\/[^\s"'`]+\/api(?:\/|\b)/i, reason: '绝对 API 地址' },
]

const violations = []
for (const file of await listAssets(distDirectory)) {
  const content = await readFile(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      violations.push(`${file}: ${rule.reason}`)
    }
  }
}

assert.deepEqual(
  violations,
  [],
  `后台构建产物必须只使用同源 API：\n${violations.join('\n')}`,
)

console.log('后台构建产物同源 API 门禁通过')
