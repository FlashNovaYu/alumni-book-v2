import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSelfHostedReleasePreflight } from './preflight-selfhosted-release.mjs'
import { smokeSelfHosted } from './smoke-selfhosted.mjs'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const releaseShaPattern = /^[0-9a-f]{40}$/i
const defaultArtifactDir = join(rootDir, 'deploy', 'selfhosted')

function assertReleaseSha(releaseSha) {
  if (!releaseShaPattern.test(String(releaseSha || ''))) throw new Error('release-sha 必须是完整 40 位十六进制提交 SHA')
}

function releaseBuiltAt(releaseDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(releaseDir, 'release.json'), 'utf8'))
    const builtAt = Date.parse(manifest.builtAt)
    if (!Number.isNaN(builtAt)) return builtAt
  } catch {}
  return statSync(releaseDir).mtimeMs
}

function prepareReleaseDirectory({ artifactDir, releasesRoot, releaseSha }) {
  const sourceDir = resolve(artifactDir)
  const releaseDir = join(resolve(releasesRoot), releaseSha)
  assertSelfHostedReleasePreflight({ releaseFile: join(sourceDir, 'release.json'), expectedSha: releaseSha })
  mkdirSync(releasesRoot, { recursive: true })

  if (existsSync(releaseDir)) {
    throw new Error(`发布目录已存在，拒绝复用：${releaseDir}`)
  }

  const stagingDir = join(resolve(releasesRoot), `.${releaseSha}.staging-${process.pid}-${Date.now()}`)
  try {
    cpSync(sourceDir, stagingDir, { recursive: true, errorOnExist: true })
    assertSelfHostedReleasePreflight({ releaseFile: join(stagingDir, 'release.json'), expectedSha: releaseSha })
    renameSync(stagingDir, releaseDir)
    return { releaseDir, created: true }
  } finally {
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true })
  }
}

export function switchCurrentSymlinkAtomically({ livePath, releaseDir }) {
  const absoluteLivePath = resolve(livePath)
  const absoluteReleaseDir = resolve(releaseDir)
  mkdirSync(dirname(absoluteLivePath), { recursive: true })
  if (existsSync(absoluteLivePath) && !lstatSync(absoluteLivePath).isSymbolicLink()) {
    throw new Error(`当前站点路径必须是 symlink 或不存在：${absoluteLivePath}`)
  }

  const temporaryLink = join(dirname(absoluteLivePath), `.${basename(absoluteLivePath)}.next-${process.pid}-${Date.now()}`)
  const linkTarget = relative(dirname(absoluteLivePath), absoluteReleaseDir) || '.'
  try {
    symlinkSync(linkTarget, temporaryLink, process.platform === 'win32' ? 'junction' : 'dir')
    renameSync(temporaryLink, absoluteLivePath)
  } finally {
    if (existsSync(temporaryLink)) rmSync(temporaryLink, { force: true })
  }
}

export function pruneSelfHostedReleases({ releasesRoot, activeSha, retain = 3 }) {
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  const releases = readdirSync(releasesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && releaseShaPattern.test(entry.name))
    .map((entry) => ({ name: entry.name, builtAt: releaseBuiltAt(join(releasesRoot, entry.name)) }))
    .sort((left, right) => right.builtAt - left.builtAt)
  const kept = new Set([activeSha, ...releases.filter((release) => release.name !== activeSha).slice(0, retain - 1).map((release) => release.name)])
  for (const release of releases) {
    if (!kept.has(release.name)) rmSync(join(releasesRoot, release.name), { recursive: true, force: true })
  }
  return [...kept]
}

export async function atomicDeploySelfHosted({
  releaseSha,
  artifactDir = defaultArtifactDir,
  releasesRoot = '/www/wwwroot/releases',
  livePath = '/www/wwwroot/alumni-book',
  stagingBaseUrl,
  retain = 3,
  smoke = ({ baseUrl, expectedSha }) => smokeSelfHosted({ baseUrl, expectedSha }),
  switchCurrent = switchCurrentSymlinkAtomically,
} = {}) {
  assertReleaseSha(releaseSha)
  if (!stagingBaseUrl) throw new Error('原子发布必须提供 staging-base-url')
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  const { releaseDir, created } = prepareReleaseDirectory({ artifactDir, releasesRoot, releaseSha })

  try {
    await smoke({ baseUrl: stagingBaseUrl, expectedSha: releaseSha })
  } catch (error) {
    if (created && existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true })
    throw error
  }
  await switchCurrent({ livePath, releaseDir })

  let cleanupWarning
  let retained = []
  try {
    retained = pruneSelfHostedReleases({ releasesRoot, activeSha: releaseSha, retain })
  } catch (error) {
    cleanupWarning = String(error)
  }
  return { releaseSha, releaseDir, retained, cleanupWarning }
}

export async function rollbackSelfHostedRelease({
  releaseSha,
  releasesRoot = '/www/wwwroot/releases',
  livePath = '/www/wwwroot/alumni-book',
  switchCurrent = switchCurrentSymlinkAtomically,
} = {}) {
  assertReleaseSha(releaseSha)
  const releaseDir = join(resolve(releasesRoot), releaseSha)
  assertSelfHostedReleasePreflight({ releaseFile: join(releaseDir, 'release.json'), expectedSha: releaseSha })
  await switchCurrent({ livePath, releaseDir })
  return { releaseSha, releaseDir }
}

function argument(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

export function parseAtomicReleaseArgs(argv = process.argv) {
  const command = argv[2]
  if (command !== 'deploy' && command !== 'rollback') throw new Error('命令必须是 deploy 或 rollback')
  const releaseSha = argument(argv, '--release-sha') || process.env.RELEASE_SHA
  assertReleaseSha(releaseSha)
  const releasesRoot = argument(argv, '--releases-root') || '/www/wwwroot/releases'
  const livePath = argument(argv, '--live-path') || '/www/wwwroot/alumni-book'
  if (command === 'rollback') return { command, releaseSha, releasesRoot, livePath }

  const stagingBaseUrl = argument(argv, '--staging-base-url') || process.env.SELF_HOST_STAGING_BASE_URL
  if (!stagingBaseUrl) throw new Error('deploy 命令必须提供 --staging-base-url')
  const retain = Number(argument(argv, '--retain') || 3)
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  return {
    command,
    releaseSha,
    artifactDir: argument(argv, '--artifact-dir') || defaultArtifactDir,
    releasesRoot,
    livePath,
    stagingBaseUrl,
    retain,
  }
}

if (process.argv[1]?.endsWith('atomic-selfhosted-release.mjs')) {
  try {
    const options = parseAtomicReleaseArgs()
    const result = options.command === 'deploy'
      ? await atomicDeploySelfHosted(options)
      : await rollbackSelfHostedRelease(options)
    if (result.cleanupWarning) console.warn(`发布已切换，但旧版本清理失败：${result.cleanupWarning}`)
    console.log(`${options.command === 'deploy' ? 'Atomic release' : 'Rollback'} completed: ${result.releaseSha}`)
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
