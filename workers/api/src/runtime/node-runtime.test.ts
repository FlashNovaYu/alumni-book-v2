import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage, type LocalStorage } from './localStorage'
import { createNodeRuntime, type NodeRuntime } from './nodeEnv'
import { createNodeFetch } from '../node-server'
import { matchPublicCache } from '../lib/publicCache'
import { createSqliteDatabase, type SqliteDatabase } from './sqlite'

const openDatabases: SqliteDatabase[] = []
const storageDirectories: string[] = []
const openStorages: LocalStorage[] = []
const openRuntimes: NodeRuntime[] = []

afterEach(async () => {
  for (const database of openDatabases.splice(0)) database.close()
  for (const storage of openStorages.splice(0)) storage.close()
  for (const runtime of openRuntimes.splice(0)) runtime.close()
  await Promise.all(storageDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function openDatabase() {
  const database = createSqliteDatabase(':memory:')
  openDatabases.push(database)
  return database
}

async function openStorage() {
  const directory = await mkdtemp(join(tmpdir(), 'alumni-book-storage-'))
  storageDirectories.push(directory)
  const storage = createLocalStorage(directory)
  openStorages.push(storage)
  return storage
}

describe('本地 SQLite D1 适配器', () => {
  it('支持 prepare、bind、first、all 和 run 的 D1 返回结构', async () => {
    const database = openDatabase()

    await database.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
    const inserted = await database.prepare('INSERT INTO notes (body) VALUES (?)').bind('hello').run()
    const row = await database.prepare('SELECT id, body FROM notes WHERE id = ?').bind(inserted.meta.last_row_id).first<{ id: number; body: string }>()
    const all = await database.prepare('SELECT body FROM notes ORDER BY id').all<{ body: string }>()

    expect(inserted.success).toBe(true)
    expect(inserted.meta.changes).toBe(1)
    expect(row).toEqual({ id: 1, body: 'hello' })
    expect(all.results).toEqual([{ body: 'hello' }])
  })

  it('在 batch 中原子提交并在失败时回滚', async () => {
    const database = openDatabase()

    await database.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL UNIQUE)')
    await database.batch([
      database.prepare('INSERT INTO notes (body) VALUES (?)').bind('first'),
      database.prepare('INSERT INTO notes (body) VALUES (?)').bind('second'),
    ])
    expect((await database.prepare('SELECT COUNT(*) AS count FROM notes').first<{ count: number }>())?.count).toBe(2)

    await expect(database.batch([
      database.prepare('INSERT INTO notes (body) VALUES (?)').bind('third'),
      database.prepare('INSERT INTO notes (body) VALUES (?)').bind('first'),
    ])).rejects.toThrow()
    expect((await database.prepare('SELECT COUNT(*) AS count FROM notes').first<{ count: number }>())?.count).toBe(2)
  })
})

describe('本地文件存储适配器', () => {
  it('保留 Content-Type 和 ETag，并支持 Range 读取', async () => {
    const storage = await openStorage()

    await storage.put('photos/example.bin', new Uint8Array([0, 1, 2, 3]), {
      httpMetadata: { contentType: 'application/octet-stream' },
    })
    const head = await storage.head('photos/example.bin')
    const full = await storage.get('photos/example.bin')
    const ranged = await storage.get('photos/example.bin', { range: new Headers({ Range: 'bytes=1-2' }) })
    const listed = await storage.list('photos')

    expect(head?.size).toBe(4)
    expect(head?.httpMetadata?.contentType).toBe('application/octet-stream')
    expect(head?.httpEtag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(new Uint8Array(await new Response(full?.body).arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3]))
    expect(ranged?.range).toEqual({ offset: 1, length: 2 })
    expect(new Uint8Array(await new Response(ranged?.body).arrayBuffer())).toEqual(new Uint8Array([1, 2]))
    expect(listed.objects.map((item) => item.key)).toEqual(['photos/example.bin'])
  })

  it('拒绝空 key、绝对路径和路径穿越，并支持删除', async () => {
    const storage = await openStorage()

    await expect(storage.put('', 'invalid')).rejects.toThrow()
    await expect(storage.put('../secret.txt', 'invalid')).rejects.toThrow()
    await expect(storage.put('/etc/passwd', 'invalid')).rejects.toThrow()
    await storage.put('misc/example.txt', 'ok')
    await storage.delete('misc/example.txt')

    expect(await storage.head('misc/example.txt')).toBeNull()
  })
})

describe('Node 运行时绑定', () => {
  it('从显式配置创建数据库、文件存储和鉴权环境', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alumni-book-runtime-'))
    storageDirectories.push(directory)
    const runtime = createNodeRuntime({
      databasePath: join(directory, 'data', 'alumni.sqlite'),
      uploadRoot: join(directory, 'uploads'),
      jwtSecret: 'node-runtime-test-secret',
      corsOrigin: 'http://127.0.0.1:4321',
    })
    openRuntimes.push(runtime)

    expect(runtime.env.JWT_SECRET).toBe('node-runtime-test-secret')
    expect(runtime.env.CORS_ORIGIN).toBe('http://127.0.0.1:4321')
    expect(await runtime.env.DB.prepare('SELECT 1 AS value').first<{ value: number }>()).toEqual({ value: 1 })
    await runtime.env.R2.put('misc/runtime.txt', 'ok', { httpMetadata: { contentType: 'text/plain' } })
    expect(await runtime.env.R2.head('misc/runtime.txt')).not.toBeNull()
  })

  it('通过 Node fetch 入口提供健康和 readiness 检查', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alumni-book-fetch-'))
    storageDirectories.push(directory)
    const runtime = createNodeRuntime({
      databasePath: join(directory, 'data', 'alumni.sqlite'),
      uploadRoot: join(directory, 'uploads'),
      jwtSecret: 'node-fetch-test-secret',
      corsOrigin: 'http://127.0.0.1:4321',
    })
    openRuntimes.push(runtime)
    const fetch = createNodeFetch(runtime)

    const health = await fetch(new Request('http://127.0.0.1:8787/api/health'))
    const readiness = await fetch(new Request('http://127.0.0.1:8787/api/readiness'))
    const readinessBody = await readiness.json() as { data: { ready: boolean } }

    expect(health.status).toBe(200)
    expect(readiness.status).toBe(200)
    expect(readinessBody.data.ready).toBe(true)
  })

  it('在 Node 没有 Cache API 时跳过 HTTPS 公共缓存读取', async () => {
    await expect(matchPublicCache(new Request('https://example.test/api/config'))).resolves.toBeUndefined()
  })
})
