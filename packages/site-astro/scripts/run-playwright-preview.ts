import { execFileSync, spawn } from 'child_process'
import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const siteDir = resolve(scriptDir, '..')
const host = '127.0.0.1'
const port = 4321
const rawSiteBase = process.env.SITE_BASE ?? '/'
const siteBase = rawSiteBase === '/'
  ? '/'
  : `/${rawSiteBase.replace(/^\/+|\/+$/g, '')}/`
const previewURL = `http://${host}:${port}${siteBase}`
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

async function waitForPreview(timeoutMs = 120000) {
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

function releasePreviewPort() {
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
      ], { stdio: 'ignore', timeout: 5000 })
    } else {
      execFileSync('sh', ['-c', `fuser -k ${port}/tcp 2>/dev/null || true`], { stdio: 'ignore', timeout: 5000 })
    }
  } catch {
    // A busy port is handled by the preview startup failure below.
  }
}

async function run() {
  releasePreviewPort()
  const preview = spawnLogged(process.execPath, [astroCli, 'preview', '--host', host])

  try {
    await waitForPreview()
    const playwright = spawnLogged(process.execPath, [playwrightCli, 'test', ...testArgs], {
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
    })

    const code = await new Promise<number>(resolve => {
      playwright.on('close', code => resolve(code ?? 1))
      playwright.on('error', () => resolve(1))
    })

    return code
  } finally {
    killProcessTree(preview.pid)
    releasePreviewPort()
  }

  return 1
}

run().then(code => {
  process.exit(code)
}).catch(error => {
  console.error(error)
  process.exit(1)
})
