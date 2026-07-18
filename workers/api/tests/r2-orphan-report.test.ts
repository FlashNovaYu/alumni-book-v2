import { describe, expect, it } from 'vitest'
import { createExecutionContext, env } from 'cloudflare:test'
import worker from '../src/index'
import { buildR2OrphanReport, scanR2Orphans } from '../src/lib/r2OrphanReport'
import { initTestDb } from './db-helper'

describe('R2 孤儿对象报告', () => {
  it('运维报告接口拒绝未认证请求', async () => {
    const response = await worker.fetch(
      new Request('http://localhost/api/admin/operations/r2-orphans'),
      env,
      createExecutionContext(),
    )
    expect(response.status).toBe(401)
  })

  it('规范化数据库文件 URL，并只报告未被引用的对象', () => {
    expect(buildR2OrphanReport(
      ['/api/files/avatars/a.png', 'photos/b.jpg', 'https://example.test/api/files/music/c.mp3', null],
      ['avatars/a.png', 'photos/b.jpg', 'music/c.mp3', 'misc/orphan.bin'],
    )).toEqual({
      objectCount: 4,
      referencedCount: 3,
      orphanCount: 1,
      orphanKeys: ['misc/orphan.bin'],
    })
  })

  it('对重复引用和重复对象去重，不产生删除动作', () => {
    expect(buildR2OrphanReport(
      ['/api/files/avatars/a.png', '/api/files/avatars/a.png'],
      ['avatars/a.png', 'avatars/a.png'],
    )).toMatchObject({ objectCount: 1, referencedCount: 1, orphanCount: 0 })
  })

  it('通过 D1 与 R2 绑定分页生成只读报告，不删除对象', async () => {
    await initTestDb(env.DB)
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO albums (id, title) VALUES ('ops-r2-album', '运维测试')"),
      env.DB.prepare("INSERT OR REPLACE INTO photos (id, album_id, filename, r2_key) VALUES ('ops-r2-photo', 'ops-r2-album', 'referenced.png', 'ops-test/referenced.png')"),
    ])
    await env.R2.put('ops-test/referenced.png', new Uint8Array([1]))
    await env.R2.put('ops-test/orphan.png', new Uint8Array([2]))

    const report = await scanR2Orphans(env.DB, env.R2, 'ops-test/')

    expect(report).toMatchObject({ objectCount: 2, referencedCount: 1, orphanCount: 1 })
    expect(report.orphanKeys).toEqual(['ops-test/orphan.png'])
    expect(await env.R2.get('ops-test/referenced.png')).not.toBeNull()
    expect(await env.R2.get('ops-test/orphan.png')).not.toBeNull()
  })
})
