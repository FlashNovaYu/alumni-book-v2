import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BASELINE,
  buildInitializationStatements,
  main,
  runBootstrap,
  summarizeContent,
} from './bootstrap-selfhosted-content.mjs'

const rows = {
  students: [
    { avatar_url: 'avatars/a.jpg', is_owner: 1, completion: 100 },
    { avatar_url: null, is_owner: 0, completion: 0 },
    { avatar_url: null, is_owner: 0, completion: 12 },
  ],
  albums: [{ id: 'album-a', photos: [{ id: 'photo-a' }, { id: 'photo-b' }] }],
  timeline: [{ id: 'event-a' }, { id: 'event-b' }],
}

test('内容统计覆盖总数、完成度、媒体、时光轴和 owner', () => {
  assert.deepEqual(summarizeContent(rows), {
    studentCount: 3,
    completionDistribution: { '0': 1, '12': 1, '100': 1 },
    completedStudentCount: 2,
    avatarCount: 1,
    albumCount: 1,
    photoCount: 2,
    timelineCount: 2,
    ownerCount: 1,
  })
})

test('timelineCount 使用记录总数覆盖 API feed 的分页长度', () => {
  assert.equal(summarizeContent({ ...rows, timelineCount: 147 }).timelineCount, 147)
})

test('API 缺少 is_owner 字段时明确报告 owner 数未知', () => {
  const report = runBootstrap({ rows: { ...rows, ownerCount: null }, dryRun: true })
  assert.equal(report.stats.ownerCount, null)
  assert.match(report.warnings.join('\n'), /owner.*未知/)
})

test('基线漂移产生警告但不泄露数据库内容', () => {
  const report = runBootstrap({ rows, dryRun: true })
  assert.deepEqual(report.baseline, BASELINE)
  assert.equal(report.baselineMatches, false)
  assert.match(report.warnings.join('\n'), /基线漂移/)
  assert.doesNotMatch(JSON.stringify(report), /avatars\/a\.jpg|album-a/)
})

test('dry-run 默认不执行写入，显式 apply 才执行固定幂等 SQL', () => {
  const statements = buildInitializationStatements()
  assert.ok(statements.length > 0)
  assert.ok(statements.every((sql) => /INSERT INTO/.test(sql) && /ON CONFLICT/.test(sql)))

  let writes = 0
  const writer = { exec() { writes += 1 } }
  runBootstrap({ rows, writer })
  assert.equal(writes, 0)
  runBootstrap({ rows, writer, dryRun: false })
  assert.equal(writes, statements.length)
  assert.ok(statements.every((sql) => !/password|token|secret/i.test(sql)))
})

test('SQLite dry-run 使用真实本地数据库，不依赖根目录 better-sqlite3', async () => {
  const root = mkdtempSync(join(tmpdir(), 'alumni-content-'))
  const databasePath = join(root, 'alumni.sqlite')
  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE students (avatar_url TEXT, info TEXT, is_owner INTEGER);
    CREATE TABLE albums (id TEXT);
    CREATE TABLE photos (id TEXT);
    CREATE TABLE timeline_events (id TEXT);
    INSERT INTO students VALUES ('avatars/a.jpg', '{}', 0);
    INSERT INTO albums VALUES ('album-a');
    INSERT INTO photos VALUES ('photo-a');
    INSERT INTO timeline_events VALUES ('event-a');
  `)
  database.close()
  try {
    const report = await main(['--database-path', databasePath])
    assert.equal(report.stats.studentCount, 1)
    assert.equal(report.stats.timelineCount, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('apply 必须显式数据库路径、受控根目录和存在的备份证明', async () => {
  const root = mkdtempSync(join(tmpdir(), 'alumni-content-'))
  const dataRoot = join(root, 'data')
  const backupRoot = join(root, 'backups')
  const databasePath = join(dataRoot, 'alumni.sqlite')
  const backupProof = join(backupRoot, 'alumni.sqlite.bak')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dataRoot, { recursive: true })
  mkdirSync(backupRoot, { recursive: true })
  writeFileSync(backupProof, 'backup-proof')
  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec('CREATE TABLE site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE students (avatar_url TEXT, info TEXT, is_owner INTEGER); CREATE TABLE albums (id TEXT); CREATE TABLE photos (id TEXT); CREATE TABLE timeline_events (id TEXT);')
  database.close()
  const previous = { data: process.env.SELFHOSTED_DATA_ROOT, backup: process.env.SELFHOSTED_BACKUP_ROOT }
  process.env.SELFHOSTED_DATA_ROOT = dataRoot
  process.env.SELFHOSTED_BACKUP_ROOT = backupRoot
  try {
    await assert.rejects(() => main(['--apply']), /--database-path/)
    await assert.rejects(() => main(['--apply', '--database-path', databasePath]), /备份证明/)
    const report = await main(['--apply', '--database-path', databasePath, '--backup-proof', backupProof])
    assert.ok(report.beforeStats)
    assert.ok(report.afterStats)
    assert.equal(report.afterStats.studentCount, 0)
  } finally {
    if (previous.data === undefined) delete process.env.SELFHOSTED_DATA_ROOT
    else process.env.SELFHOSTED_DATA_ROOT = previous.data
    if (previous.backup === undefined) delete process.env.SELFHOSTED_BACKUP_ROOT
    else process.env.SELFHOSTED_BACKUP_ROOT = previous.backup
    rmSync(root, { recursive: true, force: true })
  }
})
