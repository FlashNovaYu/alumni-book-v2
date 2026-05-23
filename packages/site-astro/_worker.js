export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // 代理 /api/* 请求到 Worker
    if (url.pathname.startsWith('/api/')) {
      const workerUrl = `https://alumni-book-api.chenyuhao2263.workers.dev${url.pathname}${url.search}`
      const proxy = new Request(workerUrl, request)
      return fetch(proxy)
    }

    // 其余请求走静态资源
    return env.ASSETS.fetch(request)
  }
}
