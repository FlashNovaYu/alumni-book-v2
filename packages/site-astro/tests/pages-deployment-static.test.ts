import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const siteRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(siteRoot, '../..')
const pagesHost = 'https://alumni-book.pages.dev'
const publicWorkerHost = 'https://alumni-book-api.chenyuhao2263.workers.dev'

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('Pages production deployment contract', () => {
  it('uses an explicit SSG API data source for each deployment target', () => {
    const files = [
      'packages/site-astro/astro.config.mjs',
      'packages/site-astro/scripts/fetch-data.ts',
      'packages/site-astro/src/pages/index.astro',
      'packages/site-astro/src/pages/album.astro',
      'packages/site-astro/src/pages/preface.astro',
      'packages/site-astro/src/pages/roster.astro',
      'packages/site-astro/src/pages/timeline.astro',
      'packages/site-astro/src/pages/yearbook.astro',
      'packages/site-astro/src/pages/student/[slug].astro',
    ]

    for (const file of files) expect(read(file), file).not.toContain('VITE_WORKER_URL')
    expect(read('packages/site-astro/astro.config.mjs')).toContain('VITE_SSG_API_BASE')
    expect(read('.github/workflows/deploy-production.yml')).toContain(`VITE_SSG_API_BASE: '${pagesHost}'`)
    expect(read('packages/site-astro/scripts/fetch-data.ts')).not.toContain(publicWorkerHost)
  })

  it('defaults the admin build to /admin/ with a same-origin API', () => {
    const config = read('packages/admin/vite.config.ts')
    expect(config).toContain("process.env.SITE_BASE ?? '/'")
    expect(config).toContain("process.env.VITE_API_BASE_URL ?? ''")
  })

  it('uses root paths in the static 404 page', () => {
    const notFound = read('packages/site-astro/public/404.html')
    expect(notFound).toContain('href="/"')
    expect(notFound).toContain('href="/admin/"')
    expect(notFound).toContain("var siteBase = '/';")
  })

  it('declares direct Pages bindings and legacy redirects', () => {
    const config = read('wrangler.toml')
    expect(config).toContain('pages_build_output_dir = "./deploy"')
    expect(config).toContain('binding = "DB"')
    expect(config).toContain('binding = "R2"')
    expect(config).not.toContain('JWT_SECRET')

    const redirects = read('packages/site-astro/public/_redirects')
    expect(redirects).toContain('/alumni-book-v2/* /:splat 302')

    const headers = read('packages/site-astro/public/_headers')
    expect(headers).toContain('max-age=31536000')
    expect(headers).toContain('immutable')
  })

  it('builds the Pages Worker as a deployable module directory', () => {
    const prepareScript = read('scripts/prepare-pages-deploy.mjs')
    expect(prepareScript).toContain("const workerOut = join(deployDir, '_worker.js')")
    expect(prepareScript).toContain("'--outdir', workerOut")
    expect(prepareScript).not.toContain("'--outfile', workerOut")
  })

  it('embeds and verifies the exact release commit', () => {
    const prepareScript = read('scripts/prepare-pages-deploy.mjs')
    const smokeScript = read('scripts/smoke-pages.mjs')

    expect(prepareScript).toContain("'release.json'")
    expect(prepareScript).toContain('RELEASE_SHA')
    expect(smokeScript).toContain('PAGES_EXPECTED_SHA')
    expect(smokeScript).toContain("'/release.json'")
  })

  it('retries release SHA convergence with bounded incremental backoff', () => {
    const smokeScript = read('scripts/smoke-pages.mjs')

    expect(smokeScript).toContain('const releaseVerificationAttempts = 8')
    expect(smokeScript).toContain('async function waitForReleaseSha()')
    expect(smokeScript).toContain('attempt <= releaseVerificationAttempts')
    expect(smokeScript).toContain('if (releaseBody.source === expectedSha) return')
    expect(smokeScript).toContain('await sleep(attempt * 2000)')
    expect(smokeScript).toContain('线上发布 SHA 为 ${actualSource}，预期 ${expectedSha}')
    expect(smokeScript).toContain('await waitForReleaseSha()')
  })

  it('deploys the unified Pages app and keeps Worker deployment manual', () => {
    const pagesWorkflow = read('.github/workflows/deploy-production.yml')
    expect(pagesWorkflow).toContain('pnpm prepare:pages')
    expect(pagesWorkflow).toContain('pnpm smoke:pages')
    expect(pagesWorkflow).toContain('wrangler --cwd ../.. pages deploy deploy')
    expect(pagesWorkflow).not.toContain('wrangler.pages.toml')
    expect(pagesWorkflow).toContain("VITE_SSG_API_BASE: 'https://alumni-book.pages.dev'")

    const workerWorkflow = read('.github/workflows/deploy-worker.yml')
    expect(workerWorkflow).toContain('workflow_dispatch:')
    expect(workerWorkflow).not.toContain('push:')
  })
})
