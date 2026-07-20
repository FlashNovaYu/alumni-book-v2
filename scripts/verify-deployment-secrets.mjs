import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const hardcodedSecretPatterns = [
  { key: 'password', pattern: /\b(?:password|passphrase)\s*[:=]\s*['"`][^'"`]+['"`]/i },
  { key: 'private-key', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
]

export function assertDeploymentEnvironment(env = process.env) {
  const required = ['DEPLOY_HOST', 'DEPLOY_PORT', 'DEPLOY_USER', 'DEPLOY_PRIVATE_KEY']
  for (const name of required) {
    if (!String(env[name] || '').trim()) throw new Error(`缺少部署环境变量：${name}`)
  }
  return {
    host: env.DEPLOY_HOST.trim(),
    port: env.DEPLOY_PORT.trim(),
    user: env.DEPLOY_USER.trim(),
    privateKey: env.DEPLOY_PRIVATE_KEY.trim(),
  }
}

export function findHardcodedDeploymentSecrets(content, file) {
  return hardcodedSecretPatterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ key }) => ({ file, key }))
}

export function verifyDeploymentSecrets({ paths = ['deploy_frontend.js'] } = {}) {
  const findings = paths.flatMap((path) => {
    const file = resolve(rootDir, path)
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
