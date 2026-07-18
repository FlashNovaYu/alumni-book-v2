import type { AdminAccountSummary, AdminAuditLog, AdminPermission, AdminPermissionOverride, AdminRoleId, ApiResponse } from '@alumni/shared'
import { adminFetch } from './client'
import { DEFAULT_PAGE_SIZE, normalizePageResult, pageSearchParams, type PageResult } from './pagination'

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

export async function listAdminAccounts(cursor?: string | null, signal?: AbortSignal): Promise<PageResult<AdminAccountSummary>> {
  const query = pageSearchParams(DEFAULT_PAGE_SIZE, cursor)
  const response = await adminFetch<ApiResponse<AdminAccountSummary[] | PageResult<AdminAccountSummary>>>(`/api/admin/accounts?${query}`, { signal })
  return normalizePageResult(response.data, DEFAULT_PAGE_SIZE, cursor)
}

export async function listAccountCandidates(signal?: AbortSignal) {
  const response = await adminFetch<ApiResponse<Array<{ name: string; slug: string; avatarUrl: string | null }>>>('/api/admin/account-candidates', { signal })
  return response.data || []
}

export async function createAdminAccount(payload: CreateAdminAccountPayload) {
  return adminFetch<ApiResponse<{ id: string }>>('/api/admin/accounts', { method: 'POST', body: JSON.stringify(payload) })
}

export async function disableAdminAccount(id: string, reason: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/disable`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export async function updateAdminAccount(id: string, payload: UpdateAdminAccountPayload) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function resetAdminPassword(id: string, initialPassword: string, reason: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/reset-password`, {
    method: 'POST', body: JSON.stringify({ initialPassword, reason }),
  })
}

export async function revokeAdminSessions(id: string, reason: string) {
  return adminFetch<ApiResponse>(`/api/admin/accounts/${id}/revoke-sessions`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export async function listAuditLogs(filters: AuditLogFilters = {}, cursor?: string | null, signal?: AbortSignal): Promise<PageResult<AdminAuditLog>> {
  const query = pageSearchParams(DEFAULT_PAGE_SIZE, cursor)
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }
  const response = await adminFetch<ApiResponse<AdminAuditLog[] | PageResult<AdminAuditLog>>>(`/api/admin/audit-logs?${query}`, { signal })
  return normalizePageResult(response.data, DEFAULT_PAGE_SIZE, cursor)
}
