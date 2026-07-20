import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  assertDeploymentEnvironment,
  findHardcodedDeploymentSecrets,
  findHardcodedDeploymentSecretsDetailed,
  getDefaultDeploymentScanPaths,
  isAllowlistedFixtureFinding,
} from './verify-deployment-secrets.mjs'
import {
  assertRobotsText,
  assertHttpsBaseUrl,
  assertHttpRedirect,
  assertSecurityHeaders,
} from './smoke-selfhosted.mjs'

const require = createRequire(import.meta.url)
const { buildScpArguments } = require('../deploy_frontend.js')

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('部署脚本只接受 SSH 私钥环境变量，缺失时明确失败', () => {
  const config = assertDeploymentEnvironment({
    DEPLOY_HOST: 'example.test',
    DEPLOY_PORT: '2222',
    DEPLOY_USER: 'deployer',
    DEPLOY_PRIVATE_KEY: 'C:/keys/deploy',
  })

  assert.deepEqual(config, {
    host: 'example.test',
    port: '2222',
    user: 'deployer',
    privateKey: 'C:/keys/deploy',
  })
  assert.throws(() => assertDeploymentEnvironment({ DEPLOY_HOST: 'example.test' }), /DEPLOY_PORT/)
  for (const port of ['0', '65536', '22.5', 'abc']) {
    assert.throws(() => assertDeploymentEnvironment({
      DEPLOY_HOST: 'example.test',
      DEPLOY_PORT: port,
      DEPLOY_USER: 'deployer',
      DEPLOY_PRIVATE_KEY: 'C:/keys/deploy',
    }), /DEPLOY_PORT/)
  }
})

test('前端发布调用 scp 私钥认证，不存在密码回退', () => {
  const script = read('deploy_frontend.js')
  const verifier = read('scripts/verify-deployment-secrets.mjs')
  assert.match(script, /assertDeploymentEnvironment/)
  for (const name of ['DEPLOY_HOST', 'DEPLOY_PORT', 'DEPLOY_USER', 'DEPLOY_PRIVATE_KEY']) {
    assert.match(verifier, new RegExp(name))
  }
  assert.doesNotMatch(script, /DEPLOY_PASSWORD/)
  assert.deepEqual(buildScpArguments({
    privateKey: 'C:/keys/deploy',
    port: '2222',
    sourceDirectory: 'dist',
    target: 'deployer@example.test:/www/wwwroot/alumni-book',
  }).slice(0, 5), ['-i', 'C:/keys/deploy', '-P', '2222', '-r'])
})

test('秘密扫描仅报告文件和键名，不暴露匹配值', () => {
  const leakedValue = ['sk', '_live_', 'Q7w9E2r4T6y8U1i3O5p7'].join('')
  const findings = findHardcodedDeploymentSecrets("const access" + `Token = '${leakedValue}'`, 'deploy_frontend.js')

  assert.deepEqual(findings, [{ file: 'deploy_frontend.js', key: 'token' }])
  assert.equal(JSON.stringify(findings).includes(leakedValue), false)
})

test('包含 secret、token 或 password 字样的长凭据仍会命中', () => {
  const leakedValue = ['prod-', 'secret-token-password-', 'Q7w9E2r4T6y8U1i3O5p7'].join('')
  const findings = findHardcodedDeploymentSecrets(`const accessToken = '${leakedValue}'`, 'runtime.js')
  assert.deepEqual(findings, [{ file: 'runtime.js', key: 'token' }])
})

test('夹具白名单精确到值指纹，同文件新增真实密码仍会命中', () => {
  const file = 'docs/superpowers/plans/2026-07-05-classmate-account-login-system.md'
  const existing = findHardcodedDeploymentSecretsDetailed(read(file), file)
    .find((finding) => finding.key === 'password' && isAllowlistedFixtureFinding(finding))
  assert.ok(existing, '既有测试夹具必须以值指纹列入白名单')

  const leakedValue = ['Prod!', 'password-secret-token-', 'Q7w9E2r4T6y8'].join('')
  const injected = findHardcodedDeploymentSecretsDetailed(`const password = '${leakedValue}'`, file)
  assert.equal(injected.length, 1)
  assert.equal(isAllowlistedFixtureFinding(injected[0]), false)
  assert.deepEqual(findHardcodedDeploymentSecrets(`const password = '${leakedValue}'`, file), [{ file, key: 'password' }])
})

test('秘密扫描默认覆盖部署脚本、scripts、deploy 和 Git 跟踪文本', () => {
  const paths = getDefaultDeploymentScanPaths()
  assert.ok(paths.includes('deploy_frontend.js'))
  assert.ok(paths.includes('scripts'))
  assert.ok(paths.includes('deploy'))
  assert.ok(paths.some((path) => path.endsWith('package.json')))
  for (const path of ['deploy/.env.example', 'workers/api/Dockerfile', '.github/workflows/verify.yml', 'docs/deployment-runbook.md', 'workers/api/tests/api.test.ts']) {
    assert.ok(paths.includes(path), `未扫描 ${path}`)
  }
})

