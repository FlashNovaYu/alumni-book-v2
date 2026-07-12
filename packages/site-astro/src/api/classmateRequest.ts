import { getClassmateToken, type ApiResponse } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

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
}

function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export async function requestClassmateApi<T>(
  apiBase: string,
  path: string,
  options: ClassmateRequestOptions = {},
  fallback = '请求失败',
): Promise<T> {
  const token = getClassmateToken()
  if (!token) throw new ApiRequestError('请先登录同学账号', 401)

  const { expectData = true, headers, ...requestOptions } = options
  const requestHeaders = new Headers(headers)
  requestHeaders.set('X-Classmate-Token', token)
  const res = await fetch(joinApiUrl(apiBase, path), {
    ...requestOptions,
    headers: requestHeaders,
  })
  const payload = await res.json().catch(() => null) as ApiResponse<T> | null

  if (!res.ok || !payload?.success || (expectData && payload.data === undefined)) {
    throw new ApiRequestError(
      payload?.message || fallback,
      res.status,
      parseRetryAfter(res.headers.get('Retry-After')),
    )
  }

  return payload.data as T
}
