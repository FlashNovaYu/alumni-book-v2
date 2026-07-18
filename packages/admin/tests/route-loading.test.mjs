import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createServer } from 'vite'

test('RouteLoadingSkeleton 可执行渲染并暴露无障碍加载状态', async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  try {
    const module = await server.ssrLoadModule('/src/components/RouteLoadingSkeleton.vue')
    const html = await renderToString(createSSRApp(module.default))
    assert.match(html, /role="status"/)
    assert.match(html, /页面加载中/)
    assert.match(html, /route-loading__card/)
  } finally {
    await server.close()
  }
})
