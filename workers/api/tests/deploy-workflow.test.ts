import { describe, expect, it } from 'vitest'
import workerWorkflow from '../../../.github/workflows/deploy-worker.yml?raw'
import productionWorkflow from '../../../.github/workflows/deploy-production.yml?raw'

describe('迁移发布门禁', () => {
  it.each([
    ['deploy-worker.yml', workerWorkflow],
    ['deploy-production.yml', productionWorkflow],
  ])('fail-closed：%s 不允许迁移失败后继续部署', (_name, source) => {
    expect(source).toContain('wrangler d1 migrations apply alumni-book-db')
    expect(source).not.toContain('continue-on-error: true')
  })
})
