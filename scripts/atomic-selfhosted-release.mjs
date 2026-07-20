import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
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

export function pruneSelfHostedReleases({ releasesRoot, activeSha, protectedShas = [], retain = 3 }) {
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  const releases = readdirSync(releasesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && releaseShaPattern.test(entry.name))
    .map((entry) => ({ name: entry.name, builtAt: releaseBuiltAt(join(releasesRoot, entry.name)) }))
    .sort((left, right) => right.builtAt - left.builtAt)
  const kept = new Set([activeSha, ...protectedShas])
  for (const release of releases) {
    if (kept.size >= retain) break
    kept.add(release.name)
  }
  for (const release of releases) {
    if (!kept.has(release.name)) rmSync(join(releasesRoot, release.name), { recursive: true, force: true })
  }
  return [...kept]
}

export function resolveLiveReleaseSha({ livePath, releasesRoot }) {
  if (!existsSync(livePath) || !lstatSync(livePath).isSymbolicLink()) return undefined
  const target = resolve(dirname(livePath), readlinkSync(livePath))
  const root = `${resolve(releasesRoot)}${sep}`
  if (!target.startsWith(root)) return undefined
  const sha = basename(target)
  return releaseShaPattern.test(sha) ? sha : undefined
}

function contentType(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[extname(file)] || 'application/octet-stream'
}

export async function startCandidateStagingServer({ releaseDir, candidateApiBaseUrl, host = '127.0.0.1', port = 0 }) {
  if (!candidateApiBaseUrl) throw new Error('必须提供隔离的 candidate-api-base-url')
  const staticRoot = resolve(releaseDir)
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://staging.local')
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const upstream = await fetch(new URL(`${url.pathname}${url.search}`, candidateApiBaseUrl))
        response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()))
        response.end(Buffer.from(await upstream.arrayBuffer()))
        return
      }
      const decoded = decodeURIComponent(url.pathname)
      const requested = decoded.endsWith('/') ? `${decoded}index.html` : decoded
      let file = resolve(staticRoot, `.${requested}`)
      if (!file.startsWith(`${staticRoot}${sep}`) && file !== staticRoot) throw new Error('非法 staging 路径')
      if ((!existsSync(file) || statSync(file).isDirectory()) && extname(decoded)) {
        response.writeHead(404).end('Not Found')
        return
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        file = join(staticRoot, decoded.startsWith('/admin/') ? 'admin/index.html' : 'index.html')
      }
      if (!existsSync(file)) {
        response.writeHead(404).end('Not Found')
        return
      }
      response.writeHead(200, { 'Content-Type': contentType(file) })
      response.end(readFileSync(file))
    } catch (error) {
      response.writeHead(502).end(String(error))
    }
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolveListen)
  })
  const address = server.address()
  return {
    baseUrl: `http://${host}:${address.port}`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  }
}

export async function atomicDeploySelfHosted({
  releaseSha,
  artifactDir = defaultArtifactDir,
  releasesRoot = '/www/wwwroot/releases',
  livePath = '/www/wwwroot/alumni-book',
  candidateApiBaseUrl,
  retain = 3,
  smoke = ({ baseUrl, expectedSha }) => smokeSelfHosted({ baseUrl, expectedSha }),
  startStaging = startCandidateStagingServer,
  switchCurrent = switchCurrentSymlinkAtomically,
  promoteApi = async () => undefined,
  rollbackApi = async () => undefined,
  liveBaseUrl,
  liveSmoke = smoke,
} = {}) {
  assertReleaseSha(releaseSha)
  if (!candidateApiBaseUrl) throw new Error('原子发布必须提供 candidate-api-base-url')
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  const { releaseDir, created } = prepareReleaseDirectory({ artifactDir, releasesRoot, releaseSha })
  const previousLiveSha = resolveLiveReleaseSha({ livePath, releasesRoot })

  let staging
  try {
    staging = await startStaging({ releaseDir, candidateApiBaseUrl })
    await smoke({ baseUrl: staging.baseUrl, expectedSha: releaseSha })
  } catch (error) {
    if (created && existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true })
    throw error
  } finally {
    await staging?.close()
  }
  let apiPromoted = false
  let staticSwitched = false
  try {
    await promoteApi({ releaseSha, candidateApiBaseUrl, previousLiveSha })
    apiPromoted = true
    await switchCurrent({ livePath, releaseDir })
    staticSwitched = true
    if (liveBaseUrl) await liveSmoke({ baseUrl: liveBaseUrl, expectedSha: releaseSha })
  } catch (error) {
    if (staticSwitched && previousLiveSha) await switchCurrent({ livePath, releaseDir: join(resolve(releasesRoot), previousLiveSha) })
    if (apiPromoted) await rollbackApi({ previousLiveSha })
    throw error
  }

  let cleanupWarning
  let retained = []
  try {
    retained = pruneSelfHostedReleases({ releasesRoot, activeSha: releaseSha, protectedShas: previousLiveSha ? [previousLiveSha] : [], retain })
  } catch (error) {
    cleanupWarning = String(error)
  }
  return { releaseSha, releaseDir, retained, cleanupWarning }
}

