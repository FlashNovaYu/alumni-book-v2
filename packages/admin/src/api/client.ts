import type { AdminIdentity, ApiResponse } from '@alumni/shared'

let currentAdmin: AdminIdentity | null = null

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
    currentAdmin = null
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

export async function adminLogin(username: string, password: string): Promise<{ needsSetup: boolean; admin: AdminIdentity | null }> {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new Error('网络连接失败，请检查网络后重试')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '登录失败' }))
    throw new Error(error.message || `请求失败 (${res.status})`)
  }

  const data = await res.json()
  const setupToken = data.data?.setupToken
  if (setupToken) {
    sessionStorage.setItem('admin_setup_token', setupToken)
    return { needsSetup: true, admin: null }
  }
  const token = data.data?.token
  const admin = data.data?.admin as AdminIdentity | undefined
  if (!token || !admin) throw new Error(data.message || '登录响应异常，请重试')
  sessionStorage.setItem('admin_token', token)
  currentAdmin = admin
  return { needsSetup: false, admin }
}

export async function adminSetup(payload: { username: string; displayName: string; password: string; confirmPassword: string }): Promise<void> {
  const setupToken = sessionStorage.getItem('admin_setup_token')
  if (!setupToken) throw new Error('初始化凭据已失效，请重新验证旧管理密码')
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  const res = await fetch(`${API_BASE}/api/auth/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, setupToken }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '初始化失败')
  sessionStorage.removeItem('admin_setup_token')
}

export async function fetchCurrentAdmin(): Promise<AdminIdentity> {
  const data = await adminFetch<ApiResponse<{ admin: AdminIdentity }>>('/api/auth/me')
  if (!data.data?.admin) throw new Error('管理身份加载失败')
  currentAdmin = data.data.admin
  return currentAdmin
}

export async function exchangeClassmateSession(): Promise<AdminIdentity> {
  const classmateToken = sessionStorage.getItem('classmate_account_token')
  if (!classmateToken) throw new Error('请先登录同学账号')
  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
  const res = await fetch(`${API_BASE}/api/auth/classmate-exchange`, {
    method: 'POST', headers: { 'X-Classmate-Token': classmateToken },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success || !data.data?.token || !data.data?.admin) throw new Error(data.message || '进入管理后台失败')
  sessionStorage.setItem('admin_token', data.data.token)
  currentAdmin = data.data.admin as AdminIdentity
  return currentAdmin
}

export function getCurrentAdmin(): AdminIdentity | null {
  return currentAdmin
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
  currentAdmin = null
  const adminBase = import.meta.env.BASE_URL || '/admin/'
  window.location.href = `${adminBase}#/login`
}
