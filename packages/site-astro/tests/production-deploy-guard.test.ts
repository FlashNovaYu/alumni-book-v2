import { describe, expect, it } from 'vitest'
import { validateProductionDeploy } from '../../../scripts/production-deploy-guard.mjs'

const sha = 'a'.repeat(40)
const valid = {
  githubActions: 'true',
  eventName: 'workflow_dispatch',
  ref: 'refs/heads/main',
  sha,
  head: sha,
  confirmation: 'DEPLOY_PRODUCTION',
  dirty: false,
}

describe('生产发布上下文守卫', () => {
  it('接受 GitHub main 上经过明确确认的干净提交', () => {
    expect(() => validateProductionDeploy(valid)).not.toThrow()
  })

  it.each([
    ['非 GitHub Actions', { githubActions: 'false' }],
    ['非手动事件', { eventName: 'push' }],
    ['非 main 分支', { ref: 'refs/heads/master' }],
    ['提交 SHA 不一致', { head: 'b'.repeat(40) }],
    ['确认词错误', { confirmation: 'DEPLOY' }],
    ['工作树不干净', { dirty: true }],
  ])('拒绝%s', (_label, override) => {
    expect(() => validateProductionDeploy({ ...valid, ...override })).toThrow()
  })
})
