import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import { getAdminPermissions, loadActiveAdmin } from '../src/lib/adminAuth'
import { runAuditedBatch } from '../src/lib/adminAudit'

beforeAll(async () => {
  await initTestDb(env.DB)
})

describe('Administrator RBAC schema', () => {
  it('creates the administrator RBAC tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('admin_accounts', 'admin_roles', 'admin_account_permissions', 'admin_audit_logs')"
    ).all()

    expect(results.map((row: any) => row.name).sort()).toEqual([
      'admin_account_permissions',
      'admin_accounts',
      'admin_audit_logs',
      'admin_roles',
    ])
  })

  it('applies account permission overrides and rejects disabled accounts', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO admin_role_permissions (role_id, permission) VALUES ('content_admin', 'content.manage')"
      ),
      env.DB.prepare(
        "INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id) VALUES ('adm_permission_test', 'standalone', 'content-editor', '内容管理员', 'pbkdf2:test:test', 'content_admin')"
      ),
      env.DB.prepare(
        "INSERT INTO admin_account_permissions (admin_account_id, permission, effect) VALUES ('adm_permission_test', 'content.manage', 'deny')"
      ),
      env.DB.prepare(
        "INSERT INTO admin_account_permissions (admin_account_id, permission, effect) VALUES ('adm_permission_test', 'notifications.publish', 'allow')"
      ),
    ])

    expect(await getAdminPermissions(env.DB, 'adm_permission_test')).not.toContain('content.manage')
    expect(await getAdminPermissions(env.DB, 'adm_permission_test')).toContain('notifications.publish')

    await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE id = 'adm_permission_test'").run()
    expect(await loadActiveAdmin(env.DB, 'adm_permission_test')).toBeNull()
  })

  it('persists a mutation and its audit log together', async () => {
    await env.DB.prepare(
      "INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id, is_owner) VALUES ('adm_audit_test', 'standalone', 'audit-owner', '主管理员', 'pbkdf2:test:test', 'owner', 1)"
    ).run()

    await runAuditedBatch(
      env.DB,
      'adm_audit_test',
      [env.DB.prepare("INSERT INTO site_config (key, value) VALUES ('audit_test_key', 'new')")],
      {
        action: 'config.update',
        resourceType: 'site_config',
        resourceId: 'audit_test_key',
        before: { value: 'old' },
        after: { value: 'new' },
      },
    )

    expect(await env.DB.prepare("SELECT value FROM site_config WHERE key = 'audit_test_key'").first()).toMatchObject({ value: 'new' })
    expect(await env.DB.prepare(
      "SELECT action, resource_type, resource_id FROM admin_audit_logs WHERE admin_account_id = 'adm_audit_test'"
    ).first()).toMatchObject({ action: 'config.update', resource_type: 'site_config', resource_id: 'audit_test_key' })
  })
})