export async function rollbackSelfHostedRelease({
  releaseSha,
  releasesRoot = '/www/wwwroot/releases',
  livePath = '/www/wwwroot/alumni-book',
  candidateApiBaseUrl,
  smoke = ({ baseUrl, expectedSha }) => smokeSelfHosted({ baseUrl, expectedSha }),
  startStaging = startCandidateStagingServer,
  switchCurrent = switchCurrentSymlinkAtomically,
  promoteApi = async () => undefined,
  rollbackApi = async () => undefined,
  liveBaseUrl,
  liveSmoke = smoke,
} = {}) {
  assertReleaseSha(releaseSha)
  const releaseDir = join(resolve(releasesRoot), releaseSha)
  assertSelfHostedReleasePreflight({ releaseFile: join(releaseDir, 'release.json'), expectedSha: releaseSha })
  if (!candidateApiBaseUrl) throw new Error('回滚必须提供隔离的 candidate-api-base-url')
  const staging = await startStaging({ releaseDir, candidateApiBaseUrl })
  try {
    await smoke({ baseUrl: staging.baseUrl, expectedSha: releaseSha })
  } finally {
    await staging.close()
  }
  const previousLiveSha = resolveLiveReleaseSha({ livePath, releasesRoot })
  let promoted = false
  let switched = false
  try {
    await promoteApi({ releaseSha, candidateApiBaseUrl, previousLiveSha })
    promoted = true
    await switchCurrent({ livePath, releaseDir })
    switched = true
    if (liveBaseUrl) await liveSmoke({ baseUrl: liveBaseUrl, expectedSha: releaseSha })
  } catch (error) {
    if (switched && previousLiveSha) await switchCurrent({ livePath, releaseDir: join(resolve(releasesRoot), previousLiveSha) })
    if (promoted) await rollbackApi({ previousLiveSha })
    throw error
  }
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
  const candidateApiBaseUrl = argument(argv, '--candidate-api-base-url') || process.env.SELF_HOST_CANDIDATE_API_BASE_URL
  if (!candidateApiBaseUrl) throw new Error(`${command} 命令必须提供 --candidate-api-base-url`)
  const promoteApiHook = argument(argv, '--promote-api-hook')
  const rollbackApiHook = argument(argv, '--rollback-api-hook')
  const liveBaseUrl = argument(argv, '--live-base-url')
  if (!promoteApiHook || !rollbackApiHook || !liveBaseUrl) throw new Error('deploy 必须提供 API promotion/rollback hook 和 live-base-url')
  if (command === 'rollback') return { command, releaseSha, releasesRoot, livePath, candidateApiBaseUrl, promoteApiHook, rollbackApiHook, liveBaseUrl }
  const retain = Number(argument(argv, '--retain') || 3)
  if (!Number.isInteger(retain) || retain < 3) throw new Error('原子发布至少保留 3 个版本（当前版本和两个旧版本）')
  return {
    command,
    releaseSha,
    artifactDir: argument(argv, '--artifact-dir') || defaultArtifactDir,
    releasesRoot,
    livePath,
    candidateApiBaseUrl,
    retain,
    promoteApiHook,
    rollbackApiHook,
    liveBaseUrl,
  }
}

if (process.argv[1]?.endsWith('atomic-selfhosted-release.mjs')) {
  try {
    const options = parseAtomicReleaseArgs()
    const result = options.command === 'deploy'
      ? await atomicDeploySelfHosted({
        ...options,
        promoteApi: ({ releaseSha }) => execFileSync(options.promoteApiHook, [releaseSha], { stdio: 'inherit' }),
        rollbackApi: ({ previousLiveSha }) => execFileSync(options.rollbackApiHook, previousLiveSha ? [previousLiveSha] : [], { stdio: 'inherit' }),
      })
      : await rollbackSelfHostedRelease({
        ...options,
        promoteApi: ({ releaseSha }) => execFileSync(options.promoteApiHook, [releaseSha], { stdio: 'inherit' }),
        rollbackApi: ({ previousLiveSha }) => execFileSync(options.rollbackApiHook, previousLiveSha ? [previousLiveSha] : [], { stdio: 'inherit' }),
      })
    if (result.cleanupWarning) console.warn(`发布已切换，但旧版本清理失败：${result.cleanupWarning}`)
    console.log(`${options.command === 'deploy' ? 'Atomic release' : 'Rollback'} completed: ${result.releaseSha}`)
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
