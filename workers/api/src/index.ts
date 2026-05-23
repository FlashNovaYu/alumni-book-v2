import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'
import { studentsRoutes } from './routes/students'
import { configRoutes } from './routes/config'
import { albumsRoutes } from './routes/albums'
import { uploadRoutes } from './routes/upload'
import { authRoutes } from './routes/auth'
import { messagesRoutes } from './routes/messages'
import { timelineRoutes } from './routes/timeline'
import { classmateRoutes } from './routes/classmate'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
  CORS_ORIGIN: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN || '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
  return corsMiddleware(c, next)
})

// 创建 JWT 中间件
function createJwtMiddleware(secret: string) {
  return jwt({ secret, alg: 'HS256' })
}

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', version: '2.0.0' } })
})

// 认证路由 (不需要 JWT)
app.route('/api/auth', authRoutes)

// 公开路由 (不需要 JWT)
app.get('/api/classmates', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT name, slug, avatar_url, info FROM students ORDER BY name'
  ).all()

  const classmates = (results || []).map((row: any) => {
    const info = JSON.parse(row.info || '{}')
    return {
      name: row.name,
      slug: row.slug,
      hasPage: true,
      avatarUrl: row.avatar_url,
      motto: info.motto || '',
    }
  })

  return c.json({ success: true, data: classmates })
})

app.get('/api/students', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT * FROM students ORDER BY name'
  ).all()

  const students = (results || []).map(formatStudent)
  return c.json({ success: true, data: students })
})

app.get('/api/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const row = await db.prepare('SELECT * FROM students WHERE slug = ?').bind(slug).first()

  if (!row) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  return c.json({ success: true, data: formatStudent(row) })
})

app.get('/api/config', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT key, value FROM site_config').all()

  const config: Record<string, any> = {}
  for (const row of results || []) {
    try {
      config[(row as any).key] = JSON.parse((row as any).value)
    } catch {
      config[(row as any).key] = (row as any).value
    }
  }

  return c.json({
    success: true,
    data: {
      particles: config.particles || {},
      footer: config.footer || { copyright: '同学录 · 青春回忆', beian: '', beianUrl: '' },
      preface: config.preface || { title: '致青春岁月', subtitle: '写在翻开同学录之前', content: '' },
      acknowledgments: config.acknowledgments || [],
      typography: config.typography || { fontFamily: 'default', fontSize: 15 },
    },
  })
})

app.get('/api/albums', async (c) => {
  const db = c.env.DB
  const { results: albums } = await db.prepare(
    'SELECT * FROM albums ORDER BY sort_order, created_at'
  ).all()

  const albumsWithPhotos = await Promise.all(
    (albums || []).map(async (album: any) => {
      const { results: photos } = await db.prepare(
        'SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order'
      ).bind(album.id).all()

      return {
        id: album.id,
        title: album.title,
        description: album.description,
        frameStyle: album.frame_style,
        sortOrder: album.sort_order,
        photos: (photos || []).map((p: any) => ({
          id: p.id,
          albumId: p.album_id,
          filename: p.filename,
          caption: p.caption,
          r2Key: p.r2_key,
          sortOrder: p.sort_order,
          createdAt: p.created_at,
        })),
        createdAt: album.created_at,
      }
    })
  )

  return c.json({ success: true, data: albumsWithPhotos })
})

// 同学自助路由 (HMAC token 认证，无需 JWT)
app.route('/api', classmateRoutes)

// 访问计数
app.post('/api/students/:slug/visit', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  await db.prepare('UPDATE students SET visit_count = visit_count + 1 WHERE slug = ?').bind(slug).run()
  const row = await db.prepare('SELECT visit_count FROM students WHERE slug = ?').bind(slug).first()
  return c.json({ success: true, data: { visitCount: (row as any)?.visit_count || 0 } })
})

// 人气排行
app.get('/api/rankings', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT name, slug, avatar_url, visit_count FROM students WHERE visit_count > 0 ORDER BY visit_count DESC LIMIT 20'
  ).all()
  const rankings = (results || []).map((r: any) => ({
    name: r.name,
    slug: r.slug,
    avatarUrl: r.avatar_url,
    visitCount: r.visit_count,
  }))
  return c.json({ success: true, data: rankings })
})

// R2 文件访问
app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '')
  if (!key) {
    return c.json({ success: false, message: '文件路径无效' }, 400)
  }
  if (!c.env.R2) {
    return c.json({ success: false, message: '文件存储(R2)未启用' }, 503)
  }
  const object = await c.env.R2.get(key)

  if (!object) {
    return c.json({ success: false, message: '文件不存在' }, 404)
  }

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=31536000')

  return new Response(object.body, { headers })
})

// 需要认证的路由
app.use('/api/admin/*', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

// JWT 中间件包装器
function jwtGuard(secret: string) {
  const mw = createJwtMiddleware(secret)
  return async (c: any, next: any) => {
    try {
      await mw(c, next)
    } catch (e) {
      if (e instanceof HTTPException) return e.getResponse()
      throw e
    }
  }
}

app.use('/api/students', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/students/:slug', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/config', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/albums', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/albums/:id', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/upload', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/admin/messages', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/admin/messages/:id', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/timeline/events', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/timeline/events/:id', async (c, next) => {
  return jwtGuard(c.env.JWT_SECRET)(c, next)
})

// 注册路由
app.route('/api', studentsRoutes)
app.route('/api', configRoutes)
app.route('/api', albumsRoutes)
app.route('/api', uploadRoutes)
app.route('/api', messagesRoutes)
app.route('/api', timelineRoutes)

// 管理后台统计
app.get('/api/admin/stats', async (c) => {
  const db = c.env.DB
  const students = await db.prepare('SELECT COUNT(*) as count FROM students').first()
  const albums = await db.prepare('SELECT COUNT(*) as count FROM albums').first()
  const photos = await db.prepare('SELECT COUNT(*) as count FROM photos').first()

  return c.json({
    success: true,
    data: {
      studentCount: (students as any)?.count || 0,
      albumCount: (albums as any)?.count || 0,
      photoCount: (photos as any)?.count || 0,
    },
  })
})

// 错误处理
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  console.error('Worker error:', err)
  return c.json({ success: false, message: '服务器内部错误' }, 500)
})

app.notFound((c) => {
  return c.json({ success: false, message: '接口不存在' }, 404)
})

function formatStudent(row: any) {
  const info = JSON.parse(row.info || '{}')
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isOwner: !!row.is_owner,
    avatarUrl: row.avatar_url,
    musicUrl: row.music_url,
    musicTitle: row.music_title,
    musicAutoplay: !!row.music_autoplay,
    backgroundUrl: row.background_url,
    backgroundColor: row.background_color,
    customHtml: row.custom_html,
    info: {
      ...info,
      mbti: row.mbti || info.mbti || '',
      graduationYear: row.graduation_year || info.graduationYear || '',
      school: row.school || info.school || '',
      class: row.class_name || info.class || '',
    },
    photos: JSON.parse(row.photos || '[]'),
    visitCount: row.visit_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default app
