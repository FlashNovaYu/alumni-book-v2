import { execFileSync, spawn } from 'child_process'
import { createRequire } from 'module'
import { createServer } from 'net'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const siteDir = resolve(scriptDir, '..')
const host = '127.0.0.1'
const rawSiteBase = process.env.SITE_BASE ?? '/'
const siteBase = rawSiteBase === '/'
  ? '/'
  : `/${rawSiteBase.replace(/^\/+|\/+$/g, '')}/`
const astroCli = resolve(siteDir, 'node_modules', 'astro', 'astro.js')
const playwrightCli = require.resolve('@playwright/test/cli')
const testArgs = process.argv.slice(2)

function spawnLogged(command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return spawn(command, args, {
    cwd: siteDir,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  })
}

function findAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen({ host, port: 0 }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a preview port')))
        return
      }

      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForPreview(previewURL: string, timeoutMs = 120000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(previewURL, {
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
      })
      if (response.status >= 200 && response.status < 400) {
        console.log(`[Preview] Ready at ${previewURL}`)
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error: any) {
      lastError = error?.message || String(error)
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error(`Astro preview did not become ready at ${previewURL}: ${lastError}`)
}

function killProcessTree(pid: number | undefined) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
      ], { stdio: 'ignore', timeout: 5000 })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    // Process already exited.
  }
}

function ensurePlaywrightBrowser() {
  if (!process.env.CI) return

  const installArgs = process.platform === 'linux'
    ? ['install', '--with-deps', 'chromium']
    : ['install', 'chromium']

  console.log(`[Playwright] Ensuring Chromium is installed for CI...`)
  execFileSync(process.execPath, [playwrightCli, ...installArgs], {
    cwd: siteDir,
    stdio: 'inherit',
    timeout: 300000,
  })
}

async function run() {
  ensurePlaywrightBrowser()
  const port = await findAvailablePort()
  const previewURL = `http://${host}:${port}${siteBase}`
  const preview = spawnLogged(process.execPath, [astroCli, 'preview', '--host', host, '--port', String(port)])

  try {
    await waitForPreview(previewURL)
    const playwright = spawnLogged(process.execPath, [playwrightCli, 'test', ...testArgs], {
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
      PLAYWRIGHT_PORT: String(port),
    })

    const code = await new Promise<number>(resolve => {
      playwright.on('close', code => resolve(code ?? 1))
      playwright.on('error', () => resolve(1))
    })

    return code
  } finally {
    killProcessTree(preview.pid)
  }

  return 1
}

run().then(code => {
  process.exit(code)
}).catch(error => {
  console.error(error)
  process.exit(1)
})
