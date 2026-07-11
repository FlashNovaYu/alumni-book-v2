import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiRequestError, requestJson } from '../src/api/network'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  const data = await requestJson<{ ok: boolean }>('/api/health', {}, {
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('network failed')
      return jsonResponse({ ok: true })
    },
  })

  assert.equal(attempts, 2)
  assert.deepEqual(data, { ok: true })
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

