// packages/site-astro/src/api/classmateAuth.ts
// CCSwitch: 前台同学登录与修改密码的 API 客户端封装。

import { getClassmateToken, type ApiResponse, type ClassmateLoginResponse } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'
import { handleClassmateUnauthorized } from './classmateSession'

export async function classmateLogin(apiBase: string, slug: string, password: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password }),
  })
  const data = await res.json() as ApiResponse<ClassmateLoginResponse>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '登录失败')
  return data.data
}

export async function changeClassmatePassword(apiBase: string, oldPassword: string, newPassword: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/change-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Classmate-Token': token } : {}) },
    body: JSON.stringify({ oldPassword, newPassword }),
  })
  if (res.status === 401) handleClassmateUnauthorized()
  const data = await res.json() as ApiResponse
  if (!res.ok || !data.success) throw new Error(data.message || '修改密码失败')
  return data
}

export async function logoutClassmate(apiBase: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/logout'), {
    method: 'POST',
    headers: token ? { 'X-Classmate-Token': token } : {},
  })
  if (res.status === 401) handleClassmateUnauthorized()
  const data = await res.json() as ApiResponse
  if (!res.ok || !data.success) throw new Error(data.message || '登出失败')
  return data
}

export async function fetchClassmateMe(apiBase: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/me'), {
    headers: token ? { 'X-Classmate-Token': token } : {},
  })
  if (res.status === 401) handleClassmateUnauthorized()
  const data = await res.json() as ApiResponse<{ student: ClassmateLoginResponse['student']; mustChangePassword: boolean }>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '账号信息加载失败')
  return data.data
}

export async function fetchClassmateAdminEntry(apiBase: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/admin-entry'), {
    headers: token ? { 'X-Classmate-Token': token } : {},
  })
  if (res.status === 401) handleClassmateUnauthorized()
  const data = await res.json() as ApiResponse<{ available: boolean; displayName?: string; permissions?: string[] }>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '管理入口加载失败')
  return data.data
}
