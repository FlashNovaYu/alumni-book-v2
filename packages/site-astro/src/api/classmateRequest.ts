import { getClassmateToken, type ApiResponse } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'
import { handleClassmateUnauthorized } from './classmateSession'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

interface ClassmateRequestOptions extends RequestInit {
  expectData?: boolean
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function readPayload<T>(res: Response, signal: AbortSignal): Promise<ApiResponse<T> | null> {
  let abortHandler: (() => void) | null = null
  const aborted = new Promise<never>((_, reject) => {
    abortHandler = () => reject(new DOMException('请求已取消', 'AbortError'))
    if (signal.aborted) abortHandler()
    else signal.addEventListener('abort', abortHandler, { once: true })
  })
  try {
    return await Promise.race([
      res.json().catch(() => null) as Promise<ApiResponse<T> | null>,
      aborted,
    ])
  } finally {
    if (abortHandler) signal.removeEventListener('abort', abortHandler)
  }
}

export async function requestClassmateApi<T>(
  apiBase: string,
  path: string,
  options: ClassmateRequestOptions = {},
  fallback = '请求失败',
): Promise<T> {
  const token = getClassmateToken()
  if (!token) throw new ApiRequestError('请先登录同学账号', 401)

  const { expectData = true, timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...requestOptions } = options
  const requestHeaders = new Headers(headers)
  requestHeaders.set('X-Classmate-Token', token)
  const controller = new AbortController()
  let timedOut = false
  const forwardAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const res = await fetch(joinApiUrl(apiBase, path), {
      ...requestOptions,
      signal: controller.signal,
      headers: requestHeaders,
    })
    if (timedOut) throw new ApiRequestError('请求超时，请稍后重试', 408)
    const payload = await readPayload<T>(res, controller.signal)

    if (res.status === 401) handleClassmateUnauthorized()

    if (!res.ok || !payload?.success || (expectData && payload.data === undefined)) {
      throw new ApiRequestError(
        payload?.message || fallback,
        res.status,
        parseRetryAfter(res.headers.get('Retry-After')),
      )
    }

    return payload.data as T
  } catch (cause) {
    if (timedOut) throw new ApiRequestError('请求超时，请稍后重试', 408)
    throw cause
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