test('IP 明文入口只返回 403', () => {
  const config = read('deploy/nginx-ecs.conf')
  assert.match(config, /listen 80 default_server;/)
  assert.match(config, /return 403;/)
  assert.doesNotMatch(config, /proxy_pass|try_files|root\s/)
})

test('正式 Nginx 模板提供 HTTPS、301、HSTS 和静态路由契约', () => {
  const config = read('deploy/nginx.conf')
  assert.match(config, /listen 80;/)
  assert.match(config, /return 301 https:\/\/\$host\$request_uri;/)
  assert.match(config, /listen 443 ssl;/)
  assert.match(config, /\$\{ALUMNI_BOOK_SERVER_NAME\}/)
  assert.match(config, /ssl_certificate \$\{ALUMNI_BOOK_TLS_CERTIFICATE\};/)
  assert.match(config, /ssl_certificate_key \$\{ALUMNI_BOOK_TLS_CERTIFICATE_KEY\};/)
  assert.match(config, /envsubst '[^\n]*ALUMNI_BOOK_API_UPSTREAM[^\n]*'/)
  assert.match(config, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/)
  assert.match(config, /location = \/robots\.txt\s*\{[\s\S]*default_type text\/plain;/)
  assert.match(config, /form-action 'self'/)
  assert.match(config, /location ~\* \^\/\(\?:assets\|admin\/assets\)\//)
  assert.match(config, /location \/ \{\s*try_files \$uri \$uri\/ =404;/)
  assert.match(config, /location \/admin\/ \{\s*try_files \$uri \$uri\/ \/admin\/index\.html;/)
})

test('robots 及安全头 smoke 断言可独立验证', () => {
  assert.doesNotThrow(() => assertRobotsText('User-agent: *\nDisallow: /admin/\nDisallow: /api/\n', '/robots.txt'))
  assert.throws(() => assertRobotsText('<!doctype html>', '/robots.txt'), /robots\.txt/)

  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  })
  assert.doesNotThrow(() => assertSecurityHeaders(headers, '/'))
  assert.throws(() => assertSecurityHeaders(new Headers(), '/'), /安全响应头/)
})

test('自托管 robots.txt 是可解析的纯文本规则', () => {
  const robots = read('packages/site-astro/public/robots.txt')
  assert.doesNotThrow(() => assertRobotsText(robots, '/robots.txt'))
  assert.match(robots, /^Disallow: \/api\/$/m)
})

test('正式 smoke 基址必须使用 HTTPS', () => {
  assert.doesNotThrow(() => assertHttpsBaseUrl('https://alumni.example.test'))
  assert.throws(() => assertHttpsBaseUrl('http://118.178.88.227'), /HTTPS/)
  assert.doesNotThrow(() => assertHttpRedirect({
    status: 301,
    headers: new Headers({ location: 'https://alumni.example.test/' }),
  }, 'https://alumni.example.test/'))
  assert.throws(() => assertHttpRedirect({ status: 403, headers: new Headers() }, 'https://alumni.example.test/'), /301/)
})

test('自托管 smoke 覆盖正常路由及所有软 404 回归路径', () => {
  const smoke = read('scripts/smoke-selfhosted.mjs')
  for (const path of ['/roster/', '/album/', '/timeline/', '/mailbox/', '/assets/does-not-exist.js', '/admin/assets/does-not-exist.js', '/llms.txt']) {
    assert.match(smoke, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('秘密扫描接入完整验证门禁', () => {
  const packageJson = JSON.parse(read('package.json'))
  assert.equal(packageJson.scripts['verify:secrets'], 'node scripts/verify-deployment-secrets.mjs')
  assert.match(packageJson.scripts['verify:deployment-security'], /deployment-security\.test\.mjs/)
  assert.match(packageJson.scripts['verify:deployment-security'], /pages-deployment-static\.test\.ts/)
  assert.match(packageJson.scripts['verify:all'], /^pnpm verify:secrets && pnpm verify:deployment-security &&/)
})

test('工作流不再提交 JWT_SECRET= 测试占位赋值', () => {
  for (const path of ['.github/workflows/verify.yml', '.github/workflows/deploy-production.yml', '.github/workflows/deploy-worker.yml']) {
    assert.doesNotMatch(read(path), /JWT_SECRET=/)
  }
})

test('部署文件改动会触发 push 和 PR 验证门禁', () => {
  const workflow = read('.github/workflows/verify.yml')
  assert.equal(workflow.match(/- 'deploy\/\*\*'/g)?.length, 2)
  assert.equal(workflow.match(/- 'deploy_frontend\.js'/g)?.length, 2)
})
