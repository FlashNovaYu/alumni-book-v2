export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const UPLOAD_REQUEST_TIMEOUT_MS = 60_000

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504])

export class ApiRequestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

interface RequestPolicy {
  apiBase?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function buildUrl(apiBase: string, path: string): string {
  if (!apiBase) return path
  return `${apiBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (response.ok) {
      throw new ApiRequestError('服务器响应格式异常', response.status)
    }
    return undefined
  }
}

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  policy: RequestPolicy = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const maxAttempts = method === 'GET' ? 2 : 1
  const fetchImpl = policy.fetchImpl || fetch
  const timeoutMs = policy.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const url = buildUrl(policy.apiBase || '', path)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal })

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts) {
        continue
      }

      const body = await parseJson(response)
      if (!response.ok) {
        const message = typeof body === 'object' && body !== null && 'message' in body
          ? String(body.message)
          : `请求失败: ${response.status}`
        throw new ApiRequestError(message, response.status)
      }

      return body as T
    } catch (error) {
      if (error instanceof ApiRequestError) throw error
      if (attempt < maxAttempts) continue
      throw new ApiRequestError(
        timedOut ? '请求超时，请稍后重试' : '网络连接失败，请检查网络后重试',
      )
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  throw new ApiRequestError('网络连接失败，请检查网络后重试')
}
