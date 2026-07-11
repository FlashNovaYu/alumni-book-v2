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
  it('uses Pages as the production SSG data source', () => {
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

    for (const file of files) {
      expect(read(file), file).toContain(pagesHost)
    }
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
    const config = read('wrangler.pages.toml')
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
})
