import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { uploadRoutes } from '../src/routes/upload'
import { classmateRoutes } from '../src/routes/classmate'

type Bindings = { DB: D1Database; R2: R2Bucket; JWT_SECRET: string }

describe('管理员上传补偿', () => {
  it('在 R2 写入后数据库批处理失败时删除新对象', async () => {
    const deletedKeys: string[] = []
    const app = new Hono<{ Bindings: Bindings; Variables: { admin: any } }>()
    app.use('*', async (c, next) => {
      c.set('admin', {
        id: 'adm_upload_test', displayName: '上传测试员', accountType: 'standalone', studentSlug: null,
        isOwner: true, mustChangePassword: false, permissions: [],
      })
      await next()
    })
    app.route('/', uploadRoutes)

    const form = new FormData()
    form.append('file', new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'avatar.png', { type: 'image/png' }))
    form.append('type', 'avatar')
    form.append('slug', 'test_init')

    const response = await app.fetch(new Request('http://localhost/upload', { method: 'POST', body: form }), {
      DB: {
        prepare: (query: string) => ({
          bind: () => query.startsWith('SELECT')
            ? { first: async () => ({ avatar_url: '/api/files/avatars/old-avatar.png', music_url: null, background_url: null }) }
            : {},
        }),
        batch: async () => { throw new Error('D1 batch failed') },
      } as unknown as D1Database,
      R2: {
        put: async () => undefined,
        delete: async (key: string) => { deletedKeys.push(key) },
      } as unknown as R2Bucket,
      JWT_SECRET: 'test-secret',
    })

    expect(response.status).toBe(500)
    expect(deletedKeys).toEqual([expect.stringMatching(/^avatars\/test_init_.*\.png$/)])
    expect(deletedKeys).not.toContain('avatars/old-avatar.png')
  })

  it('同学上传在 D1 更新失败时删除新对象并保留旧对象', async () => {
    const deletedKeys: string[] = []
    const app = new Hono<{ Bindings: Bindings }>()
    app.route('/', classmateRoutes)
    const form = new FormData()
    form.append('file', new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'avatar.png', { type: 'image/png' }))
    form.append('type', 'avatar')
    form.append('slug', 'upload-failure-student')

    const response = await app.fetch(new Request('http://localhost/classmate/upload', {
      method: 'POST', headers: { 'X-Classmate-Token': 'upload-failure-token' }, body: form,
    }), {
      DB: {
        prepare: (query: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => query.includes('classmate_sessions')
              ? { student_slug: 'upload-failure-student' }
              : { avatar_url: '/api/files/avatars/old-upload.png' },
            run: async () => { throw new Error('D1 update failed') },
          }),
        }),
      } as unknown as D1Database,
      R2: {
        put: async () => undefined,
        delete: async (key: string) => { deletedKeys.push(key) },
      } as unknown as R2Bucket,
      JWT_SECRET: 'test-secret',
    })

    expect(response.status).toBe(500)
    expect(deletedKeys).toEqual([expect.stringMatching(/^avatars\/upload-failure-student_.*\.png$/)])
    expect(deletedKeys).not.toContain('avatars/old-upload.png')
  })

  it('同学上传只在 D1 成功后删除旧对象', async () => {
    const events: string[] = []
    const app = new Hono<{ Bindings: Bindings }>()
    app.route('/', classmateRoutes)
    const form = new FormData()
    form.append('file', new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'avatar.png', { type: 'image/png' }))
    form.append('type', 'avatar')
    form.append('slug', 'upload-success-student')
    const response = await app.fetch(new Request('http://localhost/classmate/upload', {
      method: 'POST', headers: { 'X-Classmate-Token': 'upload-success-token' }, body: form,
    }), {
      DB: {
        prepare: (query: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => query.includes('classmate_sessions')
              ? { student_slug: 'upload-success-student' }
              : { avatar_url: '/api/files/avatars/old-success.png' },
            run: async () => { events.push('d1-update'); return { meta: { changes: 1 } } },
          }),
        }),
      } as unknown as D1Database,
      R2: {
        put: async () => { events.push('r2-put') },
        delete: async (key: string) => { events.push(`r2-delete:${key}`) },
      } as unknown as R2Bucket,
      JWT_SECRET: 'test-secret',
    })
    expect(response.status).toBe(200)
    expect(events).toEqual(['r2-put', 'd1-update', 'r2-delete:avatars/old-success.png'])
  })
})
