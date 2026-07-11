import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const key = 'photos/pages-file-route.jpg'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.R2.put(key, new Uint8Array([1, 2, 3, 4]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
})

async function dispatch(request: Request) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('R2 file delivery', () => {
  it('GET returns immutable metadata and full content', async () => {
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('ETag')).toBeTruthy()
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toContain('31536000')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4])
  })

  it('HEAD returns the same metadata without a body', async () => {
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      method: 'HEAD',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('')
  })

  it('If-None-Match returns 304', async () => {
    const first = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      method: 'HEAD',
    }))
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      headers: { 'If-None-Match': first.headers.get('ETag') || '' },
    }))

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  it('returns 404 for a missing object', async () => {
    const response = await dispatch(new Request('http://localhost/api/files/photos/missing.jpg'))
    expect(response.status).toBe(404)
  })
})
