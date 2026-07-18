import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const MESSAGE_SLUG_A = 'public-limit-message-a'
const MESSAGE_SLUG_B = 'public-limit-message-b'
const VISIT_SLUG = 'public-limit-visit'

async function request(path: string, method: 'POST' | 'PUT', ip: string, body?: unknown) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: {
      'CF-Connecting-IP': ip,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), env, context)
  await waitOnExecutionContext(context)
  return response
}

function expectRateLimited(response: Response) {
  expect(response.status).toBe(429)
  expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
}

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO students (id, name, slug, info) VALUES (?, ?, ?, \'{}\')')
      .bind('public_limit_student_a', '留言限流甲', MESSAGE_SLUG_A),
    env.DB.prepare('INSERT OR REPLACE INTO students (id, name, slug, info) VALUES (?, ?, ?, \'{}\')')
      .bind('public_limit_student_b', '留言限流乙', MESSAGE_SLUG_B),
    env.DB.prepare('INSERT OR REPLACE INTO students (id, name, slug, info, visit_count) VALUES (?, ?, ?, \'{}\', 0)')
      .bind('public_limit_visit', '访问限流同学', VISIT_SLUG),
    env.DB.prepare(
      `INSERT OR REPLACE INTO messages (id, student_slug, author_name, content, is_approved)
       VALUES ('public_limit_reaction_a', ?, '留言人', '可反应留言 A', 1)`
    ).bind(MESSAGE_SLUG_A),
    env.DB.prepare(
      `INSERT OR REPLACE INTO messages (id, student_slug, author_name, content, is_approved)
       VALUES ('public_limit_reaction_b', ?, '留言人', '可反应留言 B', 1)`
    ).bind(MESSAGE_SLUG_A),
  ])
})

describe('公开写接口限流与访问去重', () => {
  it('limits public message submissions by IP and target', async () => {
    const ip = '198.51.100.61'
    const payload = { authorName: '限流测试者', content: '第一条公开留言' }

    expect((await request(`/api/messages/${MESSAGE_SLUG_A}`, 'POST', ip, payload)).status).toBe(200)
    expectRateLimited(await request(`/api/messages/${MESSAGE_SLUG_A}`, 'POST', ip, payload))
    expect((await request(`/api/messages/${MESSAGE_SLUG_B}`, 'POST', ip, payload)).status).toBe(200)
  })

  it('limits reactions by IP and message target', async () => {
    const ip = '198.51.100.62'
    const payload = { reaction: '👍' }

    expect((await request('/api/messages/public_limit_reaction_a/react', 'PUT', ip, payload)).status).toBe(200)
    expectRateLimited(await request('/api/messages/public_limit_reaction_a/react', 'PUT', ip, payload))
    expect((await request('/api/messages/public_limit_reaction_b/react', 'PUT', ip, payload)).status).toBe(200)
  })

  it('deduplicates visit counts by IP and student while preserving success responses', async () => {
    const first = await request(`/api/students/${VISIT_SLUG}/visit`, 'POST', '198.51.100.63')
    expect(first.status).toBe(200)
    expect((await first.json() as any).data.visitCount).toBe(1)

    const duplicate = await request(`/api/students/${VISIT_SLUG}/visit`, 'POST', '198.51.100.63')
    expect(duplicate.status).toBe(200)
    expect((await duplicate.json() as any).data.visitCount).toBe(1)

    const differentIp = await request(`/api/students/${VISIT_SLUG}/visit`, 'POST', '198.51.100.64')
    expect(differentIp.status).toBe(200)
    expect((await differentIp.json() as any).data.visitCount).toBe(2)
  })
})
