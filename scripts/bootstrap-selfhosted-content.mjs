import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'

/**
 * 阿里云自托管内容初始化前的只读审计和幂等初始化骨架。
 * 默认 dry-run；只有显式传入 --apply 才会执行固定的无敏感信息 SQL。
 */

export const BASELINE = Object.freeze({
  studentCount: 46,
  completedStudentCount: 6,
  avatarCount: 0,
  albumCount: 1,
  photoCount: 0,
  timelineCount: 47,
  ownerCount: 0,
})

const REQUIRED_PROFILE_FIELDS = [
  'nickname', 'motto', 'bestMemory', 'favoriteSong', 'futureSelf',
  'letterToClassmates', 'profileModules', 'favoriteFood', 'bestSubject',
  'targetUniversity', 'futureCareer', 'bestLesson', 'deskmateFun',
  'classMeme', 'mbti',
]

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim().length > 0
}

export function computeCompletion(student) {
  let info = student?.info
  if (typeof info === 'string') {
    try { info = JSON.parse(info || '{}') } catch { info = {} }
  }
  info = info && typeof info === 'object' ? info : {}
  const filled = REQUIRED_PROFILE_FIELDS.filter((key) => hasValue(info[key])).length + (student?.avatar_url || student?.avatarUrl ? 1 : 0)
  return Math.round((filled / 16) * 100)
}

export function summarizeContent(input = {}) {
  const students = Array.isArray(input.students) ? input.students : []
  const albums = Array.isArray(input.albums) ? input.albums : []
  const photos = Array.isArray(input.photos)
    ? input.photos
    : albums.flatMap((album) => Array.isArray(album?.photos) ? album.photos : [])
  const timeline = Array.isArray(input.timeline) ? input.timeline : []
  const completions = students.map((student) => Number.isFinite(Number(student?.completion))
    ? Number(student.completion)
    : computeCompletion(student))
  const completionDistribution = {}
  for (const completion of completions) {
    const key = String(completion)
    completionDistribution[key] = (completionDistribution[key] || 0) + 1
  }

  return {
    studentCount: students.length,
    completionDistribution: Object.fromEntries(Object.entries(completionDistribution).sort(([a], [b]) => Number(a) - Number(b))),
    completedStudentCount: completions.filter((completion) => completion > 0).length,
    avatarCount: students.filter((student) => Boolean(student?.avatar_url || student?.avatarUrl)).length,
    albumCount: albums.length,
    photoCount: photos.length,
    timelineCount: Number.isInteger(input.timelineCount) ? input.timelineCount : timeline.length,
    ownerCount: input.ownerCount === null
      ? null
      : Number.isInteger(input.ownerCount)
        ? input.ownerCount
        : students.filter((student) => Boolean(student?.is_owner || student?.isOwner || student?.hasStandardProfile === false)).length,
  }
}

function matchesBaseline(stats) {
  return Object.keys(BASELINE).every((key) => stats[key] === BASELINE[key])
}

export function buildInitializationStatements() {
  // 固定 key + no-op DO UPDATE：首次运行只建立审计标记，冲突时绝不覆盖管理员内容。
  return [
    "INSERT INTO site_config (key, value) VALUES ('content_bootstrap_marker', 'v1') ON CONFLICT(key) DO UPDATE SET value = site_config.value;",
  ]
}

