import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultReleaseFile = join(rootDir, 'deploy', 'selfhosted', 'release.json')
const releaseShaPattern = /^[0-9a-f]{40}$/i

export function assertSelfHostedReleasePreflight({ releaseFile = defaultReleaseFile, expectedSha = process.env.RELEASE_SHA } = {}) {
  if (!releaseShaPattern.test(String(expectedSha || ''))) throw new Error('RELEASE_SHA 必须是完整 40 位十六进制提交 SHA')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(releaseFile, 'utf8'))
  } catch (error) {
    throw new Error(`无法读取自托管发布清单：${releaseFile}`, { cause: error })
  }
  if (!releaseShaPattern.test(String(manifest?.source || ''))) throw new Error('release.json.source 必须是完整 40 位十六进制提交 SHA')
  if (manifest.source !== expectedSha) throw new Error(`release.json.source 与 RELEASE_SHA 不一致：${manifest.source} != ${expectedSha}`)
  if (!manifest.builtAt || Number.isNaN(Date.parse(manifest.builtAt))) throw new Error('release.json.builtAt 无效')
  return manifest
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1]?.endsWith('preflight-selfhosted-release.mjs')) {
  try {
    assertSelfHostedReleasePreflight({ releaseFile: argument('--release-file') })
    console.log('Self-hosted release preflight passed')
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
