import { describe, expect, it, vi } from 'vitest'
import { onRequest as apiOnRequest } from '../functions/api/[[path]]'
import { onRequest as studentOnRequest } from '../functions/student/[[path]]'

function executionContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  }
}

describe('Pages Functions adapters', () => {
  it('dispatches /api requests to the existing Hono app', async () => {
    const response = await apiOnRequest({
      request: new Request('https://alumni-book.pages.dev/api/health'),
      env: {
        DB: {} as D1Database,
        R2: {} as R2Bucket,
        JWT_SECRET: 'test-secret',
        CORS_ORIGIN: 'https://alumni-book.pages.dev',
      },
      params: {},
      data: {},
      functionPath: '/api/[[path]]',
      next: vi.fn(),
      ...executionContext(),
    } as any)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true })
  })

  it('serves an existing student asset before using the template', async () => {
    const fetchAsset = vi.fn(async () => new Response('student page', { status: 200 }))
    const response = await studentOnRequest({
      request: new Request('https://alumni-book.pages.dev/student/zhangsan/'),
      env: { ASSETS: { fetch: fetchAsset } },
    } as any)

    expect(await response.text()).toBe('student page')
    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  it('falls back to the shared student template after an asset 404', async () => {
    const fetchAsset = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/student/template/'
        ? new Response('template page', { status: 200 })
        : new Response('missing', { status: 404 })
    })
    const response = await studentOnRequest({
      request: new Request('https://alumni-book.pages.dev/student/new-student/'),
      env: { ASSETS: { fetch: fetchAsset } },
    } as any)

    expect(await response.text()).toBe('template page')
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })
})
