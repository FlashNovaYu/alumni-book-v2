import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const PRIVATE_STUDENT_SLUG = 'public-seat-privacy'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(
    'INSERT OR REPLACE INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)'
  ).bind('public_seat_privacy', '公开隐私同学', PRIVATE_STUDENT_SLUG, JSON.stringify({
    seatNo: '4-5',
    dormNo: 'B206',
    groupName: '第二组',
  })).run()
})

describe('公开学生 DTO 隐私边界', () => {
  it('does not expose seat or dorm fields from public student detail and list responses', async () => {
    const detailContext = createExecutionContext()
    const detail = await worker.fetch(
      new Request(`http://localhost/api/students/${PRIVATE_STUDENT_SLUG}`),
      env,
      detailContext,
    )
    await waitOnExecutionContext(detailContext)
    expect(detail.status).toBe(200)
    const detailBody = await detail.json() as any
    expect(detailBody.data.info).not.toHaveProperty('seatNo')
    expect(detailBody.data.info).not.toHaveProperty('dormNo')
    expect(detailBody.data.info.groupName).toBe('第二组')

    const listContext = createExecutionContext()
    const list = await worker.fetch(new Request('http://localhost/api/students'), env, listContext)
    await waitOnExecutionContext(listContext)
    expect(list.status).toBe(200)
    const listBody = await list.json() as any
    const student = listBody.data.find((item: any) => item.slug === PRIVATE_STUDENT_SLUG)
    expect(student.info).not.toHaveProperty('seatNo')
    expect(student.info).not.toHaveProperty('dormNo')
  })
})
