import {
  ApiRequestError,
  requestJson,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from './network'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getToken(): string | null {
  return sessionStorage.getItem('admin_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function redirectToLogin(): void {
  sessionStorage.removeItem('admin_token')
  const adminBase = import.meta.env.BASE_URL || '/admin/'
  window.location.href = `${adminBase}#/login`
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = new Headers(options.headers)
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  for (const [name, value] of Object.entries(authHeaders())) {
    headers.set(name, value)
  }

  try {
    return await requestJson<T>(path, { ...options, headers }, {
      apiBase: API_BASE,
      timeoutMs: isFormData ? UPLOAD_REQUEST_TIMEOUT_MS : undefined,
    })
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      redirectToLogin()
      throw new Error('未授权')
    }
    throw error
  }
}

export async function adminLogin(password: string): Promise<string> {
  const data = await requestJson<{ data?: { token?: string }, message?: string }>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
    { apiBase: API_BASE },
  )

  const token = data.data?.token
  if (!token) {
    throw new Error(data.message || '登录响应异常，请重试')
  }
  sessionStorage.setItem('admin_token', token)
  return token
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await requestJson('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    }, { apiBase: API_BASE })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return false
    throw error
  }
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
  redirectToLogin()
}
