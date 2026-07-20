import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  atomicDeploySelfHosted,
  parseAtomicReleaseArgs,
  rollbackSelfHostedRelease,
} from './atomic-selfhosted-release.mjs'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'
const oldReleaseShas = [
  '1111111111111111111111111111111111111111',
  '2222222222222222222222222222222222222222',
  '3333333333333333333333333333333333333333',
]

async function createRelease(directory, source, builtAt) {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'release.json'), JSON.stringify({ source, target: 'aliyun-selfhosted', builtAt }))
  await writeFile(join(directory, 'index.html'), source)
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'alumni-book-atomic-release-'))
  const artifactDir = join(root, 'artifact')
  const releasesRoot = join(root, 'releases')
  const livePath = join(root, 'alumni-book')
  await createRelease(artifactDir, releaseSha, '2026-07-20T14:00:00.000Z')
  await Promise.all(oldReleaseShas.map((sha, index) => createRelease(
    join(releasesRoot, sha),
    sha,
    `2026-07-${String(17 + index).padStart(2, '0')}T14:00:00.000Z`,
  )))
  await writeFile(livePath, 'current-release-marker')
  return { root, artifactDir, releasesRoot, livePath }
}

test('原子发布先完成 staging smoke，再切换并保留当前与两个旧版本', async () => {
  const paths = await fixture()
  const events = []
  try {
    const result = await atomicDeploySelfHosted({
      releaseSha,
      artifactDir: paths.artifactDir,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      stagingBaseUrl: 'http://127.0.0.1:8080',
      retain: 3,
      smoke: async ({ baseUrl, expectedSha }) => {
        assert.equal(baseUrl, 'http://127.0.0.1:8080')
        assert.equal(expectedSha, releaseSha)
        assert.equal(await readFile(join(paths.releasesRoot, releaseSha, 'index.html'), 'utf8'), releaseSha)
        events.push('smoke')
      },
      switchCurrent: ({ releaseDir }) => {
        assert.equal(releaseDir, join(paths.releasesRoot, releaseSha))
        events.push('switch')
      },
    })

    assert.deepEqual(events, ['smoke', 'switch'])
    assert.equal(result.releaseSha, releaseSha)
    const retained = (await readdir(paths.releasesRoot)).filter((name) => /^[0-9a-f]{40}$/.test(name)).sort()
    assert.deepEqual(retained, [oldReleaseShas[1], oldReleaseShas[2], releaseSha].sort())
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('staging smoke 失败时不切换当前站点', async () => {
  const paths = await fixture()
  let switched = false
  try {
    await assert.rejects(() => atomicDeploySelfHosted({
      releaseSha,
      artifactDir: paths.artifactDir,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      stagingBaseUrl: 'http://127.0.0.1:8080',
      smoke: async () => { throw new Error('staging smoke failed') },
      switchCurrent: () => { switched = true },
    }), /staging smoke failed/)

    assert.equal(switched, false)
    assert.equal(await readFile(paths.livePath, 'utf8'), 'current-release-marker')
    await assert.rejects(() => readFile(join(paths.releasesRoot, releaseSha, 'release.json')), /ENOENT/)
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('拒绝复用已存在的同 SHA 目录，避免 staging 验证与切换内容分裂', async () => {
  const paths = await fixture()
  let smoked = false
  let switched = false
  try {
    await createRelease(join(paths.releasesRoot, releaseSha), releaseSha, '2026-07-20T14:00:00.000Z')
    await writeFile(join(paths.releasesRoot, releaseSha, 'index.html'), 'corrupted-existing-release')
    await assert.rejects(() => atomicDeploySelfHosted({
      releaseSha,
      artifactDir: paths.artifactDir,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      stagingBaseUrl: 'http://127.0.0.1:8080',
      smoke: async () => { smoked = true },
      switchCurrent: () => { switched = true },
    }), /发布目录已存在/)
    assert.equal(smoked, false)
    assert.equal(switched, false)
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('回滚入口只切换到已存在且清单匹配的历史版本', async () => {
  const paths = await fixture()
  let rollbackTarget
  try {
    const targetSha = oldReleaseShas[2]
    await rollbackSelfHostedRelease({
      releaseSha: targetSha,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      switchCurrent: ({ releaseDir }) => { rollbackTarget = releaseDir },
    })
    assert.equal(rollbackTarget, join(paths.releasesRoot, targetSha))
    await assert.rejects(() => rollbackSelfHostedRelease({
      releaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      switchCurrent: () => undefined,
    }), /不存在|无法读取/)
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('命令行参数强制完整 SHA、staging 地址和至少三个保留版本', () => {
  assert.deepEqual(parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'rollback', '--release-sha', releaseSha,
  ]).command, 'rollback')
  assert.throws(() => parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'deploy', '--release-sha', releaseSha,
  ]), /staging-base-url/)
  assert.throws(() => parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'deploy', '--release-sha', releaseSha,
    '--staging-base-url', 'http://127.0.0.1:8080', '--retain', '2',
  ]), /至少保留 3/)
})
