import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
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
  await mkdir(join(directory, 'admin'), { recursive: true })
  await writeFile(join(directory, 'admin', 'index.html'), source)
}

async function startFakeCandidateApi(expectedSha) {
  const server = createServer((request, response) => {
    if (request.url === '/api/health') response.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'ok', releaseSha: expectedSha } }))
    else if (request.url === '/api/readiness') response.writeHead(200).end(JSON.stringify({ success: true, data: { ready: true } }))
    else response.writeHead(404).end(JSON.stringify({ success: false }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

const injectedStaging = async () => ({ baseUrl: 'http://127.0.0.1:8080', close: async () => undefined })

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
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
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
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
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
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
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
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
      smoke: async () => undefined,
      switchCurrent: ({ releaseDir }) => { rollbackTarget = releaseDir },
    })
    assert.equal(rollbackTarget, join(paths.releasesRoot, targetSha))
    await assert.rejects(() => rollbackSelfHostedRelease({
      releaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
      smoke: async () => undefined,
      switchCurrent: () => undefined,
    }), /不存在|无法读取/)
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('命令行参数强制完整 SHA、staging 地址和至少三个保留版本', () => {
  assert.deepEqual(parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'rollback', '--release-sha', releaseSha,
    '--candidate-api-base-url', 'http://127.0.0.1:8788',
  ]).command, 'rollback')
  assert.throws(() => parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'deploy', '--release-sha', releaseSha,
  ]), /candidate-api-base-url/)
  assert.throws(() => parseAtomicReleaseArgs([
    'node', 'atomic-selfhosted-release.mjs', 'deploy', '--release-sha', releaseSha,
    '--candidate-api-base-url', 'http://127.0.0.1:8788', '--retain', '2',
  ]), /至少保留 3/)
})

test('真实 HTTP staging 服务最终 release 目录并代理隔离候选 API', async () => {
  const paths = await fixture()
  const api = await startFakeCandidateApi(releaseSha)
  let switched = false
  try {
    await atomicDeploySelfHosted({
      releaseSha,
      artifactDir: paths.artifactDir,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      candidateApiBaseUrl: api.baseUrl,
      switchCurrent: () => { switched = true },
    })
    assert.equal(switched, true)
  } finally {
    await api.close()
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('发布时显式保护回滚到的较老 live symlink 目标', async () => {
  const paths = await fixture()
  try {
    await rm(paths.livePath, { force: true })
    await symlink(join(paths.releasesRoot, oldReleaseShas[0]), paths.livePath, 'junction')
    await atomicDeploySelfHosted({
      releaseSha,
      artifactDir: paths.artifactDir,
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      candidateApiBaseUrl: 'http://127.0.0.1:8788',
      startStaging: injectedStaging,
      smoke: async () => undefined,
      switchCurrent: () => undefined,
    })
    const retained = await readdir(paths.releasesRoot)
    assert.equal(retained.includes(oldReleaseShas[0]), true)
  } finally {
    await rm(paths.root, { recursive: true, force: true })
  }
})

test('回滚损坏产物的完整 staging smoke 失败时不切换真实 symlink', async () => {
  const paths = await fixture()
  const api = await startFakeCandidateApi(oldReleaseShas[2])
  try {
    await rm(paths.livePath, { force: true })
    await symlink(join(paths.releasesRoot, oldReleaseShas[1]), paths.livePath, 'junction')
    await rm(join(paths.releasesRoot, oldReleaseShas[2], 'admin', 'index.html'))
    await assert.rejects(() => rollbackSelfHostedRelease({
      releaseSha: oldReleaseShas[2],
      releasesRoot: paths.releasesRoot,
      livePath: paths.livePath,
      candidateApiBaseUrl: api.baseUrl,
    }), /admin.*状态码异常|404/)
    assert.equal((await readFile(join(paths.livePath, 'release.json'), 'utf8')).includes(oldReleaseShas[1]), true)
  } finally {
    await api.close()
    await rm(paths.root, { recursive: true, force: true })
  }
})
