import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const textExtensions = new Set(['.cjs', '.conf', '.css', '.html', '.js', '.json', '.mjs', '.md', '.service', '.toml', '.ts', '.tsx', '.txt', '.vue', '.yaml', '.yml'])
const secretKeyPattern = /\b([A-Za-z][A-Za-z0-9_-]*(?:password|passphrase|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]*)\b\s*[:=]\s*(['"`])([^'"`]+)\2/gi
const unquotedSecretPattern = /\b([A-Za-z][A-Za-z0-9_-]*(?:password|passphrase|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]*)\b\s*[:=]\s*([A-Za-z0-9+/_=-]{32,})/gi
const privateKeyPattern = new RegExp('-----BEGIN ' + '(?:[A-Z ]+ )?PRIVATE KEY-----')

function normalizeSecretKey(name) {
  const lower = name.toLowerCase()
  if (lower.includes('password') || lower.includes('passphrase')) return 'password'
  if (lower.includes('token')) return 'token'
  if (lower.includes('private') && lower.includes('key')) return 'private-key'
  if (lower.includes('key')) return 'api-key'
  if (lower.includes('credential')) return 'credential'
  return 'secret'
}

function isPlaceholder(value) {
  return /(?:replace-with|change-me|changeme|your[-_ ]|example|dummy|fixture|invalid|mock|test[-_]|token|secret|password|\$\{\{|<[^>]+>)/i.test(value)
}

function looksSensitive(name, value) {
  if (isPlaceholder(value)) return false
  if (/^[a-z_-]+$/i.test(value)) return false
  const key = normalizeSecretKey(name)
  if (key === 'password') return value.length >= 8
  if (value.length < 16) return false
  const characterClasses = [/[a-z]/i, /\d/, /[^a-z0-9]/i].filter((pattern) => pattern.test(value)).length
  return characterClasses >= 2
}

export function assertDeploymentEnvironment(env = process.env) {
  const required = ['DEPLOY_HOST', 'DEPLOY_PORT', 'DEPLOY_USER', 'DEPLOY_PRIVATE_KEY']
  for (const name of required) {
    if (!String(env[name] || '').trim()) throw new Error(`缺少部署环境变量：${name}`)
  }
  const port = String(env.DEPLOY_PORT).trim()
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('DEPLOY_PORT 必须是 1-65535 的整数')
  }
  return {
    host: String(env.DEPLOY_HOST).trim(),
    port,
    user: String(env.DEPLOY_USER).trim(),
    privateKey: String(env.DEPLOY_PRIVATE_KEY).trim(),
  }
}

export function findHardcodedDeploymentSecrets(content, file) {
  const findings = []
  const add = (key) => {
    const finding = { file, key }
    if (!findings.some((item) => item.file === file && item.key === key)) findings.push(finding)
  }
  for (const match of content.matchAll(secretKeyPattern)) {
    if (looksSensitive(match[1], match[3])) add(normalizeSecretKey(match[1]))
  }
  for (const match of content.matchAll(unquotedSecretPattern)) {
    if (looksSensitive(match[1], match[2])) add(normalizeSecretKey(match[1]))
  }
  if (privateKeyPattern.test(content)) add('private-key')
  return findings
}

function collectTextFiles(path, output) {
  const file = resolve(rootDir, path)
  if (!existsSync(file)) return
  if (statSync(file).isDirectory()) {
    for (const child of readdirSync(file)) {
      if (!['node_modules', '.git', 'dist', '.worktrees'].includes(child)) {
        collectTextFiles(resolve(path, child), output)
      }
    }
    return
  }
  if (textExtensions.has(extname(file).toLowerCase())) output.add(path.replaceAll('\\', '/'))
}

export function getDefaultDeploymentScanPaths() {
  const paths = new Set(['deploy_frontend.js', 'scripts', 'deploy'])
  try {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir, encoding: 'utf8' })
    for (const path of tracked.split('\0')) {
      if (path && textExtensions.has(extname(path).toLowerCase())) paths.add(path)
    }
  } catch {
    // Git is optional when the verifier is copied into a release image.
  }
  return [...paths]
}

export function verifyDeploymentSecrets({ paths = getDefaultDeploymentScanPaths() } = {}) {
  const files = new Set()
  for (const path of paths) collectTextFiles(path, files)
  const findings = [...files].flatMap((path) => {
    const file = resolve(rootDir, path)
    if (/(^|\/)(?:\.github|docs|skills|tests?)(\/|$)|(?:^|\.)test\.[^.]+$/i.test(path)) return []
    return findHardcodedDeploymentSecrets(readFileSync(file, 'utf8'), path)
  })
  if (findings.length) {
    for (const finding of findings) console.error(`检测到硬编码部署凭据：${finding.file} [${finding.key}]`)
    throw new Error('部署凭据扫描失败')
  }
  return findings
}

if (process.argv[1]?.endsWith('verify-deployment-secrets.mjs')) {
  try {
    verifyDeploymentSecrets({ paths: process.argv.slice(2).length ? process.argv.slice(2) : undefined })
    console.log('部署凭据扫描通过')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
