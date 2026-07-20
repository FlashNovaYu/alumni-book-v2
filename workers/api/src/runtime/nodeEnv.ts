import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createLocalStorage, type LocalStorage } from './localStorage'
import { initializeLocalDatabase } from '../db/init-local'
import type { SqliteDatabase } from './sqlite'

export type NodeRuntimeConfig = {
  databasePath?: string
  uploadRoot?: string
  jwtSecret?: string
  corsOrigin?: string
  corsPreviewOrigins?: string
  releaseSha?: string
}

export type NodeRuntimeEnv = {
  DB: SqliteDatabase
  R2: LocalStorage
  JWT_SECRET: string
  CORS_ORIGIN: string
  CORS_PREVIEW_ORIGINS?: string
  RELEASE_SHA: string
}

export type NodeRuntime = {
  env: NodeRuntimeEnv
  close(): void
}

function value(config: NodeRuntimeConfig, key: keyof NodeRuntimeConfig, envKey: string, fallback: string): string {
  const configured = config[key]
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  const fromEnv = process.env[envKey]
  return fromEnv?.trim() || fallback
}

export function createNodeRuntime(config: NodeRuntimeConfig = {}): NodeRuntime {
  const databasePath = value(config, 'databasePath', 'DATABASE_PATH', './.data/alumni.sqlite')
  const uploadRoot = value(config, 'uploadRoot', 'UPLOAD_ROOT', './.data/uploads')
  const jwtSecret = value(config, 'jwtSecret', 'JWT_SECRET', '')
  if (!jwtSecret) throw new Error('JWT_SECRET 必须配置')
  const releaseSha = value(config, 'releaseSha', 'RELEASE_SHA', '')
  if (!/^[0-9a-f]{40}$/i.test(releaseSha)) throw new Error('RELEASE_SHA 必须是完整 40 位十六进制提交 SHA')

  const corsOrigin = value(config, 'corsOrigin', 'CORS_ORIGIN', 'http://127.0.0.1:4321')
  const corsPreviewOrigins = config.corsPreviewOrigins ?? process.env.CORS_PREVIEW_ORIGINS ?? ''
  mkdirSync(dirname(databasePath), { recursive: true })
  mkdirSync(uploadRoot, { recursive: true })

  const database = initializeLocalDatabase(databasePath)
  const storage = createLocalStorage(uploadRoot)
  return {
    env: {
      DB: database,
      R2: storage,
      JWT_SECRET: jwtSecret,
      CORS_ORIGIN: corsOrigin,
      RELEASE_SHA: releaseSha,
      ...(corsPreviewOrigins ? { CORS_PREVIEW_ORIGINS: corsPreviewOrigins } : {}),
    },
    close() {
      storage.close()
      database.close()
    },
  }
}
