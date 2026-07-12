import { Hono } from 'hono'

type Bindings = {
  R2: R2Bucket
}

export const filesRoutes = new Hono<{ Bindings: Bindings }>()

function createHeaders(object: R2Object) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Content-Length', String(object.size))
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Cloudflare-CDN-Cache-Control', 'max-age=31536000')
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return headers
}

function createCacheKey(request: Request) {
  const headers = new Headers(request.headers)
  headers.delete('Range')
  headers.delete('If-None-Match')
  return new Request(request.url, { method: 'GET', headers })
}

filesRoutes.on(['GET', 'HEAD'], '/files/*', async (c) => {
  const prefix = '/api/files/'
  const key = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : ''
  if (!key) {
    return c.json({ success: false, message: '文件路径无效' }, 400)
  }

  const conditionalEtag = c.req.header('If-None-Match')
  if (c.req.method === 'HEAD' || conditionalEtag) {
    const object = await c.env.R2.head(key)
    if (!object) return c.json({ success: false, message: '文件不存在' }, 404)

    const headers = createHeaders(object)
    if (conditionalEtag && object.httpEtag === conditionalEtag) {
      return new Response(null, { status: 304, headers })
    }
    if (c.req.method === 'HEAD') {
      return new Response(null, { status: 200, headers })
    }
  }

  if (c.req.header('Range')) {
    const object = await c.env.R2.get(key, { range: c.req.raw.headers })
    if (!object) return c.json({ success: false, message: '文件不存在' }, 404)
    if (!object.range) return c.json({ success: false, message: '请求范围无效' }, 416)

    const offset = 'suffix' in object.range
      ? Math.max(object.size - object.range.suffix, 0)
      : (object.range.offset || 0)
    const length = 'suffix' in object.range
      ? Math.min(object.range.suffix, object.size)
      : (object.range.length || object.size - offset)
    const headers = createHeaders(object)
    headers.set('Content-Length', String(length))
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    return new Response(object.body, { status: 206, headers })
  }

  const cache = typeof caches === 'undefined'
    ? null
    : (caches as unknown as { default: Cache }).default
  const cacheKey = createCacheKey(c.req.raw)
  if (cache) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
  }

  const object = await c.env.R2.get(key)
  if (!object) return c.json({ success: false, message: '文件不存在' }, 404)

  const response = new Response(object.body, { headers: createHeaders(object) })
  if (cache) {
    c.executionCtx.waitUntil(
      cache.put(cacheKey, response.clone()).catch((error: unknown) => {
        console.error('Failed to cache R2 file:', error)
      }),
    )
  }
  return response
})
