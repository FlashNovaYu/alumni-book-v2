import test from 'node:test'
import assert from 'node:assert/strict'
import { assertStatus, assertNoCloudflareHost, smokeSelfHosted } from './smoke-selfhosted.mjs'

test('自托管 smoke 辅助函数验证状态和产物地址', () => {
  assert.doesNotThrow(() => assertStatus(200, [200], '/api/health'))
  assert.throws(() => assertStatus(500, [200], '/api/health'), /状态码异常/)
  assert.doesNotThrow(() => assertNoCloudflareHost('http://127.0.0.1/api/health', '/'))
  assert.throws(() => assertNoCloudflareHost('https://alumni-book.pages.dev', '/'), /残留 Cloudflare 地址/)
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
      () => smokeSelfHosted({ baseUrl: 'http://self-hosted.test' }),
      /release\.json.*API.*SHA|SHA.*不一致/i,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
