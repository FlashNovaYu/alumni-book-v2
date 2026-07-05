// packages/site-astro/tests/teardown.ts
// CCSwitch: Playwright 全局退出钩子，利用极速免装的 npx kill-port 强退 Astro 服务，彻底解决 Windows 下进程悬挂的顽疾。

import { execSync } from 'child_process'

export default async function globalTeardown() {
  console.log('[Playwright Teardown] 正在通过 kill-port 释放 4321 端口...')
  try {
    // 强制使用 npx kill-port，这在 Windows/Linux 上都极快且绝不悬挂
    execSync('npx --yes kill-port 4321', { stdio: 'ignore' })
    console.log('[Playwright Teardown] 4321 端口已成功释放，所有后台预览服务已被安全终结。')
  } catch (e) {
    // 忽略异常
  }
}