export function runBootstrap({ rows, writer, dryRun = true } = {}) {
  const stats = summarizeContent(rows)
  const baselineMatches = matchesBaseline(stats)
  const warnings = baselineMatches
    ? []
    : ['内容统计相对已知基线漂移（46/6/0/1/0/47/0），请先人工核对数据来源和初始化清单。']
  if (stats.ownerCount === null) warnings.push('当前输入未提供 is_owner 字段，owner 数未知；请改用受控 SQLite 报告。')
  const statements = buildInitializationStatements()
  if (!dryRun) {
    if (!writer || typeof writer.exec !== 'function') throw new Error('执行初始化需要可写数据库连接')
    for (const sql of statements) writer.exec(sql)
  }
  return {
    stats,
    baseline: BASELINE,
    baselineMatches,
    warnings,
    initialization: { dryRun, statementCount: statements.length },
  }
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

async function readApiRows(baseUrl) {
  async function getJson(route) {
    const response = await fetch(`${baseUrl}${route}`)
    if (!response.ok) throw new Error(`${route} 请求失败：HTTP ${response.status}`)
    const payload = await response.json()
    if (!payload || payload.success === false) throw new Error(`${route} 返回失败`)
    return payload.data
  }
  const [students, albums, timeline, timelineCountPayload] = await Promise.all([
    getJson('/api/classmates'),
    getJson('/api/albums'),
    getJson('/api/timeline?type=event'),
    getJson('/api/timeline/count'),
  ])
  const studentRows = Array.isArray(students) ? students : []
  const hasOwnerField = studentRows.every((student) => Object.hasOwn(student || {}, 'isOwner') || Object.hasOwn(student || {}, 'is_owner'))
  return {
    students: studentRows,
    albums: Array.isArray(albums) ? albums : [],
    timeline: Array.isArray(timeline) ? timeline : [],
    timelineCount: Number(timelineCountPayload?.count),
    ownerCount: hasOwnerField ? studentRows.filter((student) => Boolean(student?.isOwner || student?.is_owner)).length : null,
  }
}

function readSqliteRows(database) {
  return {
    students: database.prepare('SELECT avatar_url, info, is_owner FROM students').all(),
    albums: database.prepare('SELECT id FROM albums').all(),
    photos: database.prepare('SELECT id FROM photos').all(),
    timeline: database.prepare('SELECT id FROM timeline_events').all(),
  }
}

export async function openSqlite(databasePath, writable) {
  let database
  try {
    const { DatabaseSync } = await import('node:sqlite')
    database = new DatabaseSync(databasePath, { readOnly: !writable })
  } catch (nodeSqliteError) {
    try {
      const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
      const require = createRequire(path.join(repoRoot, 'workers/api/package.json'))
      const Database = require('better-sqlite3')
      database = new Database(databasePath, { readonly: !writable })
    } catch {
      throw new Error(`无法加载 SQLite 运行时（node:sqlite 和 workers/api better-sqlite3 均不可用）：${nodeSqliteError instanceof Error ? nodeSqliteError.message : String(nodeSqliteError)}`)
    }
  }
  return { database, rows: readSqliteRows(database) }
}

function isWithin(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function validateApplyOptions(options) {
  if (!options.databasePathExplicit) throw new Error('--apply 必须显式提供 --database-path')
  if (!existsSync(options.databasePath)) throw new Error('SQLite 数据库路径不存在')
  const databasePath = realpathSync(options.databasePath)
  const roots = [options.dataRoot, options.backupRoot].filter(Boolean).map((root) => path.resolve(root))
  if (roots.length === 0 || !roots.some((root) => isWithin(databasePath, root))) {
    throw new Error('SQLite 路径必须位于 SELFHOSTED_DATA_ROOT 或 SELFHOSTED_BACKUP_ROOT 受控范围内')
  }
  if (!options.backupProof || !existsSync(options.backupProof)) throw new Error('apply 必须提供存在的备份证明')
  if (!options.backupRoot || !isWithin(realpathSync(options.backupProof), options.backupRoot)) {
    throw new Error('备份证明必须位于 SELFHOSTED_BACKUP_ROOT 受控范围内')
  }
}

function parseArgs(argv) {
  const valueAfter = (name) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    dryRun: !argv.includes('--apply'),
    databasePathExplicit: argv.includes('--database-path'),
    databasePath: valueAfter('--database-path') || process.env.DATABASE_PATH,
    apiBase: valueAfter('--api-base') || process.env.SELF_HOST_BASE_URL,
    backupProof: valueAfter('--backup-proof') || process.env.SELFHOSTED_BACKUP_PROOF,
    dataRoot: valueAfter('--data-root') || process.env.SELFHOSTED_DATA_ROOT,
    backupRoot: valueAfter('--backup-root') || process.env.SELFHOSTED_BACKUP_ROOT,
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (!options.dryRun) validateApplyOptions(options)
  let database
  let rows
  if (options.apiBase) {
    if (!options.dryRun) throw new Error('--api-base 仅支持只读报告；初始化写入必须指向受控 SQLite 并显式使用 --apply')
    rows = await readApiRows(normalizeBaseUrl(options.apiBase))
  } else {
    ({ database, rows } = await openSqlite(options.databasePath, !options.dryRun))
  }
  try {
    const report = runBootstrap({ rows, writer: database, dryRun: options.dryRun })
    if (!options.dryRun) {
      report.beforeStats = report.stats
      report.afterStats = summarizeContent(readSqliteRows(database))
    }
    console.log(JSON.stringify(report, null, 2))
    return report
  } finally {
    database?.close()
  }
}

if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`内容初始化失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
