import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSelfHostedReleasePreflight } from './preflight-selfhosted-release.mjs'

test('发布前预检要求 release.json.source 与外部 RELEASE_SHA 精确一致', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alumni-book-release-preflight-'))
  const releaseFile = join(directory, 'release.json')
  const releaseSha = '0123456789abcdef0123456789abcdef01234567'
  const originalReleaseSha = process.env.RELEASE_SHA
  try {
    await writeFile(releaseFile, JSON.stringify({ source: releaseSha, target: 'aliyun-selfhosted', builtAt: '2026-07-20T13:00:00.000Z' }))
    process.env.RELEASE_SHA = releaseSha
    assert.deepEqual(assertSelfHostedReleasePreflight({ releaseFile }).source, releaseSha)
    assert.throws(() => assertSelfHostedReleasePreflight({ releaseFile, expectedSha: '89abcdef0123456789abcdef0123456789abcdef' }), /不一致/)
  } finally {
    if (originalReleaseSha === undefined) delete process.env.RELEASE_SHA
    else process.env.RELEASE_SHA = originalReleaseSha
    await rm(directory, { recursive: true, force: true })
  }
})

test('Compose 与 systemd 使用同一 deploy/.env 发布环境来源', async () => {
  const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8')
  const service = await readFile(new URL('../deploy/alumni-book-api.service', import.meta.url), 'utf8')
  assert.match(compose, /env_file:\s*\n\s*- deploy\/\.env/)
  assert.match(service, /EnvironmentFile=\/opt\/alumni-book\/app\/deploy\/\.env/)
  assert.match(service, /ExecStartPre=\/usr\/bin\/node \/opt\/alumni-book\/app\/scripts\/preflight-selfhosted-release\.mjs/)
  assert.doesNotMatch(service, /\.release\.env/)
})
