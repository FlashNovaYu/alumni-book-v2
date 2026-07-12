import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function validateProductionDeploy(context) {
  const errors = []
  if (context.githubActions !== 'true') errors.push('生产发布只能在 GitHub Actions 中运行')
  if (context.eventName !== 'workflow_dispatch') errors.push('生产发布必须由 workflow_dispatch 手动触发')
  if (context.ref !== 'refs/heads/main') errors.push('生产发布只能使用 main 分支')
  if (context.confirmation !== 'DEPLOY_PRODUCTION') errors.push('生产发布确认词不正确')
  if (!/^[0-9a-f]{40}$/i.test(context.sha || '')) errors.push('GITHUB_SHA 不是完整提交 SHA')
  if (context.sha !== context.head) errors.push('工作流 SHA 与检出的 HEAD 不一致')
  if (context.dirty) errors.push('工作树不干净，拒绝生产发布')
  if (errors.length > 0) throw new Error(errors.join('\n'))
}
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sha = process.env.GITHUB_SHA || ''
  validateProductionDeploy({
    githubActions: process.env.GITHUB_ACTIONS,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha,
    head: git('rev-parse', 'HEAD'),
    confirmation: process.env.DEPLOY_CONFIRMATION,
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  })
  console.log(`生产发布上下文验证通过：${sha}`)
}
