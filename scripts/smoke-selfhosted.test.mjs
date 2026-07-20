import test from 'node:test'
import assert from 'node:assert/strict'
import { assertStatus, assertNoCloudflareHost, parseExpectedSha, smokeSelfHosted } from './smoke-selfhosted.mjs'

test('自托管 smoke 辅助函数验证状态和产物地址', () => {
  assert.doesNotThrow(() => assertStatus(200, [200], '/api/health'))
  assert.throws(() => assertStatus(500, [200], '/api/health'), /状态码异常/)
  assert.doesNotThrow(() => assertNoCloudflareHost('http://127.0.0.1/api/health', '/'))
  assert.throws(() => assertNoCloudflareHost('https://alumni-book.pages.dev', '/'), /残留 Cloudflare 地址/)
})

test('自托管 smoke 要求 --expected-sha 且必须是完整 SHA', () => {
  assert.throws(() => parseExpectedSha(['node', 'smoke-selfhosted.mjs']), /--expected-sha/)
  assert.throws(() => parseExpectedSha(['node', 'smoke-selfhosted.mjs', '--expected-sha', 'local']), /完整 40 位十六进制/)
  assert.equal(parseExpectedSha(['node', 'smoke-selfhosted.mjs', '--expected-sha', '0123456789abcdef0123456789abcdef01234567']), '0123456789abcdef0123456789abcdef01234567')
})

test('自托管 smoke 拒绝静态与 API 发布 SHA 不一致', async () => {
  const originalFetch = globalThis.fetch
  const apiReleaseSha = '0123456789abcdef0123456789abcdef01234567'
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname
    const responses = {
      '/api/health': { status: 200, body: { success: true, data: { status: 'ok', releaseSha: apiReleaseSha } } },
      '/api/readiness': { status: 200, body: { success: true, data: { ready: true } } },
      '/api/files/does-not-exist': { status: 404, body: { success: false } },
      '/': { status: 200, body: '<!doctype html><title>Home</title>' },
      '/admin/': { status: 200, body: '<!doctype html><title>Admin</title>' },
      '/release.json': { status: 200, body: { source: '89abcdef0123456789abcdef0123456789abcdef', target: 'aliyun-selfhosted' } },
    }
    const response = responses[path]
    if (!response) throw new Error(`unexpected path: ${path}`)
    return new Response(typeof response.body === 'string' ? response.body : JSON.stringify(response.body), { status: response.status })
  }

  try {
    await assert.rejects(
      () => smokeSelfHosted({ baseUrl: 'http://self-hosted.test', expectedSha: apiReleaseSha, allowInsecureStaging: true }),
      /release\.json.*API.*SHA|SHA.*不一致/i,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('自托管 smoke 成功时静态、API 与 --expected-sha 三者一致', async () => {
  const originalFetch = globalThis.fetch
  const expectedSha = 'fedcba9876543210fedcba9876543210fedcba98'
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname
    const responses = {
      '/api/health': { status: 200, body: { success: true, data: { status: 'ok', releaseSha: expectedSha } } },
      '/api/readiness': { status: 200, body: { success: true, data: { ready: true } } },
      '/api/files/does-not-exist': { status: 404, body: { success: false } },
      '/': { status: 200, body: '<!doctype html><title>Home</title>' },
      '/admin/': { status: 200, body: '<!doctype html><title>Admin</title>' },
      '/release.json': { status: 200, body: { source: expectedSha, target: 'aliyun-selfhosted', builtAt: '2026-07-20T13:00:00.000Z' } },
    }
    const response = responses[path]
    if (!response) throw new Error(`unexpected path: ${path}`)
    return new Response(typeof response.body === 'string' ? response.body : JSON.stringify(response.body), { status: response.status })
  }

  try {
    await assert.doesNotReject(() => smokeSelfHosted({ baseUrl: 'http://self-hosted.test', expectedSha, allowInsecureStaging: true }))
    await assert.rejects(
      () => smokeSelfHosted({ baseUrl: 'http://self-hosted.test', expectedSha: '0123456789abcdef0123456789abcdef01234567', allowInsecureStaging: true }),
      /--expected-sha 不一致/i,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
