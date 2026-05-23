const WORKER_HOST = 'https://alumni-book-api.chenyuhao2263.workers.dev'

export async function onRequest(context) {
  const { request, params } = context
  const url = new URL(request.url)
  const apiPath = params.path || ''
  const workerUrl = `${WORKER_HOST}/api/${apiPath}${url.search}`

  const proxyRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  })

  return fetch(proxyRequest)
}
