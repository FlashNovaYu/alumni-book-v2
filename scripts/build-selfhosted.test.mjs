import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSelfHostedArtifact, buildSelfHostedConfig, getSelfHostedClientApiBase } from './build-selfhosted.mjs'

test('自托管产物拒绝残留 Cloudflare 生产地址', () => {
  assert.doesNotThrow(() => assertSelfHostedArtifact('fetch("/api/health")', 'index.html'))
  assert.throws(
    () => assertSelfHostedArtifact('https://alumni-book.pages.dev/api/config', 'index.html'),
    /自托管产物仍包含 Cloudflare 地址/,
  )
  assert.throws(
    () => assertSelfHostedArtifact('https://alumni-book-api.chenyuhao2263.workers.dev/api/health', 'main.js'),
    /自托管产物仍包含 Cloudflare 地址/,
  )
  assert.throws(
    () => assertSelfHostedArtifact('VITE_WORKER_URL', 'main.js'),
    /自托管产物仍包含 Cloudflare 地址/,
  )
})

test('自托管客户端使用同源 API 路径，避免重复 /api 前缀', () => {
  assert.equal(getSelfHostedClientApiBase(), '')
})

test('自托管构建要求显式 API 目标并归一化尾斜杠', () => {
  assert.throws(() => buildSelfHostedConfig({}), /--api-base|SELF_HOST_API_BASE/)
  assert.throws(
    () => buildSelfHostedConfig({ apiBase: 'http://118.178.88.227/' }),
    /RELEASE_SHA 必须是完整 40 位十六进制提交 SHA/,
  )
  assert.throws(
    () => buildSelfHostedConfig({ apiBase: 'http://118.178.88.227/', releaseSha: 'local' }),
    /RELEASE_SHA 必须是完整 40 位十六进制提交 SHA/,
  )
  assert.deepEqual(buildSelfHostedConfig({
    apiBase: 'http://118.178.88.227/',
    releaseSha: '0123456789abcdef0123456789abcdef01234567',
  }), {
    apiBase: 'http://118.178.88.227',
    clientApiBase: '',
    ssgApiBase: 'http://118.178.88.227',
    releaseSha: '0123456789abcdef0123456789abcdef01234567',
  })
})
