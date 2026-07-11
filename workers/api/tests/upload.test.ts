import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import worker from '../src/index'
import { uploadRoutes } from '../src/routes/upload'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug, avatar_url, background_url, privacy_level, info)
    VALUES ('test_zhangsan', '张三', 'zhangsan', '', '', 'classmates', '{}')
  `).run()
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug, info)
    VALUES ('test_lisi', '李四', 'lisi', '{}')
  `).run()
})

describe('Classmate Self-Service Upload', () => {
  function createMiscImageUploadRequest() {
    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'same-image.png', { type: 'image/png' }))
    formData.append('type', 'misc')

    return new Request('http://localhost/upload', {
      method: 'POST',
      body: formData,
    })
  }

  async function getTokens() {
    const tReqZs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan' }) // zhangsan 未设复杂口令可用空/无匹配直接过
    })
    const tResZs = await worker.fetch(tReqZs, env, createExecutionContext())
    const tBodyZs = await tResZs.json() as any
    const zsToken = tBodyZs.data.token

    const tReqLs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '李四', slug: 'lisi' })
    })
    const tResLs = await worker.fetch(tReqLs, env, createExecutionContext())
    const tBodyLs = await tResLs.json() as any
    const lsToken = tBodyLs.data.token

    return { zsToken, lsToken }
  }

  it('rejects upload with invalid MIME type', async () => {
    const { zsToken } = await getTokens()
    const file = new File(['dummy plain text'], 'avatar.txt', { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'avatar')
    formData.append('slug', 'zhangsan')

    const req = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: {
        'X-Classmate-Token': zsToken
      },
      body: formData
    })

    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.success).toBe(false)
    expect(body.message).toContain('不支持的文件格式')
  })

  it('rejects upload exceeding size limit', async () => {
    const { zsToken } = await getTokens()
    // 制造一个大于 2MB (MAX_SIZES['avatar']) 的文件
    const size = 2.1 * 1024 * 1024
    const largeBuffer = new Uint8Array(size)
    const file = new File([largeBuffer], 'avatar.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'avatar')
    formData.append('slug', 'zhangsan')

    const req = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: {
        'X-Classmate-Token': zsToken
      },
      body: formData
    })

    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(413)
    const body = await res.json() as any
    expect(body.success).toBe(false)
    expect(body.message).toContain('体积超出限制')
  })

  it('allows valid image upload', async () => {
    const { zsToken } = await getTokens()
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'avatar')
    formData.append('slug', 'zhangsan')

    const req = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: {
        'X-Classmate-Token': zsToken
      },
      body: formData
    })

    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.url).toContain('/api/files/avatars/zhangsan_')
    expect(body.data.r2Key).toContain('avatars/zhangsan_')
  })

  it('generates distinct misc image keys when uploads share the same millisecond', async () => {
    const fixedNow = 1_700_000_000_000
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    try {
      const [firstRes, secondRes] = await Promise.all([
        uploadRoutes.fetch(createMiscImageUploadRequest(), env),
        uploadRoutes.fetch(createMiscImageUploadRequest(), env),
      ])
      const first = await firstRes.json() as any
      const second = await secondRes.json() as any

      expect(first.data.r2Key).toContain(`misc/${fixedNow}_same-image.png_`)
      expect(second.data.r2Key).toContain(`misc/${fixedNow}_same-image.png_`)
      expect(first.data.r2Key).not.toBe(second.data.r2Key)
    } finally {
      dateNow.mockRestore()
    }
  })

  it('rejects upload for other classmate (cross-user violation)', async () => {
    const { lsToken } = await getTokens()
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'avatar')
    formData.append('slug', 'zhangsan') // 李四试图为张三上传头像

    const req = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: {
        'X-Classmate-Token': lsToken
      },
      body: formData
    })

    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(403)
    const body = await res.json() as any
    expect(body.success).toBe(false)
    expect(body.message).toContain('只能编辑自己的资料')
  })
})
