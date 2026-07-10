import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, card_style, status, featured, pinned) VALUES ('pm_overview', 'test_init', '测试同学', '班级空间留言', 'paper', 'approved', 1, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO albums (id, title, description, frame_style, sort_order, featured) VALUES ('album_overview', '毕业相册', '毕业那天', 'polaroid', 0, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO photos (id, album_id, filename, caption, r2_key, sort_order) VALUES ('photo_overview', 'album_overview', 'cover.jpg', '合照', 'photos/cover.jpg', 0)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO timeline_events (id, title, description, event_date, event_type) VALUES ('event_overview', '毕业典礼', '最后一次集合', '2026-06-20', 'graduation')"
    ),
  ])
})

describe('Class space overview API', () => {
  it('returns bounded message, album and timeline previews', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/class-space/overview'), env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.messages.length).toBeLessThanOrEqual(8)
    expect(body.data.albums.length).toBeLessThanOrEqual(4)
    expect(body.data.timeline.length).toBeLessThanOrEqual(8)
    expect(body.data.messages[0]).not.toHaveProperty('reviewReason')
    expect(body.data.albums[0]).not.toHaveProperty('photos')
    expect(body.data.albums[0].coverR2Key).toBe('photos/cover.jpg')
    expect(body.data.counts).toEqual(expect.objectContaining({ albums: expect.any(Number) }))
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=300')
  })
})
