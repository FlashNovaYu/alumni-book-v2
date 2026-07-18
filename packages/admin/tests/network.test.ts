import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiRequestError, requestJson } from '../src/api/network'
import { adminFetch, changeAdminPassword, clearCurrentAdminCache, fetchCurrentAdmin } from '../src/api/client'
import type { AdminIdentity } from '@alumni/shared'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) || null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: '' } } })

const admin: AdminIdentity = {
  id: 'admin-1', displayName: '管理员', accountType: 'standalone', studentSlug: null,
  isOwner: true, mustChangePassword: false, permissions: [],
}

test('空 API 基址保持同源请求路径', async () => {
  let requestedUrl = ''
  const data = await requestJson<{ ok: boolean }>('/api/health', {}, {
    apiBase: '',
    fetchImpl: async (input) => {
      requestedUrl = String(input)
      return jsonResponse({ ok: true })
    },
  })

  assert.equal(requestedUrl, '/api/health')
  assert.deepEqual(data, { ok: true })
})

test('GET 网络异常后自动重试一次', async () => {
  let attempts = 0
  const startedAt = performance.now()
  const data = await requestJson<{ ok: boolean }>('/api/health', {}, {
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('network failed')
      return jsonResponse({ ok: true })
    },
  })

  assert.equal(attempts, 2)
  assert.deepEqual(data, { ok: true })
  assert.ok(performance.now() - startedAt >= 200)
})

test('GET 收到临时网关错误后自动重试一次', async () => {
  let attempts = 0
  const data = await requestJson<{ ok: boolean }>('/api/health', {}, {
    fetchImpl: async () => {
      attempts += 1
      return attempts === 1
        ? jsonResponse({ message: '暂时不可用' }, 503)
        : jsonResponse({ ok: true })
    },
  })

  assert.equal(attempts, 2)
  assert.deepEqual(data, { ok: true })
})

test('POST 网络异常不会自动重试', async () => {
  let attempts = 0

  await assert.rejects(
    requestJson('/api/students', { method: 'POST' }, {
      fetchImpl: async () => {
        attempts += 1
        throw new TypeError('network failed')
      },
    }),
    (error: unknown) => error instanceof ApiRequestError
      && error.message === '网络连接失败，请检查网络后重试',
  )

  assert.equal(attempts, 1)
})
test('后端错误保留状态码和 message', async () => {
  await assert.rejects(
    requestJson('/api/auth/login', { method: 'POST' }, {
      fetchImpl: async () => jsonResponse({ message: '密码错误' }, 401),
    }),
    (error: unknown) => error instanceof ApiRequestError
      && error.status === 401
      && error.message === '密码错误',
  )
})

test('成功响应不是有效 JSON 时返回明确错误', async () => {
  await assert.rejects(
    requestJson('/api/health', {}, {
      fetchImpl: async () => new Response('not-json', { status: 200 }),
    }),
    (error: unknown) => error instanceof ApiRequestError
      && error.message === '服务器响应格式异常',
  )
})

test('请求超过时限时中止并返回超时错误', async () => {
  let attempts = 0

  await assert.rejects(
    requestJson('/api/students', { method: 'POST' }, {
      timeoutMs: 5,
      fetchImpl: async (_input, init) => {
        attempts += 1
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        })
      },
    }),
    (error: unknown) => error instanceof ApiRequestError
      && error.message === '请求超时，请稍后重试',
  )

  assert.equal(attempts, 1)
})

test('调用方 AbortSignal 会立即中止且不会重试', async () => {
  const controller = new AbortController()
  let attempts = 0
  const request = requestJson('/api/students', { signal: controller.signal }, {
    fetchImpl: async (_input, init) => {
      attempts += 1
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')), { once: true })
      })
    },
  })
  controller.abort()

  await assert.rejects(request, (error: unknown) => error instanceof DOMException && error.name === 'AbortError')
  assert.equal(attempts, 1)
})

test('同一管理令牌的并发身份读取只发起一次请求', async () => {
  storage.clear()
  storage.setItem('admin_token', 'token-a')
  clearCurrentAdminCache()
  let calls = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return jsonResponse({ success: true, data: { admin } })
  }

  try {
    const results = await Promise.all([fetchCurrentAdmin(), fetchCurrentAdmin(), fetchCurrentAdmin()])
    assert.equal(calls, 1)
    assert.deepEqual(results, [admin, admin, admin])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('管理令牌变化后不复用旧身份缓存', async () => {
  storage.clear()
  storage.setItem('admin_token', 'token-a')
  clearCurrentAdminCache()
  let calls = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return jsonResponse({ success: true, data: { admin: { ...admin, id: `admin-${calls}` } } })
  }

  try {
    const first = await fetchCurrentAdmin()
    storage.setItem('admin_token', 'token-b')
    const second = await fetchCurrentAdmin()
    assert.equal(calls, 2)
    assert.notEqual(first.id, second.id)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('改密成功后刷新身份而不复用旧的改密状态缓存', async () => {
  storage.clear()
  storage.setItem('admin_token', 'token-a')
  clearCurrentAdminCache()
  const requestedPaths: string[] = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const path = String(input)
    requestedPaths.push(path)
    if (path === '/api/auth/me') {
      const mustChangePassword = requestedPaths.filter((item) => item === '/api/auth/me').length === 1
      return jsonResponse({ success: true, data: { admin: { ...admin, mustChangePassword } } })
    }
    if (path === '/api/auth/change-password') return jsonResponse({ success: true })
    throw new Error(`未预期的请求: ${path}`)
  }

  try {
    assert.equal((await fetchCurrentAdmin()).mustChangePassword, true)
    await changeAdminPassword('old-password', 'new-password', 'new-password')
    const refreshedAdmin = await fetchCurrentAdmin()

    assert.equal(refreshedAdmin.mustChangePassword, false)
    assert.deepEqual(requestedPaths, ['/api/auth/me', '/api/auth/change-password', '/api/auth/me'])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('401 仍清空会话并跳转登录页', async () => {
  storage.clear()
  storage.setItem('admin_token', 'expired-token')
  clearCurrentAdminCache()
  ;(globalThis.window as { location: { href: string } }).location.href = ''
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => jsonResponse({ message: '登录已过期' }, 401)

  try {
    await assert.rejects(adminFetch('/api/auth/me'), /未授权/)
    assert.equal(storage.getItem('admin_token'), null)
    assert.match((globalThis.window as { location: { href: string } }).location.href, /#\/login$/)
  } finally {
    globalThis.fetch = previousFetch
  }
})
