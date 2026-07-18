import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

async function request(path: string, init: RequestInit = {}) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, context)
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
})
