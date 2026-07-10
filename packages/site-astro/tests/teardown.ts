// packages/site-astro/tests/teardown.ts
// CCSwitch: Playwright 全局退出钩子，用本机命令释放 Astro preview 端口，避免 npx 临时下载导致 CI 或 Windows 悬挂。

import { execFileSync } from 'child_process'

export default async function globalTeardown() {
  if (process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1') return

  console.log('[Playwright Teardown] 正在释放 4321 端口...')
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        "Get-NetTCPConnection -LocalPort 4321 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
      ], { encoding: 'utf-8', timeout: 5000 })
      if (output.trim()) console.log(output.trim())
    } else {
      execFileSync('sh', ['-c', "lsof -ti tcp:4321 | xargs -r kill -9"], { stdio: 'ignore', timeout: 5000 })
    }
    console.log('[Playwright Teardown] 4321 端口已成功释放，所有后台预览服务已被安全终结。')
  } catch (e) {
    console.warn('[Playwright Teardown] 端口释放命令未完成，Playwright 将继续退出。')
  }
}
