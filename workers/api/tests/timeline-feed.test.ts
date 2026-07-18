import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import { getTimelineFeed } from '../src/lib/timelineFeed'

const eventId = 'curated-timeline-event'
const studentSlug = 'curated-timeline-student'
const messageId = 'curated-timeline-message'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR REPLACE INTO students (id, name, slug, info, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind('curated-timeline-student-id', '自动记录同学', studentSlug, '{}', '2026-07-12T12:00:00.000Z'),
    env.DB.prepare(
      'INSERT OR REPLACE INTO messages (id, student_slug, author_name, content, is_approved, is_hidden, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)',
    ).bind(messageId, studentSlug, '自动记录同学', '这不是班级大事', '2026-07-12T12:01:00.000Z'),
    env.DB.prepare(
      'INSERT OR REPLACE INTO timeline_events (id, title, description, event_date, photo_r2_key) VALUES (?, ?, ?, ?, ?)',
    ).bind(eventId, '毕业合影', '全班在操场留下合影。', '2026-07-12', 'photos/graduation.jpg'),
  ])
})

describe('class-space curated timeline', () => {
  it('returns only administrator-created events when curatedOnly is requested', async () => {
    const timeline = await getTimelineFeed(env.DB, { curatedOnly: true, limit: 100 })

    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: eventId,
        type: 'event',
        title: '毕业合影',
        photoUrl: '/api/files/photos/graduation.jpg',
      }),
    ]))
    expect(timeline).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `msg_${messageId}` }),
      expect.objectContaining({ id: `join_${studentSlug}` }),
    ]))
    expect(timeline.every((item) => item.type === 'event')).toBe(true)
  })

  it('pushes the requested LIMIT into every timeline source query', async () => {
    const statements: string[] = []
    const countingDb = {
      prepare(sql: string) { statements.push(sql); return env.DB.prepare(sql) },
    } as unknown as D1Database
    await getTimelineFeed(countingDb, { limit: 6 })
    expect(statements).toHaveLength(4)
    expect(statements.every((statement) => /LIMIT \?/i.test(statement))).toBe(true)
  })
})
