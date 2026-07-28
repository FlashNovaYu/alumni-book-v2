import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const slug = 'album-submit-student'
const token = 'album-submit-token'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function photoForm() {
  const form = new FormData()
  form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'photo.jpg', { type: 'image/jpeg' }))
  return form
}

beforeAll(async () => { await initTestDb(env.DB) })

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE album_id = ?').bind('album-submissions'),
    env.DB.prepare('DELETE FROM albums WHERE id = ?').bind('album-submissions'),
    env.DB.prepare('DELETE FROM classmate_sessions WHERE token = ?').bind(token),
    env.DB.prepare('DELETE FROM students WHERE slug = ?').bind(slug),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('album-submit-id', '投稿同学', ?, 'active', 1)").bind(slug),
    env.DB.prepare("INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(token, slug),
    env.DB.prepare("INSERT INTO albums (id, title, accepts_classmate_uploads) VALUES ('album-submissions', '同学投稿', 1)"),
  ])
})

describe('同学相册投稿', () => {
  it('将登录同学的图片写入唯一投稿相册', async () => {
    const response = await request('/api/classmate/album-photos', {
      method: 'POST', headers: { 'X-Classmate-Token': token }, body: photoForm(),
    })
    expect(response.status).toBe(201)
    const photo = await env.DB.prepare('SELECT album_id, submitted_by_slug, upload_source FROM photos').first()
    expect(photo).toMatchObject({ album_id: 'album-submissions', submitted_by_slug: slug, upload_source: 'classmate' })
  })
})
