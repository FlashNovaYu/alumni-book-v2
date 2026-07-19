import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSqliteDatabase, type SqliteDatabase } from '../runtime/sqlite'

const defaultMigrationsDirectory = fileURLToPath(new URL('../../migrations', import.meta.url))

export function initializeLocalDatabase(databasePath: string, migrationsDirectory = defaultMigrationsDirectory): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = createSqliteDatabase(databasePath)
  database.exec(`
    CREATE TABLE IF NOT EXISTS _alumni_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
  for (const name of migrations) {
    const applied = database.prepare('SELECT name FROM _alumni_migrations WHERE name = ?').bind(name).first<{ name: string }>()
    if (applied) continue
    const sql = readFileSync(join(migrationsDirectory, name), 'utf8')
    database.exec('BEGIN')
    try {
      database.exec(sql)
      database.prepare('INSERT INTO _alumni_migrations (name) VALUES (?)').bind(name).run()
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      database.close()
      throw new Error(`迁移 ${name} 执行失败: ${String(error)}`)
    }
  }
  return database
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1]?.endsWith('init-local.ts') || process.argv[1]?.endsWith('init-local.js')) {
  const databasePath = argument('--database-path') || process.env.DATABASE_PATH || './.data/alumni.sqlite'
  const database = initializeLocalDatabase(databasePath)
  const count = database.prepare('SELECT COUNT(*) AS count FROM _alumni_migrations').first<{ count: number }>()?.count || 0
  database.close()
  console.log(`本地数据库迁移完成：${count} 个迁移`)
}
