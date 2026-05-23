import { apiFetch, type ApiResponse } from '@alumni/shared'

function getToken(): string | null {
  return sessionStorage.getItem('admin_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  const url = `${API_BASE}${path}`

  const { headers: optHeaders, ...restOpts } = options

  const isFormData = options.body instanceof FormData

  const res = await fetch(url, {
    ...restOpts,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...optHeaders,
    },
  })

  if (res.status === 401) {
    sessionStorage.removeItem('admin_token')
    window.location.href = '/admin/#/login'
    throw new Error('未授权')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `请求失败: ${res.status}`)
  }

  return res.json()
}

export async function adminLogin(password: string): Promise<string> {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '登录失败' }))
    throw new Error(error.message)
  }

  const data = await res.json()
  const token = data.data?.token
  if (token) {
    sessionStorage.setItem('admin_token', token)
  }
  return token
}

export function adminLogout(): void {
  sessionStorage.removeItem('admin_token')
  window.location.href = '/admin/#/login'
}
