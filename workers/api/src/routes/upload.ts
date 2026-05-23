import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

export const uploadRoutes = new Hono<{ Bindings: Bindings }>()

uploadRoutes.post('/upload', async (c) => {
  const db = c.env.DB
  const r2 = c.env.R2

  if (!r2) {
    return c.json({ success: false, message: '文件存储(R2)未启用，请在 Cloudflare Dashboard 启用 R2' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string
  const slug = formData.get('slug') as string
  const albumId = formData.get('albumId') as string

  if (!file) {
    return c.json({ success: false, message: '没有文件' }, 400)
  }

  const ext = file.name.split('.').pop() || 'bin'
  const timestamp = Date.now()
  let r2Key = ''

  if (type === 'avatar' && slug) {
    r2Key = `avatars/${slug}_${timestamp}.${ext}`
  } else if (type === 'music' && slug) {
    r2Key = `music/${slug}_${timestamp}.${ext}`
  } else if (type === 'photo' && albumId) {
    r2Key = `photos/${albumId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  } else if (type === 'background' && slug) {
    r2Key = `backgrounds/${slug}_${timestamp}.${ext}`
  } else {
    r2Key = `misc/${timestamp}_${file.name}`
  }

  await r2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  const origin = new URL(c.req.url).origin
  const publicUrl = `${origin}/api/files/${r2Key}`

  if (type === 'avatar' && slug) {
    await db.prepare('UPDATE students SET avatar_url = ? WHERE slug = ?').bind(publicUrl, slug).run()
  }

  if (type === 'music' && slug) {
    await db.prepare('UPDATE students SET music_url = ? WHERE slug = ?').bind(publicUrl, slug).run()
  }

  if (type === 'photo' && albumId) {
    const photoId = `photo_${timestamp}_${Math.random().toString(36).slice(2, 6)}`
    await db.prepare(
      'INSERT INTO photos (id, album_id, filename, r2_key) VALUES (?, ?, ?, ?)'
    ).bind(photoId, albumId, file.name, r2Key).run()
  }

  return c.json({ success: true, data: { url: publicUrl, r2Key } })
})
