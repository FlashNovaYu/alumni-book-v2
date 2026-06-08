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
    const adminBase = import.meta.env.BASE_URL || '/admin/'
    window.location.href = `${adminBase}#/login`
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
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    throw new Error('网络连接失败，请检查网络后重试')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '登录失败' }))
    throw new Error(error.message || `请求失败 (${res.status})`)
  }

  const data = await res.json()
  const token = data.data?.token
  if (!token) {
    throw new Error(data.message || '登录响应异常，请重试')
  }
  sessionStorage.setItem('admin_token', token)
  return token
}

export async function adminLogout(): Promise<void> {
  const token = getToken()
  if (token) {
    try {
      await adminFetch('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      console.error('Logout failed on server:', e)
    }
  }
  sessionStorage.removeItem('admin_token')
  const adminBase = import.meta.env.BASE_URL || '/admin/'
  window.location.href = `${adminBase}#/login`
}
