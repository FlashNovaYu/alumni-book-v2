import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createSqliteDatabase } from '../runtime/sqlite'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const source = process.env.DATABASE_PATH || './.data/alumni.sqlite'
const destination = argument('--destination')
if (!destination) {
  console.error('用法：pnpm exec tsx src/db/backup-local.ts --destination <备份路径>')
  process.exitCode = 1
} else {
  mkdirSync(dirname(destination), { recursive: true })
  const database = createSqliteDatabase(source)
  database.backup(destination)
    .then(() => console.log(`SQLite 备份完成：${destination}`))
    .catch((error) => {
      console.error(String(error))
      process.exitCode = 1
    })
    .finally(() => database.close())
}
