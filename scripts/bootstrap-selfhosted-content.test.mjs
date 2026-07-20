import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASELINE,
  buildInitializationStatements,
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
