import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('生产发布单一写入者契约', () => {
  it('生产工作流只允许 main 手动审批发布', () => {
    expect(existsSync(resolve(repoRoot, '.github/workflows/deploy-site.yml'))).toBe(false)
    const workflow = read('.github/workflows/deploy-production.yml')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s*schedule:/m)
    expect(workflow).not.toMatch(/^\s*push:/m)
    expect(workflow).not.toContain('master')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('DEPLOY_PRODUCTION')
    expect(workflow).toContain('node scripts/production-deploy-guard.mjs')
    expect(workflow).toContain('--commit-hash "$GITHUB_SHA"')
    expect(workflow).toContain('--commit-dirty=false')
    expect(workflow).not.toContain('--commit-dirty=true')
    expect(workflow).toContain('d1 migrations apply alumni-book-db --remote')
  })

  it('push 与 pull request 仅运行不含 Cloudflare 凭据的验证 CI', () => {
    const workflow = read('.github/workflows/verify.yml')

    expect(workflow).toMatch(/^\s*push:/m)
    expect(workflow).toMatch(/^\s*pull_request:/m)
    expect(workflow).not.toContain('CLOUDFLARE_API_TOKEN')
    expect(workflow).not.toContain('pages deploy')
    expect(workflow).toContain('pnpm verify:all')
  })

  it('当前操作文档不再提供本地生产发布命令', () => {
    for (const file of ['AGENTS.md', 'CLAUDE.md']) {
      expect(read(file), file).not.toContain('--branch main')
    }
  })

  it('Pages 准备脚本只准备产物且发现旧 Worker 域名立即失败', () => {
    const prepare = read('scripts/prepare-pages-deploy.mjs')

    expect(prepare).toContain('throw new Error(`生产产物仍包含公开 Worker 地址：${file}`)')
    expect(prepare).not.toContain('replaceAll(')
    expect(prepare).not.toContain("'pages', 'deploy'")
    expect(prepare).not.toContain("'--branch', 'main'")
    expect(prepare).not.toContain("'--commit-dirty=true'")
  })
})
