import { env, createExecutionContext } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectImageFormat, validateImageUpload } from '../src/lib/imageValidation'
import { classmateRoutes } from '../src/routes/classmate'
import { uploadRoutes } from '../src/routes/upload'
import { initTestDb } from './db-helper'

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const heicHeader = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
const student = { id: 'image_validation_student', name: '图片校验同学', slug: 'image-validation-user' }
const classmateToken = 'image-validation-session'
const bindings = { DB: env.DB, R2: env.R2, JWT_SECRET: 'test-secret' }
const adminApi = new Hono<{ Bindings: typeof bindings }>()
adminApi.route('/api', uploadRoutes)

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(
    'INSERT OR REPLACE INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)',
  ).bind(student.id, student.name, student.slug, '{}').run()
  await env.DB.prepare(
    "INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))",
  ).bind(classmateToken, student.slug).run()
})

function uploadForm(bytes: Uint8Array, filename: string) {
  const formData = new FormData()
  formData.append('file', new File([bytes], filename, { type: 'image/png' }))
  formData.append('type', 'avatar')
  formData.append('slug', student.slug)
  return formData
}

describe('image validation', () => {
  it('rejects HEIC content declared as a PNG image', () => {
    expect(validateImageUpload('image/png', heicHeader.buffer)).toBeNull()
  })

  it('recognizes a PNG signature and returns canonical metadata', () => {
    expect(detectImageFormat(pngHeader.buffer)).toEqual({
      mime: 'image/png',
      extension: 'png',
    })
    expect(validateImageUpload('image/png', pngHeader.buffer)).toEqual({
      mime: 'image/png',
      extension: 'png',
    })
  })

  it('rejects disguised HEIC uploads from both routes before R2 writes', async () => {
    const classmateAvatarBefore = (await env.DB.prepare(
      'SELECT avatar_url FROM students WHERE slug = ?',
    ).bind(student.slug).first() as any)?.avatar_url
    const classmateResponse = await classmateRoutes.fetch(new Request('http://localhost/classmate/upload', {
      method: 'POST',
      headers: { 'X-Classmate-Token': classmateToken },
      body: uploadForm(heicHeader, 'avatar.png'),
    }), bindings, createExecutionContext())

    expect(classmateResponse.status).toBe(400)
    expect((await classmateResponse.json() as any).message).toBe('图片内容与文件格式不一致')
    const classmateAvatarAfter = (await env.DB.prepare(
      'SELECT avatar_url FROM students WHERE slug = ?',
    ).bind(student.slug).first() as any)?.avatar_url
    expect(classmateAvatarAfter).toBe(classmateAvatarBefore)

    const adminAvatarBefore = (await env.DB.prepare(
      'SELECT avatar_url FROM students WHERE slug = ?',
    ).bind(student.slug).first() as any)?.avatar_url
    const adminResponse = await adminApi.fetch(new Request('http://localhost/api/upload', {
      method: 'POST',
      body: uploadForm(heicHeader, 'avatar.png'),
    }), bindings, createExecutionContext())

    expect(adminResponse.status).toBe(400)
    expect((await adminResponse.json() as any).message).toBe('图片内容与文件格式不一致')
    const adminAvatarAfter = (await env.DB.prepare(
      'SELECT avatar_url FROM students WHERE slug = ?',
    ).bind(student.slug).first() as any)?.avatar_url
    expect(adminAvatarAfter).toBe(adminAvatarBefore)
    expect((await env.R2.list({ prefix: `avatars/${student.slug}_` })).objects).toHaveLength(0)
  })

  it('uses a canonical extension for a valid PNG upload', async () => {
    const response = await classmateRoutes.fetch(new Request('http://localhost/classmate/upload', {
      method: 'POST',
      headers: { 'X-Classmate-Token': classmateToken },
      body: uploadForm(pngHeader, 'avatar.heic'),
    }), bindings, createExecutionContext())
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.data.r2Key).toMatch(new RegExp(`^avatars/${student.slug}_\\d+\\.png$`))
    expect((await env.R2.get(body.data.r2Key))?.httpMetadata?.contentType).toBe('image/png')
  })

  it('uses a canonical extension and MIME for a valid PNG admin upload', async () => {
    const response = await adminApi.fetch(new Request('http://localhost/api/upload', {
      method: 'POST',
      body: uploadForm(pngHeader, 'avatar.heic'),
    }), bindings, createExecutionContext())
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.data.r2Key).toMatch(new RegExp(`^avatars/${student.slug}_\\d+\\.png$`))
    expect((await env.R2.get(body.data.r2Key))?.httpMetadata?.contentType).toBe('image/png')
  })
})
