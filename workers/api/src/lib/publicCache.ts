const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'

const PUBLIC_PATHS = new Set([
  '/api/config',
  '/api/classmates',
  '/api/albums',
  '/api/rankings',
  '/api/timeline',
])

function hasIdentityHeaders(request: Request): boolean {
  return Boolean(
    request.headers.get('authorization') ||
    request.headers.get('x-classmate-token') ||
    request.headers.get('cookie'),
  )
}

function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default
}

/** Only cache fixed, anonymous public JSON endpoints. The full URL retains query variants. */
export function isPublicStableGet(request: Request): boolean {
  return request.method === 'GET'
    && !hasIdentityHeaders(request)
    && PUBLIC_PATHS.has(new URL(request.url).pathname)
}

export function publicCacheControl(): string {
  return PUBLIC_CACHE_CONTROL
}

function mayUseEdgeCache(request: Request): boolean {
  const { hostname } = new URL(request.url)
  // Miniflare's shared test cache outlives database fixtures. Production edge
  // hostnames retain cache behavior; local development remains deterministic.
  return hostname !== 'localhost' && hostname !== '127.0.0.1'
}

/** Cache failures must never change the API response. */
export async function matchPublicCache(request: Request): Promise<Response | undefined> {
  if (!isPublicStableGet(request) || !mayUseEdgeCache(request)) return undefined
  return edgeCache().match(request).catch(() => undefined)
}

export function storePublicCache(request: Request, response: Response, waitUntil: (promise: Promise<unknown>) => void) {
  if (!isPublicStableGet(request) || !mayUseEdgeCache(request) || !response.ok || response.headers.get('Cache-Control') !== PUBLIC_CACHE_CONTROL) return
  waitUntil(edgeCache().put(request, response.clone()).catch(() => undefined))
}

export function clearPublicCache(request: Request, waitUntil: (promise: Promise<unknown>) => void) {
  if (request.method === 'GET') return
  const cacheKey = new Request(new URL(request.url), { method: 'GET' })
  waitUntil(edgeCache().delete(cacheKey).catch(() => false))
}
