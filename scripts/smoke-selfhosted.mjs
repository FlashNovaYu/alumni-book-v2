const forbiddenHosts = ['alumni-book.pages.dev', 'alumni-book-api.chenyuhao2263.workers.dev']

export function assertStatus(actual, expected, path) {
  if (!expected.includes(actual)) throw new Error(`${path} 状态码异常：${actual}，预期 ${expected.join(', ')}`)
}

export function assertNoCloudflareHost(content, path) {
  if (forbiddenHosts.some((host) => content.includes(host))) throw new Error(`${path} 残留 Cloudflare 地址`)
}

const requiredSecurityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
}

export function assertSecurityHeaders(headers, path) {
  for (const [name, expected] of Object.entries(requiredSecurityHeaders)) {
    if (headers.get(name) !== expected) throw new Error(`${path} 缺少或错误的安全响应头：${name}`)
  }
}

export function assertHttpsBaseUrl(baseUrl) {
  let url
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error(`自托管 smoke 基址必须是 HTTPS URL：${baseUrl}`)
  }
  if (url.protocol !== 'https:') throw new Error(`自托管 smoke 基址必须使用 HTTPS：${baseUrl}`)
}

export function assertHttpRedirect(response, expectedHttpsUrl) {
  if (response.status !== 301) throw new Error(`HTTP 入口状态码异常：${response.status}，预期 301`)
  const location = response.headers.get('location')
  if (!location || new URL(location, expectedHttpsUrl).href !== expectedHttpsUrl) {
    throw new Error(`HTTP 入口未重定向到预期 HTTPS 地址：${expectedHttpsUrl}`)
  }
}

export function assertRobotsText(content, path) {
  const valid = /^User-agent:\s*\*/mi.test(content)
    && /^Disallow:\s*\/admin\/$/mi.test(content)
    && /^Disallow:\s*\/api\/$/mi.test(content)
    && !/^Allow:\s*\/$/mi.test(content)
    && !/<html/i.test(content)
  if (!valid) {
    throw new Error(`${path} 不是有效的 robots.txt 纯文本规则`)
  }
}

async function request(baseUrl, path, init = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const response = await fetch(url, init)
  const text = await response.text()
  assertNoCloudflareHost(text, path)
  return { response, text }
}

export async function smokeSelfHosted({ baseUrl = process.env.SELF_HOST_BASE_URL || '', apiOnly = false } = {}) {
  assertHttpsBaseUrl(baseUrl)
  const secureBaseUrl = baseUrl.replace(/\/$/, '')
  const httpBaseUrl = new URL(secureBaseUrl)
  httpBaseUrl.protocol = 'http:'
  const redirect = await request(httpBaseUrl.origin, '/', { redirect: 'manual' })
  assertHttpRedirect(redirect.response, `${secureBaseUrl}/`)
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
    assertSecurityHeaders(home.response.headers, '/')
    const admin = await request(baseUrl, '/admin/')
    assertStatus(admin.response.status, [200], '/admin/')
    assertSecurityHeaders(admin.response.headers, '/admin/')
    const robots = await request(baseUrl, '/robots.txt')
    assertStatus(robots.response.status, [200], '/robots.txt')
    if (!robots.response.headers.get('content-type')?.startsWith('text/plain')) {
      throw new Error('/robots.txt Content-Type 必须为 text/plain')
    }
    assertRobotsText(robots.text, '/robots.txt')
    for (const path of ['/assets/does-not-exist.js', '/admin/assets/does-not-exist.js', '/this-route-should-not-exist', '/llms.txt']) {
      const missing = await request(baseUrl, path)
      assertStatus(missing.response.status, [404], path)
    }
    for (const path of ['/roster/', '/album/', '/timeline/', '/mailbox/']) {
      const route = await request(baseUrl, path)
      assertStatus(route.response.status, [200], path)
    }
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
