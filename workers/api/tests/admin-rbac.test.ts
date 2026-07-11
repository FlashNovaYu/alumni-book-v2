import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'

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
})
