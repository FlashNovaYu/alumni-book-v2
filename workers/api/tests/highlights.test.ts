import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const SEAT_MAP_TOKEN = 'seat-map-classmate-session'
const SEAT_MAP_SLUG = 'seat-map-auth-student'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(
    'INSERT OR IGNORE INTO students (id, name, slug, info) VALUES (?, ?, ?, \'{}\')'
  ).bind('seat_map_auth_student', '座位图同学', SEAT_MAP_SLUG).run()
  await env.DB.prepare('UPDATE students SET info = ? WHERE slug = ?').bind(JSON.stringify({
    groupName: '第一小组',
    seatNo: '3-2',
    favoriteSong: '同桌的你',
  }), SEAT_MAP_SLUG).run()
  await env.DB.prepare('DELETE FROM classmate_sessions WHERE token = ?').bind(SEAT_MAP_TOKEN).run()
  await env.DB.prepare(
    "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))"
  ).bind(SEAT_MAP_TOKEN, SEAT_MAP_SLUG).run()
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

  it('GET /api/highlights/seat-map returns only aggregate counts to anonymous requests', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/seat-map'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data).not.toHaveProperty('seats')
    expect(body.data).toHaveProperty('totalSeatCount')
    expect(typeof body.data.missingSeatCount).toBe('number')
    expect(JSON.stringify(body.data)).not.toContain('3-2')
  })

  it('GET /api/highlights/seat-map returns seat data to authenticated classmates', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/seat-map', {
      headers: { 'X-Classmate-Token': SEAT_MAP_TOKEN },
    }), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.seats)).toBe(true)
    expect(typeof body.data.totalSeatCount).toBe('number')
    expect(typeof body.data.missingSeatCount).toBe('number')
    expect(body.data.seats).toContainEqual(expect.objectContaining({ seatNo: '3-2' }))
  })
})
