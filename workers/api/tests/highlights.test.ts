import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(`
    UPDATE students
    SET info = ?
    WHERE slug = 'test'
  `).bind(JSON.stringify({
    groupName: '第一小组',
    seatNo: '3-2',
    favoriteSong: '同桌的你',
  })).run()
})

describe('Highlight APIs', () => {
  it('GET /api/highlights/class-graph returns graph payload', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/class-graph'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.nodes)).toBe(true)
    expect(Array.isArray(body.data.edges)).toBe(true)
  })

  it('GET /api/highlights/seat-map returns seats and missing count', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/seat-map'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.seats)).toBe(true)
    expect(typeof body.data.missingSeatCount).toBe('number')
  })
})
