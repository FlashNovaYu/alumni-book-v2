import Database from 'better-sqlite3'

export type SqliteRunResult = {
  success: true
  meta: {
    changes: number
    last_row_id: number | bigint
  }
}

export type SqliteBoundStatement = {
  first<T = Record<string, unknown>>(): T | undefined
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): SqliteRunResult
}

export type SqlitePreparedStatement = {
  bind(...values: unknown[]): SqliteBoundStatement
  first<T = Record<string, unknown>>(): T | undefined
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): SqliteRunResult
}

export type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): SqlitePreparedStatement
  batch(statements: SqliteBoundStatement[]): Promise<SqliteRunResult[]>
  backup(destination: string): Promise<void>
  close(): void
}

function createBoundStatement(statement: Database.Statement, values: unknown[]): SqliteBoundStatement {
  return {
    first<T = Record<string, unknown>>() {
      return statement.get(...values) as T | undefined
    },
    async all<T = Record<string, unknown>>() {
      return { results: statement.all(...values) as T[] }
    },
    run() {
      const result = statement.run(...values)
      return {
        success: true,
        meta: {
          changes: Number(result.changes),
          last_row_id: result.lastInsertRowid,
        },
      }
    },
  }
}

export function createSqliteDatabase(filename: string): SqliteDatabase {
  const database = new Database(filename)
  database.pragma('busy_timeout = 5000')
  database.pragma('foreign_keys = ON')
  database.pragma('synchronous = NORMAL')
  if (filename !== ':memory:') database.pragma('journal_mode = WAL')
  return {
    exec(sql) {
      database.exec(sql)
    },
    prepare(sql) {
      const statement = database.prepare(sql)
      const bind = (...values: unknown[]) => createBoundStatement(statement, values)
      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      }
    },
    async batch(statements) {
      const runBatch = database.transaction(() => statements.map((statement) => statement.run()))
      return runBatch()
    },
    async backup(destination) {
      await database.backup(destination)
    },
    close() {
      database.close()
    },
  }
}
