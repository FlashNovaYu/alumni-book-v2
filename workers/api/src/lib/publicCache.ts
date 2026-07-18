const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'

const PUBLIC_PATHS = new Set([
  '/api/config',
  '/api/classmates',
  '/api/albums',
  '/api/rankings',
  '/api/timeline',
])
const CANONICAL_TIMELINE_SEARCHES = new Set(['', '?type=event', '?type=message', '?type=photo', '?type=join'])

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
  if (request.method !== 'GET' || hasIdentityHeaders(request)) return false
  const url = new URL(request.url)
  if (!PUBLIC_PATHS.has(url.pathname)) return false
  if (url.pathname !== '/api/timeline') return url.search === ''
  return CANONICAL_TIMELINE_SEARCHES.has(url.search)
}

export function publicCacheControl(): string {
  return PUBLIC_CACHE_CONTROL
}

function mayUseEdgeCache(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

function canonicalPublicCacheKey(request: Request): Request | null {
  if (!isPublicStableGet(request) || !mayUseEdgeCache(request)) return null
  const url = new URL(request.url)
  return new Request(`${url.origin}${url.pathname}${url.search}`, { method: 'GET' })
}

/** Cache failures must never change the API response. */
export async function matchPublicCache(request: Request): Promise<Response | undefined> {
  const key = canonicalPublicCacheKey(request)
  if (!key) return undefined
  return edgeCache().match(key).catch(() => undefined)
}

export function storePublicCache(request: Request, response: Response, waitUntil: (promise: Promise<unknown>) => void) {
  const key = canonicalPublicCacheKey(request)
  if (!key || !response.ok || response.headers.get('Cache-Control') !== PUBLIC_CACHE_CONTROL) return
  waitUntil(edgeCache().put(key, response.clone()).catch(() => undefined))
}

export function clearPublicCache(request: Request, waitUntil: (promise: Promise<unknown>) => void) {
  if (request.method === 'GET') return
  const url = new URL(request.url)
  const path = url.pathname
  const targets = new Set<string>()
  const add = (target: string, queries: string[] = ['']) => queries.forEach((query) => targets.add(`${url.origin}${target}${query}`))
  if (path === '/api/config' || path.startsWith('/api/config/')) add('/api/config')
  if (path.startsWith('/api/albums') || path.startsWith('/api/photos') || path.startsWith('/api/upload')) add('/api/albums')
  if (path.startsWith('/api/timeline')) add('/api/timeline', ['', '?type=event', '?type=message', '?type=photo', '?type=join'])
  if (path.startsWith('/api/students') || path.startsWith('/api/classmate/students') || path === '/api/classmate/upload') {
    add('/api/classmates')
    add('/api/rankings')
    add('/api/timeline', ['', '?type=event', '?type=message', '?type=photo', '?type=join'])
  }
  if (path.startsWith('/api/messages') || path.startsWith('/api/public-messages')) {
    add('/api/rankings')
    add('/api/timeline', ['', '?type=event', '?type=message', '?type=photo', '?type=join'])
  }
  if (targets.size === 0) return
  waitUntil(Promise.all([...targets].map((target) => edgeCache().delete(new Request(target, { method: 'GET' })).catch(() => false))))
}
