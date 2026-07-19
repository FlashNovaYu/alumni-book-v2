import { initializeLocalDatabase } from './init-local'
import { cleanupExpiredSessions } from '../lib/sessionCleanup'

const databasePath = process.env.DATABASE_PATH || './.data/alumni.sqlite'
const database = initializeLocalDatabase(databasePath)
cleanupExpiredSessions(database as unknown as D1Database)
  .then((result) => console.log(JSON.stringify({ event: 'scheduled_cleanup', status: 'ok', ...result })))
  .catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
  .finally(() => database.close())
