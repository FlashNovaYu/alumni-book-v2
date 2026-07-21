import {
  ApiRequestError,
  requestJson,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from './network'
import type { AdminIdentity, ApiResponse } from '@alumni/shared'

const API_BASE = import.meta.env?.VITE_API_BASE_URL || ''
let currentAdmin: AdminIdentity | null = null
let currentAdminToken: string | null = null
let currentAdminExpiresAt = 0
let currentAdminRequest: { token: string; cacheVersion: number; promise: Promise<AdminIdentity> } | null = null
let currentAdminCacheVersion = 0
const CURRENT_ADMIN_TTL_MS = 30_000

function getToken(): string | null {
  let token: string | null = null
  try {
    token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('admin_token') : null
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('admin_token')
      if (token && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('admin_token', token)
      }
    }
  } catch {}
  if (currentAdminToken && currentAdminToken !== token) clearCurrentAdminCache()
  return token
}

export function clearCurrentAdminCache(): void {
  currentAdminCacheVersion += 1
  currentAdmin = null
  currentAdminToken = null
  currentAdminExpiresAt = 0
  currentAdminRequest = null
}

function setCurrentAdmin(admin: AdminIdentity, token: string): AdminIdentity {
  currentAdmin = admin
  currentAdminToken = token
  currentAdminExpiresAt = Date.now() + CURRENT_ADMIN_TTL_MS
  return admin
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function redirectToLogin(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('admin_token')
    if (typeof localStorage !== 'undefined') localStorage.removeItem('admin_token')
  } catch {}
  clearCurrentAdminCache()
  const adminBase = import.meta.env?.BASE_URL || '/admin/'
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

export async function adminLogin(username: string, password: string): Promise<{ needsSetup: boolean; admin: AdminIdentity | null }> {
  const data = await requestJson<ApiResponse<{ setupToken?: string; token?: string; admin?: AdminIdentity }>>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    { apiBase: API_BASE },
  )

  const setupToken = data.data?.setupToken
  if (setupToken) {
    sessionStorage.setItem('admin_setup_token', setupToken)
    return { needsSetup: true, admin: null }
  }
  const token = data.data?.token
  const admin = data.data?.admin as AdminIdentity | undefined
  if (!token || !admin) throw new Error(data.message || '登录响应异常，请重试')
  sessionStorage.setItem('admin_token', token)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('admin_token', token)
  } catch {}
  clearCurrentAdminCache()
  setCurrentAdmin(admin, token)
  return { needsSetup: false, admin }
}

export async function adminSetup(payload: { username: string; displayName: string; password: string; confirmPassword: string }): Promise<void> {
  const setupToken = sessionStorage.getItem('admin_setup_token')
  if (!setupToken) throw new Error('初始化凭据已失效，请重新验证旧管理密码')
  await requestJson<ApiResponse>('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, setupToken }),
  }, { apiBase: API_BASE })
  sessionStorage.removeItem('admin_setup_token')
}

export async function fetchCurrentAdmin(): Promise<AdminIdentity> {
  const token = getToken()
  if (!token) throw new Error('未授权')
  if (currentAdmin && currentAdminToken === token && Date.now() < currentAdminExpiresAt) return currentAdmin
  const cacheVersion = currentAdminCacheVersion
  if (currentAdminRequest?.token === token && currentAdminRequest.cacheVersion === cacheVersion) return currentAdminRequest.promise

  const promise = adminFetch<ApiResponse<{ admin: AdminIdentity }>>('/api/auth/me')
    .then((data) => {
      if (!data.data?.admin) throw new Error('管理身份加载失败')
      // 会话在请求过程中变化时，绝不能把旧身份写回缓存。
      if (getToken() !== token || currentAdminCacheVersion !== cacheVersion) throw new Error('管理会话或身份缓存已变化')
      return setCurrentAdmin(data.data.admin, token)
    })
    .finally(() => {
      if (currentAdminRequest?.token === token && currentAdminRequest.cacheVersion === cacheVersion) currentAdminRequest = null
    })
  currentAdminRequest = { token, cacheVersion, promise }
  return promise
}

export async function changeAdminPassword(oldPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
  await adminFetch<ApiResponse>('/api/auth/change-password', {
    method: 'POST', body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
  })
  clearCurrentAdminCache()
}

export async function exchangeClassmateSession(): Promise<AdminIdentity> {
  let classmateToken: string | null = null
  try {
    classmateToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('classmate_account_token') : null
    if (!classmateToken && typeof localStorage !== 'undefined') {
      classmateToken = localStorage.getItem('classmate_account_token')
    }
  } catch {}
  if (!classmateToken) throw new Error('请先登录同学账号')
  const data = await requestJson<ApiResponse<{ token: string; admin: AdminIdentity }>>('/api/auth/classmate-exchange', {
    method: 'POST',
    headers: { 'X-Classmate-Token': classmateToken },
  }, { apiBase: API_BASE })
  if (!data.data?.token || !data.data?.admin) throw new Error(data.message || '进入管理后台失败')
  sessionStorage.setItem('admin_token', data.data.token)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('admin_token', data.data.token)
  } catch {}
  clearCurrentAdminCache()
  return setCurrentAdmin(data.data.admin as AdminIdentity, data.data.token)
}

export function getCurrentAdmin(): AdminIdentity | null {
  return currentAdmin
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await requestJson('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    }, { apiBase: API_BASE })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status !== undefined) return false
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
