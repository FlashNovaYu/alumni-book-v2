import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteDatabase, type SqliteDatabase } from './sqlite'

const openDatabases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of openDatabases.splice(0)) database.close()
})

function openDatabase() {
  const database = createSqliteDatabase(':memory:')
  openDatabases.push(database)
  return database
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
