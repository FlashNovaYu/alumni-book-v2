import { randomUUID } from 'node:crypto'
import { createOwnerAccount as createOwnerAccountRecord } from './owner-account'
import { initializeLocalDatabase } from './init-local'
import type { SqliteDatabase } from '../runtime/sqlite'

export async function createOwnerAccount(database: SqliteDatabase, username: string, password: string, displayName: string): Promise<void> {
  await createOwnerAccountRecord(database, { username, password, displayName, id: `adm_${randomUUID()}` })
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1]?.endsWith('create-admin.ts') || process.argv[1]?.endsWith('create-admin.js')) {
  const databasePath = argument('--database-path') || process.env.DATABASE_PATH || './.data/alumni.sqlite'
  const username = argument('--username')
  const password = argument('--password')
  const displayName = argument('--display-name') || username
  if (!username || !password || !displayName) {
    console.error('用法：pnpm exec tsx src/db/create-admin.ts --database-path <路径> --username <用户名> --password <密码> --display-name <显示名>')
    process.exitCode = 1
  } else {
    const database = initializeLocalDatabase(databasePath)
    createOwnerAccount(database, username, password, displayName)
      .then(() => console.log('主管理员创建成功'))
      .catch((error) => {
        console.error(String(error))
        process.exitCode = 1
      })
      .finally(() => database.close())
  }
}
