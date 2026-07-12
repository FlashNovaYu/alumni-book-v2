import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { uploadRoutes } from '../src/routes/upload'

type Bindings = { DB: D1Database; R2: R2Bucket; JWT_SECRET: string }

describe('管理员上传补偿', () => {
  it('在 R2 写入后读取旧记录失败时删除新对象', async () => {
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
    form.append('file', new File(['image'], 'avatar.png', { type: 'image/png' }))
    form.append('type', 'avatar')
    form.append('slug', 'test_init')

    const response = await app.fetch(new Request('http://localhost/upload', { method: 'POST', body: form }), {
      DB: { prepare: () => { throw new Error('D1 read failed') } } as unknown as D1Database,
      R2: {
        put: async () => undefined,
        delete: async (key: string) => { deletedKeys.push(key) },
      } as unknown as R2Bucket,
      JWT_SECRET: 'test-secret',
    })

    expect(response.status).toBe(500)
    expect(deletedKeys).toEqual([expect.stringMatching(/^avatars\/test_init_.*\.png$/)])
  })
})
