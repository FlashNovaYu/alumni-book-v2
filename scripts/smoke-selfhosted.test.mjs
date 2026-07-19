import test from 'node:test'
import assert from 'node:assert/strict'
import { assertStatus, assertNoCloudflareHost } from './smoke-selfhosted.mjs'

test('自托管 smoke 辅助函数验证状态和产物地址', () => {
  assert.doesNotThrow(() => assertStatus(200, [200], '/api/health'))
  assert.throws(() => assertStatus(500, [200], '/api/health'), /状态码异常/)
  assert.doesNotThrow(() => assertNoCloudflareHost('http://127.0.0.1/api/health', '/'))
  assert.throws(() => assertNoCloudflareHost('https://alumni-book.pages.dev', '/'), /残留 Cloudflare 地址/)
})
