import { getClassmateToken } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export class ApiRequestError extends Error {
  status: number
  retryAfter?: number

  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export function getRequiredClassmateToken(): string {
  const token = getClassmateToken()
  if (!token) {
    throw new ApiRequestError('未登录同学账号', 401)
  }
  return token
}

export async function apiFetch<T>(
  apiBase: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getRequiredClassmateToken()
  const url = joinApiUrl(apiBase, path)
  
  const headers: Record<string, string> = {
    'X-Classmate-Token': token,
    ...(init?.headers as Record<string, string> || {})
  }

  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch (err: any) {
    throw new ApiRequestError(err.message || '网络请求失败', 500)
  }

  if (!res.ok) {
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined
    let msg = `请求失败: ${res.status}`
    try {
      const body = await res.json() as any
      if (body && body.message) {
        msg = body.message
      }
    } catch {}
    throw new ApiRequestError(msg, res.status, retryAfter)
  }

  const data = await res.json() as any
  if (!data || typeof data !== 'object' || data.success === false) {
    throw new ApiRequestError(data?.message || '操作失败', 400)
  }
  return data.data as T
}

declare global {
  interface Object {
    approvedMessages?: any
    messages?: any
  }
}
