import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSelfHostedArtifact } from './build-selfhosted.mjs'

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
})
