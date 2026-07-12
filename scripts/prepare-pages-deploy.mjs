import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const siteDist = join(rootDir, 'packages/site-astro/dist')
const adminDist = join(rootDir, 'packages/admin/dist')
const functionsDir = join(rootDir, 'packages/site-astro/functions')
const deployDir = join(rootDir, 'deploy')
const workerOut = join(deployDir, '_worker.js')
const routesOut = join(deployDir, '_routes.json')
const pnpmCli = process.env.npm_execpath
const releaseSha = (process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: rootDir,
  encoding: 'utf8',
})).trim()

if (!existsSync(siteDist) || !existsSync(adminDist)) {
  throw new Error('缺少 Site 或 Admin 构建产物，请先完成两个构建')
}
if (!pnpmCli) throw new Error('无法定位 pnpm CLI，请通过 pnpm prepare:pages 运行')
if (!/^[0-9a-f]{40}$/i.test(releaseSha)) throw new Error('RELEASE_SHA 必须是完整提交 SHA')

rmSync(deployDir, { recursive: true, force: true })
mkdirSync(deployDir, { recursive: true })
cpSync(siteDist, deployDir, { recursive: true })
mkdirSync(join(deployDir, 'admin'), { recursive: true })
cpSync(adminDist, join(deployDir, 'admin'), { recursive: true })
writeFileSync(
  join(deployDir, 'release.json'),
  `${JSON.stringify({ source: releaseSha })}\n`,
  'utf8',
)

execFileSync(process.execPath, [
  pnpmCli,
  '--filter', 'worker',
  'exec', 'wrangler',
  'pages', 'functions', 'build',
  functionsDir,
  '--outdir', workerOut,
  '--output-routes-path', routesOut,
  '--project-directory', join(rootDir, 'packages/site-astro'),
  '--compatibility-date', '2024-10-22',
  '--minify',
], { cwd: rootDir, stdio: 'inherit' })

const workerEntry = join(workerOut, 'index.js')
if (!existsSync(workerEntry)) {
  throw new Error('Pages Worker 构建产物缺少 _worker.js/index.js')
}

const routes = JSON.parse(readFileSync(routesOut, 'utf8'))
for (const route of ['/api/*', '/student/*']) {
  if (!routes.include.includes(route)) {
    throw new Error(`Pages Function 路由缺少 ${route}`)
  }
}

const forbiddenHost = 'alumni-book-api.chenyuhao2263.workers.dev'
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.txt', '.xml'])

function scan(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    if (statSync(file).isDirectory()) {
      scan(file)
      continue
    }
    if (!textExtensions.has(extname(file)) && name !== '_worker.js') continue
    if (readFileSync(file, 'utf8').includes(forbiddenHost)) {
      throw new Error(`生产产物仍包含公开 Worker 地址：${file}`)
    }
  }
}

scan(deployDir)
console.log(`Pages deployment prepared at ${deployDir}`)
