import type { AdminAccountSummary, AdminAuditLog, AdminPermission, AdminRoleId, ApiResponse } from '@alumni/shared'
import { adminFetch } from './client'

export type PermissionOverride = { permission: AdminPermission; effect: 'allow' | 'deny' }
export type CreateAdminAccountPayload = {
  accountType: 'standalone' | 'classmate_linked'
  displayName: string
  username?: string
  initialPassword?: string
  studentSlug?: string
  roleId: Exclude<AdminRoleId, 'owner'>
  permissionOverrides: PermissionOverride[]
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

export async function listAuditLogs() {
  const response = await adminFetch<ApiResponse<AdminAuditLog[]>>('/api/admin/audit-logs')
  return response.data || []
}
