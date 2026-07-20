import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const secretKeyPattern = /\b([A-Za-z0-9_-]*(?:password|passphrase|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]*)\b\s*[:=]\s*(['"`])([^'"`]+)\2/gi
const unquotedSecretPattern = /\b([A-Za-z0-9_-]*(?:password|passphrase|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]*)\b\s*[:=]\s*([A-Za-z0-9+/_=-]{32,})/gi
const privateKeyPattern = new RegExp('-----BEGIN ' + '(?:[A-Z ]+ )?PRIVATE KEY-----')
const fixtureFingerprint = (file, key, fingerprint) => [file, key, fingerprint].join(':')
// Existing documentation and test fixtures, allowlisted by exact SHA-256 value fingerprint.
const explicitFixtureFingerprints = new Set([
  fixtureFingerprint('docs/superpowers/plans/2026-06-27-museum-hybrid-redesign.md', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('docs/superpowers/plans/2026-06-28-phase-11-stability-performance-experience.md', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-05-classmate-account-login-system.md', 'password', 'c346f5325e5c179d23c554724002d76765bfcabaa8a6d5f8587d607c8b98a68d'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-05-classmate-account-login-system.md', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-10-class-space-navigation-redesign.md', 'password', 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-12-admin-operations-optimization.md', 'password', '271eb1166e6857d5420b5d116d28cc9e6e3a30cf3318a2be8e22340d20723887'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-12-admin-rbac-workbench.md', 'password', '271eb1166e6857d5420b5d116d28cc9e6e3a30cf3318a2be8e22340d20723887'),
  fixtureFingerprint('docs/superpowers/plans/2026-07-12-admin-rbac-workbench.md', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('skills/plans/phase-2-security.md', 'secret', '42d9748f9e2456408eb98160a3a68b85f5d7f19e144f6aee14356e8216cfff36'),
  fixtureFingerprint('skills/plans/phase-2-security.md', 'secret', 'a20917fa77946bd40583a3930e0bd6456618221ac0c11fccbbce393271355328'),
  fixtureFingerprint('skills/plans/phase-3-features.md', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('workers/api/tests/admin-rbac.test.ts', 'password', '271eb1166e6857d5420b5d116d28cc9e6e3a30cf3318a2be8e22340d20723887'),
  fixtureFingerprint('workers/api/tests/api.test.ts', 'password', 'c346f5325e5c179d23c554724002d76765bfcabaa8a6d5f8587d607c8b98a68d'),
  fixtureFingerprint('workers/api/tests/auth-rate-limit.test.ts', 'password', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'),
  fixtureFingerprint('workers/api/tests/legacy-chat-compat.test.ts', 'password', '85777f270ad7cf2a790981bbae3c4e484a1dc55e24a77390d692fbf1cffa12fa'),
  fixtureFingerprint('workers/api/tests/security.test.ts', 'password', 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f'),
])

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
  return /\$\{/.test(value) || /^(?:replace-with.*|change-me|changeme|your[-_ ].*|example.*|dummy.*|fixture.*|invalid.*|mock.*|test[-_].*|<[^>]+>)$/i.test(value)
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

function fingerprintSecretValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function findHardcodedDeploymentSecretsDetailed(content, file) {
  const findings = []
  const add = (key, value) => {
    const finding = { file, key, fingerprint: fingerprintSecretValue(value) }
    if (!findings.some((item) => item.file === file && item.key === key && item.fingerprint === finding.fingerprint)) findings.push(finding)
  }
  for (const match of content.matchAll(secretKeyPattern)) {
    if (looksSensitive(match[1], match[3])) add(normalizeSecretKey(match[1]), match[3])
  }
  for (const match of content.matchAll(unquotedSecretPattern)) {
    if (looksSensitive(match[1], match[2])) add(normalizeSecretKey(match[1]), match[2])
  }
  const privateKeyMatch = privateKeyPattern.exec(content)
  if (privateKeyMatch) add('private-key', privateKeyMatch[0])
  return findings
}

export function findHardcodedDeploymentSecrets(content, file) {
  const findings = []
  for (const finding of findHardcodedDeploymentSecretsDetailed(content, file)) {
    if (!findings.some((item) => item.file === finding.file && item.key === finding.key)) {
      findings.push({ file: finding.file, key: finding.key })
    }
  }
  return findings
}

export function isAllowlistedFixtureFinding(finding) {
  return explicitFixtureFingerprints.has(fixtureFingerprint(finding.file, finding.key, finding.fingerprint))
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
  const content = readFileSync(file)
  if (!content.includes(0)) output.add(relative(rootDir, file).replaceAll('\\', '/'))
}

export function getDefaultDeploymentScanPaths() {
  const paths = new Set(['deploy_frontend.js', 'scripts', 'deploy'])
  try {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir, encoding: 'utf8' })
    for (const path of tracked.split('\0')) {
      if (path) paths.add(path)
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
    return findHardcodedDeploymentSecretsDetailed(readFileSync(file, 'utf8'), path)
      .filter((finding) => !isAllowlistedFixtureFinding(finding))
      .map(({ file, key }) => ({ file, key }))
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
