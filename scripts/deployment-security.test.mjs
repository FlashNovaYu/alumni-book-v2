import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  assertDeploymentEnvironment,
  findHardcodedDeploymentSecrets,
  getDefaultDeploymentScanPaths,
} from './verify-deployment-secrets.mjs'
import {
  assertRobotsText,
  assertHttpsBaseUrl,
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

test('秘密扫描默认覆盖部署脚本、scripts、deploy 和 Git 跟踪文本', () => {
  const paths = getDefaultDeploymentScanPaths()
  assert.ok(paths.includes('deploy_frontend.js'))
  assert.ok(paths.includes('scripts'))
  assert.ok(paths.includes('deploy'))
  assert.ok(paths.some((path) => path.endsWith('package.json')))
})

test('Nginx 对静态资源、robots 和未知公开路径使用明确的非 SPA 响应', () => {
  for (const path of ['deploy/nginx-ecs.conf', 'deploy/nginx.conf']) {
    const config = read(path)
    assert.match(config, /location = \/robots\.txt\s*\{[\s\S]*default_type text\/plain;/)
    assert.match(config, /form-action 'self'/)
    assert.match(config, /location ~\* \^\/\(\?:assets\|admin\/assets\)\//)
    assert.match(config, /location \/ \{\s*try_files \$uri \$uri\/ =404;/)
    assert.match(config, /location \/admin\/ \{\s*try_files \$uri \$uri\/ \/admin\/index\.html;/)
  }
})

test('robots 及安全头 smoke 断言可独立验证', () => {
  assert.doesNotThrow(() => assertRobotsText('User-agent: *\nDisallow: /admin/\nDisallow: /api/\n', '/robots.txt'))
  assert.throws(() => assertRobotsText('<!doctype html>', '/robots.txt'), /robots\.txt/)

  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",
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
})

test('自托管 smoke 覆盖正常路由及所有软 404 回归路径', () => {
  const smoke = read('scripts/smoke-selfhosted.mjs')
  for (const path of ['/roster/', '/assets/does-not-exist.js', '/admin/assets/does-not-exist.js', '/llms.txt']) {
    assert.match(smoke, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('秘密扫描接入完整验证门禁', () => {
  const packageJson = JSON.parse(read('package.json'))
  assert.equal(packageJson.scripts['verify:secrets'], 'node scripts/verify-deployment-secrets.mjs')
  assert.match(packageJson.scripts['verify:all'], /^pnpm verify:secrets &&/)
})
