// packages/site-astro/src/api/classmateAuth.ts
// CCSwitch: 前台同学登录与修改密码的 API 客户端封装。

import { getClassmateToken, type ApiResponse, type ClassmateLoginResponse } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

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
  const data = await res.json() as ApiResponse
  if (!res.ok || !data.success) throw new Error(data.message || '修改密码失败')
  return data
}
