import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const selfHostedDir = join(rootDir, 'deploy', 'selfhosted')
const siteDist = join(rootDir, 'packages', 'site-astro', 'dist')
const adminDist = join(rootDir, 'packages', 'admin', 'dist')
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.txt', '.xml', '.map'])
const forbiddenHosts = ['alumni-book.pages.dev', 'alumni-book-api.chenyuhao2263.workers.dev', 'VITE_WORKER_URL']

export function getSelfHostedClientApiBase() {
  return ''
}

export function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function buildSelfHostedConfig({ apiBase } = {}) {
  const normalizedApiBase = normalizeApiBase(apiBase || process.env.SELF_HOST_API_BASE)
  if (!normalizedApiBase) throw new Error('自托管构建必须通过 --api-base 或 SELF_HOST_API_BASE 显式指定 API 地址')
  return {
    apiBase: normalizedApiBase,
    clientApiBase: getSelfHostedClientApiBase(),
    ssgApiBase: normalizedApiBase,
  }
}

export function assertSelfHostedArtifact(content, source) {
  if (forbiddenHosts.some((host) => content.includes(host))) {
    throw new Error(`自托管产物仍包含 Cloudflare 地址：${source}`)
  }
}

function scan(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    if (statSync(file).isDirectory()) {
      scan(file)
      continue
    }
    if (!textExtensions.has(extname(file))) continue
    assertSelfHostedArtifact(readFileSync(file, 'utf8'), file)
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export function buildSelfHosted({ apiBase } = {}) {
  const config = buildSelfHostedConfig({ apiBase })
  const pnpmCommand = process.platform === 'win32' ? process.execPath : 'pnpm'
  const pnpmPrefix = process.platform === 'win32'
    ? [join(process.env.APPDATA || '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')]
    : []
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    VITE_SSG_API_BASE: config.ssgApiBase,
    VITE_API_BASE_URL: config.clientApiBase,
  }
  execFileSync(pnpmCommand, [...pnpmPrefix, '--filter', 'admin', 'build'], { cwd: rootDir, env, stdio: 'inherit' })
  execFileSync(pnpmCommand, [...pnpmPrefix, '--filter', 'site-astro', 'build'], { cwd: rootDir, env, stdio: 'inherit' })
  if (!existsSync(siteDist) || !existsSync(adminDist)) throw new Error('Site 或 Admin 构建产物不存在')

  rmSync(selfHostedDir, { recursive: true, force: true })
  mkdirSync(selfHostedDir, { recursive: true })
  cpSync(siteDist, selfHostedDir, { recursive: true })
  mkdirSync(join(selfHostedDir, 'admin'), { recursive: true })
  cpSync(adminDist, join(selfHostedDir, 'admin'), { recursive: true })
  writeFileSync(join(selfHostedDir, 'release.json'), `${JSON.stringify({ source: process.env.RELEASE_SHA || 'local', target: 'aliyun-selfhosted', apiBase: config.apiBase })}\n`, 'utf8')
  scan(selfHostedDir)
  console.log(`Self-hosted deployment prepared at ${selfHostedDir}`)
}

if (process.argv[1]?.endsWith('build-selfhosted.mjs')) {
  buildSelfHosted({ apiBase: argument('--api-base') })
}
