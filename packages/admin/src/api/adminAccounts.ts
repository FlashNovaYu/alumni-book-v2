import type { AdminAccountSummary, AdminAuditLog, AdminPermission, AdminPermissionOverride, AdminRoleId, ApiResponse } from '@alumni/shared'
import { adminFetch } from './client'

export type PermissionOverride = AdminPermissionOverride
export type CreateAdminAccountPayload = {
  accountType: 'standalone' | 'classmate_linked'
  displayName: string
  username?: string
  initialPassword?: string
  studentSlug?: string
  roleId: Exclude<AdminRoleId, 'owner'>
  permissionOverrides: PermissionOverride[]
}

export type UpdateAdminAccountPayload = Pick<CreateAdminAccountPayload, 'displayName' | 'roleId' | 'permissionOverrides'>
export type AuditLogFilters = {
  actorId?: string
  action?: string
  resourceType?: string
  from?: string
  to?: string
}

export async function listAdminAccounts() {
  const response = await adminFetch<ApiResponse<AdminAccountSummary[]>>('/api/admin/accounts')
  return response.data || []
}

export async function listAccountCandidates() {
  const response = await adminFetch<ApiResponse<Array<{ name: string; slug: string; avatarUrl: string | null }>>>('/api/admin/account-candidates')
  return response.data || []
}

export async function createAdminAccount(payload: CreateAdminAccountPayload) {
  return adminFetch<ApiResponse<{ id: string }>>('/api/admin/accounts', { method: 'POST', body: JSON.stringify(payload) })
}

export async function disableAdminAccount(id: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/disable`, { method: 'POST' })
}

export async function updateAdminAccount(id: string, payload: UpdateAdminAccountPayload) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function resetAdminPassword(id: string, initialPassword: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/reset-password`, {
    method: 'POST', body: JSON.stringify({ initialPassword }),
  })
}

export async function revokeAdminSessions(id: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/revoke-sessions`, { method: 'POST' })
}

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  const response = await adminFetch<ApiResponse<AdminAuditLog[]>>(`/api/admin/audit-logs${suffix}`)
  return response.data || []
}
