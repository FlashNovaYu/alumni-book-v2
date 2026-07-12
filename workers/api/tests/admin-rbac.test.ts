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
    await env.DB.prepare(
      "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = 'test_init'"
    ).bind(await hashPassword('classmate-pass')).run()
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

    await env.DB.prepare("UPDATE students SET account_initial_password_changed = 0, account_status = 'pending' WHERE slug = 'test_init'").run()
    const blockedUntilPasswordChanged = await worker.fetch(new Request('http://localhost/api/auth/classmate-exchange', {
      method: 'POST', headers: { 'X-Classmate-Token': 'classmate-exchange-token' },
    }), env, createExecutionContext())
    expect(blockedUntilPasswordChanged.status).toBe(403)
    await env.DB.prepare("UPDATE students SET account_initial_password_changed = 1, account_status = 'active' WHERE slug = 'test_init'").run()

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

  it('revokes other standalone administrator sessions after a password change', async () => {
    await env.DB.prepare(
      "INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id) VALUES (?, 'standalone', ?, ?, ?, 'moderator')"
    ).bind('adm_password_sessions', 'password-sessions', '改密测试', await hashPassword('old-password')).run()
    const login = () => worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'password-sessions', password: 'old-password' }),
    }), env, createExecutionContext())
    const first = await login()
    const second = await login()
    const firstToken = (await first.json() as any).data.token
    const secondToken = (await second.json() as any).data.token
    const changed = await worker.fetch(new Request('http://localhost/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstToken}` },
      body: JSON.stringify({ oldPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'new-password' }),
    }), env, createExecutionContext())
    expect(changed.status).toBe(200)
    const stillCurrent = await worker.fetch(new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${firstToken}` } }), env, createExecutionContext())
    expect(stillCurrent.status).toBe(200)
    const revokedOther = await worker.fetch(new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${secondToken}` } }), env, createExecutionContext())
    expect(revokedOther.status).toBe(401)
  })

  it('invalidates classmate and linked administrator sessions when an owner resets a classmate password', async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE admin_accounts SET status = 'active' WHERE id = 'adm_linked_test'"),
      env.DB.prepare("UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = 'test_init'").bind(await hashPassword('before-owner-reset')),
      env.DB.prepare("INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES ('classmate-reset-token', 'test_init', datetime('now', '+1 day'))"),
    ])
    const exchange = await worker.fetch(new Request('http://localhost/api/auth/classmate-exchange', {
      method: 'POST', headers: { 'X-Classmate-Token': 'classmate-reset-token' },
    }), env, createExecutionContext())
    const linkedAdminToken = (await exchange.json() as any).data.token
    const ownerLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const ownerToken = (await ownerLogin.json() as any).data.token

    const reset = await worker.fetch(new Request('http://localhost/api/students/test_init', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ accountInitialPassword: 'after-owner-reset' }),
    }), env, createExecutionContext())
    expect(reset.status).toBe(200)

    const oldExchange = await worker.fetch(new Request('http://localhost/api/auth/classmate-exchange', {
      method: 'POST', headers: { 'X-Classmate-Token': 'classmate-reset-token' },
    }), env, createExecutionContext())
    expect(oldExchange.status).toBe(401)
    const linkedMe = await worker.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Authorization: `Bearer ${linkedAdminToken}` },
    }), env, createExecutionContext())
    expect(linkedMe.status).toBe(401)
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
    ).bind(JSON.stringify({ phone: '13800000000', visibility: { phone: 'hidden' } })).run()
    const activeStudentRead = await worker.fetch(new Request('http://localhost/api/students/test_init', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    const activeStudentBody = await activeStudentRead.json() as any
    expect(activeStudentBody.data.info.phone).toBeUndefined()
    await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE id = 'adm_moderator_test'").run()
    const studentRead = await worker.fetch(new Request('http://localhost/api/students/test_init', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    const studentBody = await studentRead.json() as any
    expect(studentBody.data.info.phone).toBeUndefined()
  })

  it('returns a permission-scoped workbench without student data for a moderator', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
         VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
      ).bind('adm_workbench_test', 'workbench-moderator', '工作台审核员', await hashPassword('workbench-pass')),
      env.DB.prepare(
        "INSERT INTO messages (id, student_slug, author_name, content) VALUES ('msg_workbench_test', 'test_init', '待审核同学', '需要审核的个人留言')"
      ),
      env.DB.prepare(
        "INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_workbench_test', 'test_init', '待审核同学', '需要审核的公共留言', 'pending')"
      ),
      env.DB.prepare(
        "INSERT INTO public_messages (id, author_slug, author_name, content, status, client_nonce) VALUES ('pm_workbench_group', 'test_init', '群聊同学', '今天的公共群聊', 'visible', 'chat:workbench')"
      ),
    ])

    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'workbench-moderator', password: 'workbench-pass' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token

    const response = await worker.fetch(new Request('http://localhost/api/admin/workbench', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.data.todos).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'profile-messages', to: '/messages', count: expect.any(Number) }),
    ]))
    expect(body.data.todos).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'public-messages' }),
    ]))
    expect(body.data.summary).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'group-chat-today', label: '今日公共群聊', to: '/messages?tab=group', value: 1 }),
    ]))
    expect(body.data).not.toHaveProperty('studentCount')
    expect(body.data).not.toHaveProperty('recentStudents')
    expect(body.data).not.toHaveProperty('topVisited')
    expect(body.data).not.toHaveProperty('auditAlerts')
  })

  it('returns and persists site identity settings', async () => {
    const initial = await worker.fetch(new Request('http://localhost/api/config'), env, createExecutionContext())
    expect((await initial.json() as any).data.identity).toEqual({
      siteName: '同学录', className: '', classYear: '', shareDescription: '',
    })

    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token
    const update = await worker.fetch(new Request('http://localhost/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ identity: { siteName: '高三一班同学录', className: '高三一班', classYear: '2026 届', shareDescription: '记录青春回忆' } }),
    }), env, createExecutionContext())
    expect(update.status).toBe(200)

    const saved = await worker.fetch(new Request('http://localhost/api/config'), env, createExecutionContext())
    expect((await saved.json() as any).data.identity).toEqual({
      siteName: '高三一班同学录', className: '高三一班', classYear: '2026 届', shareDescription: '记录青春回忆',
    })
  })

  it('lists all admin timeline events and only reorders a complete same-day group', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_a', '同日事件一', '2023-06-20', 0)"),
      env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_b', '同日事件二', '2023-06-20', 1)"),
      env.DB.prepare("INSERT INTO timeline_events (id, title, event_date, sort_order) VALUES ('tle_operations_c', '跨日事件', '2023-06-21', 0)"),
    ])
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token

    const listed = await worker.fetch(new Request('http://localhost/api/admin/timeline/events', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(listed.status).toBe(200)
    expect((await listed.json() as any).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tle_operations_a', eventDate: '2023-06-20', sortOrder: 0 }),
    ]))

    const reordered = await worker.fetch(new Request('http://localhost/api/timeline/events/reorder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventDate: '2023-06-20', ids: ['tle_operations_b', 'tle_operations_a'] }),
    }), env, createExecutionContext())
    expect(reordered.status).toBe(200)
    expect(await env.DB.prepare("SELECT id, sort_order FROM timeline_events WHERE id IN ('tle_operations_a', 'tle_operations_b') ORDER BY sort_order").all())
      .toMatchObject({ results: [{ id: 'tle_operations_b', sort_order: 0 }, { id: 'tle_operations_a', sort_order: 1 }] })

    const incomplete = await worker.fetch(new Request('http://localhost/api/timeline/events/reorder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventDate: '2023-06-20', ids: ['tle_operations_a'] }),
    }), env, createExecutionContext())
    expect(incomplete.status).toBe(400)

    const crossDay = await worker.fetch(new Request('http://localhost/api/timeline/events/reorder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventDate: '2023-06-20', ids: ['tle_operations_a', 'tle_operations_c'] }),
    }), env, createExecutionContext())
    expect(crossDay.status).toBe(400)
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

  it('updates a secondary administrator role and permission overrides', async () => {
    const ownerLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const ownerToken = (await ownerLogin.json() as any).data.token

    const create = await worker.fetch(new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        accountType: 'standalone', displayName: '待调整管理员', username: 'editable-admin',
        initialPassword: 'editable-pass', roleId: 'moderator', permissionOverrides: [],
      }),
    }), env, createExecutionContext())
    const accountId = (await create.json() as any).data.id

    const update = await worker.fetch(new Request(`http://localhost/api/admin/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        displayName: '已调整管理员', roleId: 'operator',
        permissionOverrides: [
          { permission: 'content.manage', effect: 'deny' },
          { permission: 'moderation.view', effect: 'allow' },
        ],
      }),
    }), env, createExecutionContext())

    expect(update.status).toBe(200)
    expect(await env.DB.prepare('SELECT display_name, role_id FROM admin_accounts WHERE id = ?').bind(accountId).first())
      .toMatchObject({ display_name: '已调整管理员', role_id: 'operator' })
    expect(await getAdminPermissions(env.DB, accountId)).toEqual(expect.arrayContaining(['moderation.view', 'notifications.publish']))
    expect(await getAdminPermissions(env.DB, accountId)).not.toContain('content.manage')
    expect(await env.DB.prepare(
      "SELECT action FROM admin_audit_logs WHERE resource_id = ? AND action = 'admin_account.update'"
    ).bind(accountId).first()).toBeTruthy()
  })

  it('requires and audits reasons for destructive administrator account actions', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
         VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
      ).bind('adm_reason_reset', 'reason-reset', '重置原因测试', await hashPassword('before-reset')),
      env.DB.prepare(
        `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
         VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
      ).bind('adm_reason_disable', 'reason-disable', '停用原因测试', await hashPassword('disable-pass')),
      env.DB.prepare(
        `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
         VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
      ).bind('adm_reason_revoke', 'reason-revoke', '撤销原因测试', await hashPassword('revoke-pass')),
    ])
    const ownerLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const ownerToken = (await ownerLogin.json() as any).data.token
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }

    const resetWithoutReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_reset/reset-password', {
      method: 'POST', headers, body: JSON.stringify({ initialPassword: 'after-reset' }),
    }), env, createExecutionContext())
    expect(resetWithoutReason.status).toBe(400)

    const resetObjectReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_reset/reset-password', {
      method: 'POST', headers, body: JSON.stringify({ initialPassword: 'after-reset', reason: {} }),
    }), env, createExecutionContext())
    expect(resetObjectReason.status).toBe(400)

    const disableWithoutReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_disable/disable', {
      method: 'POST', headers,
    }), env, createExecutionContext())
    expect(disableWithoutReason.status).toBe(400)

    const disableWhitespaceReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_disable/disable', {
      method: 'POST', headers, body: JSON.stringify({ reason: '   ' }),
    }), env, createExecutionContext())
    expect(disableWhitespaceReason.status).toBe(400)

    const disableLongReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_disable/disable', {
      method: 'POST', headers, body: JSON.stringify({ reason: 'a'.repeat(501) }),
    }), env, createExecutionContext())
    expect(disableLongReason.status).toBe(400)

    const revokeWithoutReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_revoke/revoke-sessions', {
      method: 'POST', headers,
    }), env, createExecutionContext())
    expect(revokeWithoutReason.status).toBe(400)

    const revokeArrayReason = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_revoke/revoke-sessions', {
      method: 'POST', headers, body: JSON.stringify({ reason: ['异常登录'] }),
    }), env, createExecutionContext())
    expect(revokeArrayReason.status).toBe(400)

    const reset = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_reset/reset-password', {
      method: 'POST', headers, body: JSON.stringify({ initialPassword: 'after-reset', reason: '安全轮换' }),
    }), env, createExecutionContext())
    expect(reset.status).toBe(200)

    const disable = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_disable/disable', {
      method: 'POST', headers, body: JSON.stringify({ reason: '岗位调整' }),
    }), env, createExecutionContext())
    expect(disable.status).toBe(200)

    const revoke = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reason_revoke/revoke-sessions', {
      method: 'POST', headers, body: JSON.stringify({ reason: '发现异常登录' }),
    }), env, createExecutionContext())
    expect(revoke.status).toBe(200)

    const { results } = await env.DB.prepare(
      "SELECT action, reason FROM admin_audit_logs WHERE resource_id IN ('adm_reason_reset', 'adm_reason_disable', 'adm_reason_revoke') ORDER BY action"
    ).all()
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'admin_account.disable', reason: '岗位调整' }),
      expect.objectContaining({ action: 'admin_account.reset_password', reason: '安全轮换' }),
      expect.objectContaining({ action: 'admin_account.revoke_sessions', reason: '发现异常登录' }),
    ]))
  })

  it('requires a reset standalone administrator to change password before using the workbench', async () => {
    await env.DB.prepare(
      `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
       VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
    ).bind('adm_reset_test', 'reset-admin', '重置测试管理员', await hashPassword('before-reset')).run()

    const previousLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reset-admin', password: 'before-reset' }),
    }), env, createExecutionContext())
    const previousToken = (await previousLogin.json() as any).data.token
    const ownerLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const ownerToken = (await ownerLogin.json() as any).data.token

    const reset = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_reset_test/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ initialPassword: 'after-reset', reason: '账号安全轮换' }),
    }), env, createExecutionContext())
    expect(reset.status).toBe(200)

    const staleSession = await worker.fetch(new Request('http://localhost/api/admin/workbench', {
      headers: { Authorization: `Bearer ${previousToken}` },
    }), env, createExecutionContext())
    expect(staleSession.status).toBe(401)

    const resetLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reset-admin', password: 'after-reset' }),
    }), env, createExecutionContext())
    const resetToken = (await resetLogin.json() as any).data.token
    const blockedWorkbench = await worker.fetch(new Request('http://localhost/api/admin/workbench', {
      headers: { Authorization: `Bearer ${resetToken}` },
    }), env, createExecutionContext())
    expect(blockedWorkbench.status).toBe(403)
  })

  it('revokes a selected administrator sessions and filters audit logs', async () => {
    await env.DB.prepare(
      `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id)
       VALUES (?, 'standalone', ?, ?, ?, 'moderator')`
    ).bind('adm_revoke_test', 'revoke-admin', '撤销测试管理员', await hashPassword('revoke-pass')).run()
    const targetLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'revoke-admin', password: 'revoke-pass' }),
    }), env, createExecutionContext())
    const targetToken = (await targetLogin.json() as any).data.token
    const ownerLogin = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const ownerToken = (await ownerLogin.json() as any).data.token

    const revoke = await worker.fetch(new Request('http://localhost/api/admin/accounts/adm_revoke_test/revoke-sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ reason: '主动退出所有设备' }),
    }), env, createExecutionContext())
    expect(revoke.status).toBe(200)

    const revokedMe = await worker.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Authorization: `Bearer ${targetToken}` },
    }), env, createExecutionContext())
    expect(revokedMe.status).toBe(401)

    const logs = await worker.fetch(new Request(
      'http://localhost/api/admin/audit-logs?action=admin_account.revoke_sessions&resourceType=admin_account'
    , { headers: { Authorization: `Bearer ${ownerToken}` } }), env, createExecutionContext())
    const body = await logs.json() as any
    expect(logs.status).toBe(200)
    expect(body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'admin_account.revoke_sessions', resource_id: 'adm_revoke_test' }),
    ]))
  })

  it('exposes a minimal management entry only to active linked classmates', async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE admin_accounts SET status = 'active', display_name = '入口测试员' WHERE id = 'adm_linked_test'"),
      env.DB.prepare("UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = 'test_init'").bind(await hashPassword('entry-pass')),
      env.DB.prepare("INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES ('classmate-entry-token', 'test_init', datetime('now', '+1 day'))"),
    ])
    const response = await worker.fetch(new Request('http://localhost/api/classmate-auth/admin-entry', {
      headers: { 'X-Classmate-Token': 'classmate-entry-token' },
    }), env, createExecutionContext())
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data).toMatchObject({ available: true, displayName: '入口测试员' })
    expect(body.data.token).toBeUndefined()
  })

  it('records the acting administrator when approving a profile message', async () => {
    await env.DB.prepare(
      "INSERT INTO messages (id, student_slug, author_name, content) VALUES ('msg_audit_test', 'test_init', '测试同学', '请审核我')"
    ).run()
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token
    const approval = await worker.fetch(new Request('http://localhost/api/admin/messages/msg_audit_test/approve', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(approval.status).toBe(200)
    expect(await env.DB.prepare(
      "SELECT action, resource_id FROM admin_audit_logs WHERE resource_id = 'msg_audit_test'"
    ).first()).toMatchObject({ action: 'message.approve', resource_id: 'msg_audit_test' })
  })

  it('requires reasons and records audits for destructive moderation actions', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages (id, student_slug, author_name, content) VALUES ('msg_reason_test', 'test_init', '测试同学', '需要隐藏')"),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_reason_test', 'test_init', '测试同学', '需要删除', 'approved')"),
    ])
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token

    const missingReason = await worker.fetch(new Request('http://localhost/api/admin/messages/msg_reason_test/hide', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ hidden: true }),
    }), env, createExecutionContext())
    expect(missingReason.status).toBe(400)

    const hide = await worker.fetch(new Request('http://localhost/api/admin/messages/msg_reason_test/hide', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ hidden: true, reason: '包含不适合公开的内容' }),
    }), env, createExecutionContext())
    expect(hide.status).toBe(200)
    expect(await env.DB.prepare("SELECT reason FROM admin_audit_logs WHERE action = 'message.hide' AND resource_id = 'msg_reason_test'").first())
      .toMatchObject({ reason: '包含不适合公开的内容' })

    const deleteWithoutReason = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reason_test', {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(deleteWithoutReason.status).toBe(400)

    const remove = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reason_test', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: '重复发布' }),
    }), env, createExecutionContext())
    expect(remove.status).toBe(200)
    expect(await env.DB.prepare("SELECT reason FROM admin_audit_logs WHERE action = 'public_message.delete' AND resource_id = 'pm_reason_test'").first())
      .toMatchObject({ reason: '重复发布' })
  })

  it('records the named administrator when approving a public message', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_reviewer_test', 'test_init', '测试同学', '请审核我', 'pending')"),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_reviewer_reject', 'test_init', '测试同学', '请退回我', 'pending')"),
    ])
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token
    const approval = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reviewer_test/approve', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    expect(approval.status).toBe(200)
    expect(await env.DB.prepare("SELECT status, reviewed_by FROM public_messages WHERE id = 'pm_reviewer_test'").first())
      .toMatchObject({ status: 'visible', reviewed_by: '陈老师' })
    expect(await env.DB.prepare("SELECT admin_id FROM content_reviews WHERE content_id = 'pm_reviewer_test'").first())
      .toMatchObject({ admin_id: expect.any(String) })
    const rejection = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reviewer_reject/reject', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: '请调整内容后再提交' }),
    }), env, createExecutionContext())
    expect(rejection.status).toBe(200)
    const listed = await worker.fetch(new Request('http://localhost/api/admin/public-messages', {
      headers: { Authorization: `Bearer ${token}` },
    }), env, createExecutionContext())
    const listedBody = await listed.json() as any
    expect(listed.status).toBe(200)
    expect(listedBody.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pm_reviewer_test', reviewedBy: '陈老师' }),
      expect.objectContaining({ id: 'pm_reviewer_reject', reviewedBy: '陈老师' }),
    ]))
    await env.DB.prepare(
      "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES ('reviewer-privacy-token', 'test_init', datetime('now', '+1 day'))"
    ).run()
    const publicList = await worker.fetch(new Request('http://localhost/api/public-messages', {
      headers: { 'X-Classmate-Token': 'reviewer-privacy-token' },
    }), env, createExecutionContext())
    const publicBody = await publicList.json() as any
    expect(publicList.status).toBe(200)
    expect(publicBody.data.items.find((message: any) => message.id === 'pm_reviewer_test')).not.toHaveProperty('reviewedBy')
    expect(publicBody.data.items.every((message: any) => !Object.hasOwn(message, 'reviewedBy'))).toBe(true)
    const mine = await worker.fetch(new Request('http://localhost/api/public-messages/mine', {
      headers: { 'X-Classmate-Token': 'reviewer-privacy-token' },
    }), env, createExecutionContext())
    const mineBody = await mine.json() as any
    expect(mine.status).toBe(200)
    expect(mineBody.data.items.find((message: any) => message.id === 'pm_reviewer_test')).not.toHaveProperty('reviewedBy')
  })

  it('accepts each pending public message review only once', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_approve_once', 'test_init', '测试同学', '只能通过一次', 'pending')"),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_reject_once', 'test_init', '测试同学', '只能退回一次', 'pending')"),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status) VALUES ('pm_concurrent_once', 'test_init', '测试同学', '并发只审核一次', 'pending')"),
    ])
    const login = await worker.fetch(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'new-pass-123' }),
    }), env, createExecutionContext())
    const token = (await login.json() as any).data.token
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

    const approve = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_approve_once/approve', {
      method: 'PUT', headers,
    }), env, createExecutionContext())
    expect(approve.status).toBe(200)
    const repeatedApproval = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_approve_once/approve', {
      method: 'PUT', headers,
    }), env, createExecutionContext())
    expect(repeatedApproval.status).toBe(409)

    const reject = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reject_once/reject', {
      method: 'PUT', headers, body: JSON.stringify({ reason: '内容不适合公开' }),
    }), env, createExecutionContext())
    expect(reject.status).toBe(200)
    const repeatedRejection = await worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_reject_once/reject', {
      method: 'PUT', headers, body: JSON.stringify({ reason: '再次退回' }),
    }), env, createExecutionContext())
    expect(repeatedRejection.status).toBe(409)

    const [concurrentA, concurrentB] = await Promise.all([
      worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_concurrent_once/approve', { method: 'PUT', headers }), env, createExecutionContext()),
      worker.fetch(new Request('http://localhost/api/admin/public-messages/pm_concurrent_once/approve', { method: 'PUT', headers }), env, createExecutionContext()),
    ])
    expect([concurrentA.status, concurrentB.status].sort()).toEqual([200, 409])

    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id IN ('pm_approve_once', 'pm_reject_once', 'pm_concurrent_once')").first())
      .toMatchObject({ count: 3 })
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE related_id IN ('pm_approve_once', 'pm_reject_once', 'pm_concurrent_once')").first())
      .toMatchObject({ count: 3 })
  })
})
