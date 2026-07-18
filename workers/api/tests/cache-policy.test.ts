import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

async function request(path: string, init: RequestInit = {}) {
  return requestAt('http://localhost', path, init)
}

async function requestAt(origin: string, path: string, init: RequestInit = {}) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`${origin}${path}`, init), env, context)
  await waitOnExecutionContext(context)
  return response
}

beforeAll(async () => {
  await initTestDb(env.DB)
})

describe('dynamic API cache policy', () => {
  it.each(['/api/config', '/api/classmates', '/api/albums', '/api/rankings', '/api/timeline'])(
    'uses a short shared cache with an ETag for anonymous public GET %s',
    async (path) => {
      const response = await request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60, stale-while-revalidate=300')
      expect(response.headers.get('etag')).toBeTruthy()
    },
  )

  it('keeps all student projections private and varies by identity headers', async () => {
    const response = await request('/api/students', {
      headers: { 'X-Classmate-Token': 'not-a-valid-token' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    expect(response.headers.get('vary')).toContain('Authorization')
    expect(response.headers.get('vary')).toContain('X-Classmate-Token')
  })

  it('does not store administrative, write, or class-space responses', async () => {
    const admin = await request('/api/admin/config')
    expect(admin.headers.get('cache-control')).toContain('no-store')

    const write = await request('/api/students/not-found/visit', { method: 'POST' })
    expect(write.headers.get('cache-control')).toContain('no-store')

    const classSpace = await request('/api/class-space/overview')
    expect(classSpace.headers.get('cache-control')).toContain('no-store')
  })

  it('rejects oversized JSON writes before a route parses the body', async () => {
    const body = JSON.stringify({ name: 'x'.repeat(16 * 1024), slug: 'too-large' })
    const response = await request('/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(new TextEncoder().encode(body).byteLength) },
      body,
    })
    expect(response.status).toBe(413)
  })

  it('enforces the JSON limit for chunked bodies without Content-Length', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ name: 'x'.repeat(17_000), slug: 'chunked' }))
    let offset = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= encoded.byteLength) return controller.close()
        controller.enqueue(encoded.slice(offset, Math.min(offset + 4096, encoded.byteLength)))
        offset += 4096
      },
      cancel() { cancelled = true },
    })
    const response = await request('/api/classmate/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
  })

  it('accepts exactly 16KiB and rejects invalid JSON as a client error', async () => {
    const prefix = '{"name":"边界","slug":"missing","padding":"'
    const suffix = '"}'
    const paddingBytes = 16 * 1024 - new TextEncoder().encode(prefix + suffix).byteLength
    const exactBody = prefix + 'x'.repeat(paddingBytes) + suffix
    expect(new TextEncoder().encode(exactBody).byteLength).toBe(16 * 1024)

    const boundary = await request('/api/classmate/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: exactBody,
    })
    expect(boundary.status).not.toBe(413)

    const invalid = await request('/api/classmate/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    })
    expect(invalid.status).toBe(400)
  })

  it('warms the real edge cache, isolates identity reads, and invalidates mapped writes', async () => {
    const edge = 'https://cache-policy.test'
    const cacheKey = new Request(`${edge}/api/rankings`)
    await caches.default.delete(cacheKey)
    await env.DB.prepare("UPDATE students SET visit_count = 1000 WHERE slug = 'test_init'").run()

    const warmed = await requestAt(edge, '/api/rankings')
    const warmedBody = await warmed.json() as any
    expect(warmedBody.data.visits[0].value).toContain('1000')
    expect(await caches.default.match(cacheKey)).toBeTruthy()

    await env.DB.prepare("UPDATE students SET visit_count = 1 WHERE slug = 'test_init'").run()
    const cached = await requestAt(edge, '/api/rankings')
    expect((await cached.json() as any).data.visits[0].value).toContain('1000')

    await requestAt(edge, '/api/students/test_init/visit', {
      method: 'POST', headers: { 'CF-Connecting-IP': 'cache-invalidation-test' },
    })
    const fresh = await requestAt(edge, '/api/rankings')
    expect((await fresh.json() as any).data.visits[0].value).toContain('2')

    const anonymous = await requestAt(edge, '/api/students')
    const identity = await requestAt(edge, '/api/students', { headers: { 'X-Classmate-Token': 'invalid' } })
    expect(anonymous.headers.get('cache-control')).toContain('private')
    expect(identity.headers.get('cache-control')).toContain('private')
    expect(anonymous.headers.get('etag')).toBeNull()
  })
})
