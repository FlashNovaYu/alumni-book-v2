import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import { getAdminPermissions, loadActiveAdmin } from '../src/lib/adminAuth'
import { runAuditedBatch } from '../src/lib/adminAudit'
import worker from '../src/index'
import { hashPassword } from '../src/lib/password'

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
      "INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id) VALUES ('adm_audit_test', 'standalone', 'audit-owner', '审计测试账号', 'pbkdf2:test:test', 'owner')"
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

  it('migrates the legacy password into a named owner account', async () => {
    const loginContext = createExecutionContext()
    const legacyLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin888' }),
    }), env, loginContext)
    await waitOnExecutionContext(loginContext)
    expect(legacyLogin.status).toBe(200)
    const legacyBody = await legacyLogin.json() as any
    expect(legacyBody.data.setupToken).toBeTypeOf('string')
    expect(legacyBody.data.token).toBeUndefined()

    const setupContext = createExecutionContext()
    const setup = await worker.fetch(new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupToken: legacyBody.data.setupToken,
        username: 'owner',
        displayName: '陈老师',
        password: 'new-pass-123',
        confirmPassword: 'new-pass-123',
      }),
    }), env, setupContext)
    await waitOnExecutionContext(setupContext)
    expect(setup.status).toBe(200)

    const owner = await env.DB.prepare(
      "SELECT account_type, display_name, is_owner FROM admin_accounts WHERE username = 'owner'"
    ).first() as any
    expect(owner).toMatchObject({ account_type: 'standalone', display_name: '陈老师', is_owner: 1 })

    const namedLoginContext = createExecutionContext()
    const namedLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, namedLoginContext)
    await waitOnExecutionContext(namedLoginContext)
    const namedBody = await namedLogin.json() as any
    expect(namedLogin.status).toBe(200)
    expect(namedBody.data.admin).toMatchObject({ displayName: '陈老师', isOwner: true })
  })

  it('exchanges an active linked classmate session for a secondary admin session', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO admin_accounts (id, account_type, display_name, student_slug, role_id) VALUES ('adm_linked_test', 'classmate_linked', '运营同学', 'test_init', 'operator')"
      ),
      env.DB.prepare(
        "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES ('classmate-exchange-token', 'test_init', datetime('now', '+1 day'))"
      ),
    ])

    const context = createExecutionContext()
    const response = await worker.fetch(new Request('http://localhost/api/auth/classmate-exchange', {
      method: 'POST',
      headers: { 'X-Classmate-Token': 'classmate-exchange-token' },
    }), env, context)
    await waitOnExecutionContext(context)
    const body = await response.json() as any
    expect(response.status).toBe(200)
    expect(body.data.admin).toMatchObject({ id: 'adm_linked_test', accountType: 'classmate_linked' })

    await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE id = 'adm_linked_test'").run()
    const rejected = await worker.fetch(new Request('http://localhost/api/auth/classmate-exchange', {
      method: 'POST',
      headers: { 'X-Classmate-Token': 'classmate-exchange-token' },
    }), env, createExecutionContext())
    expect(rejected.status).toBe(403)
  })

  it('issues distinct sessions for repeated administrator logins', async () => {
    const login = () => worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())

    const first = await login()
    const second = await login()
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = await first.json() as any
    const secondBody = await second.json() as any
    expect(firstBody.data.token).not.toBe(secondBody.data.token)
  })

  it('restricts moderators to their assigned management capability', async () => {
    await env.DB.prepare(
      `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
       VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
    ).bind('adm_moderator_test', 'moderator', '审核同学', await hashPassword('moderator-pass')).run()

    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'moderator', password: 'moderator-pass' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token

    const messageList = await worker.fetch(new Request('http://localhost/api/admin/messages', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(messageList.status).toBe(200)

    const stats = await worker.fetch(new Request('http://localhost/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(stats.status).toBe(403)

    const studentUpdate = await worker.fetch(new Request('http://localhost/api/students/test_init', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: '不应写入' }),
    }), env, createExecutionContext())
    expect(studentUpdate.status).toBe(403)

    await env.DB.prepare(
      "UPDATE students SET info = ? WHERE slug = 'test_init'"
    ).bind(JSON.stringify({ phone: '13800000000', visibility: { phone: 'owner' } })).run()
    await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE id = 'adm_moderator_test'").run()
    const studentRead = await worker.fetch(new Request('http://localhost/api/students/test_init', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    const studentBody = await studentRead.json() as any
    expect(studentBody.data.info.phone).toBeUndefined()
  })

  it('allows the owner to create a standalone secondary administrator', async () => {
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token

    const response = await worker.fetch(new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        accountType: 'standalone',
        displayName: '新审核员',
        username: 'new-moderator',
        initialPassword: 'new-moderator-pass',
        roleId: 'moderator',
        permissionOverrides: [],
      }),
    }), env, createExecutionContext())
    expect(response.status).toBe(201)
    const created = await env.DB.prepare(
      "SELECT role_id, must_change_password FROM admin_accounts WHERE username = 'new-moderator'"
    ).first() as any
    expect(created).toMatchObject({ role_id: 'moderator', must_change_password: 1 })
  })

  it('exposes a minimal management entry only to active linked classmates', async () => {
    await env.DB.prepare("UPDATE admin_accounts SET status = 'active', display_name = '入口测试员' WHERE id = 'adm_linked_test'").run()
    const response = await worker.fetch(new Request('http://localhost/api/classmate-auth/admin-entry', {
      headers: { 'X-Classmate-Token': 'classmate-exchange-token' },
    }), env, createExecutionContext())
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data).toMatchObject({ available: true, displayName: '入口测试员' })
    expect(body.data.token).toBeUndefined()
  })
})
