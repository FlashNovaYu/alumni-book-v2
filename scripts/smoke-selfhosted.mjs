const forbiddenHosts = ['alumni-book.pages.dev', 'alumni-book-api.chenyuhao2263.workers.dev']

export function assertStatus(actual, expected, path) {
  if (!expected.includes(actual)) throw new Error(`${path} 状态码异常：${actual}，预期 ${expected.join(', ')}`)
}

export function assertNoCloudflareHost(content, path) {
  if (forbiddenHosts.some((host) => content.includes(host))) throw new Error(`${path} 残留 Cloudflare 地址`)
}

async function request(baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const response = await fetch(url)
  const text = await response.text()
  assertNoCloudflareHost(text, path)
  return { response, text }
}

export async function smokeSelfHosted({ baseUrl = process.env.SELF_HOST_BASE_URL || 'http://127.0.0.1', apiOnly = false } = {}) {
  const health = await request(baseUrl, '/api/health')
  assertStatus(health.response.status, [200], '/api/health')
  const healthBody = JSON.parse(health.text)
  if (!healthBody.success || healthBody.data?.status !== 'ok') throw new Error('/api/health 返回内容异常')

  const readiness = await request(baseUrl, '/api/readiness')
  assertStatus(readiness.response.status, [200], '/api/readiness')
  const readinessBody = JSON.parse(readiness.text)
  if (!readinessBody.success || !readinessBody.data?.ready) throw new Error('/api/readiness 未 ready')

  const missingFile = await request(baseUrl, '/api/files/does-not-exist')
  assertStatus(missingFile.response.status, [404], '/api/files/does-not-exist')

  if (!apiOnly) {
    const home = await request(baseUrl, '/')
    assertStatus(home.response.status, [200], '/')
    const admin = await request(baseUrl, '/admin/')
    assertStatus(admin.response.status, [200], '/admin/')
    const release = await request(baseUrl, '/release.json')
    assertStatus(release.response.status, [200], '/release.json')
    const releaseBody = JSON.parse(release.text)
    if (releaseBody.target !== 'aliyun-selfhosted') {
      throw new Error(`/release.json 目标异常：${releaseBody.target || '(missing)'}`)
    }
  }
  console.log(`Self-hosted smoke test passed: ${baseUrl}`)
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1]?.endsWith('smoke-selfhosted.mjs')) {
  smokeSelfHosted({
    baseUrl: argument('--base-url'),
    apiOnly: process.argv.includes('--api-only'),
  }).catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
