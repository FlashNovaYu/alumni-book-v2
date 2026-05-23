const WORKER_HOST = 'https://alumni-book-api.chenyuhao2263.workers.dev'
const CACHE_MAX_AGE = 3600
const CACHEABLE_PREFIX = '/api/files/'

// Pages Advanced Mode 中 caches.default 可能不可用，用 fallback
const cache = typeof caches !== 'undefined' ? caches.default : null

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      const workerUrl = `${WORKER_HOST}${url.pathname}${url.search}`
      const proxy = new Request(workerUrl, request)

      if (url.pathname.startsWith(CACHEABLE_PREFIX)) {
        // 尝试缓存命中
        if (cache) {
          const cached = await cache.match(request)
          if (cached) return cached
        }

        const response = await fetch(proxy)
        if (response.ok) {
          const toCache = new Response(response.body, response)
          toCache.headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`)
          toCache.headers.set('Cloudflare-CDN-Cache-Control', `max-age=${CACHE_MAX_AGE}`)

          if (cache) {
            ctx.waitUntil(cache.put(request, toCache.clone()))
          }
          return toCache
        }
        return response
      }

      return fetch(proxy)
    }

    return env.ASSETS.fetch(request)
  }
}
