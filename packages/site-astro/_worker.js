const WORKER_HOST = 'https://alumni-book-api.chenyuhao2263.workers.dev'

// 对图片/文件类请求启用边缘缓存，缓存时间 1 小时
const CACHE_MAX_AGE = 3600
const CACHEABLE_PREFIX = '/api/files/'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // 代理 /api/* 请求到 Worker
    if (url.pathname.startsWith('/api/')) {
      const workerUrl = `${WORKER_HOST}${url.pathname}${url.search}`
      const proxy = new Request(workerUrl, request)

      // 对文件请求使用 Cache API 做边缘缓存
      if (url.pathname.startsWith(CACHEABLE_PREFIX)) {
        const cache = caches.default
        const cached = await cache.match(request)
        if (cached) return cached

        const response = await fetch(proxy)
        if (response.ok) {
          const toCache = new Response(response.body, response)
          toCache.headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`)
          toCache.headers.set('CDN-Cache-Control', `max-age=${CACHE_MAX_AGE}`)
          ctx.waitUntil(cache.put(request, toCache.clone()))
          return toCache
        }
        return response
      }

      return fetch(proxy)
    }

    // 其余请求走静态资源
    return env.ASSETS.fetch(request)
  }
}
