import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'

const rawSiteBase = process.env.SITE_BASE ?? '/'
const siteBase = rawSiteBase.endsWith('/') ? rawSiteBase : `${rawSiteBase}/`

export default defineConfig({
  base: siteBase,
  integrations: [vue()],
  vite: {
    define: {
      // 客户端运行时 API 地址（空字符串走同域代理，`` ?? `` 保本地开发回退 Worker）
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        process.env.VITE_API_BASE_URL ?? 'https://alumni-book-api.chenyuhao2263.workers.dev'
      ),
      // SSG 构建时 API 地址（始终走 Worker 域名）
      'import.meta.env.VITE_WORKER_URL': JSON.stringify(
        process.env.VITE_WORKER_URL ?? 'https://alumni-book-api.chenyuhao2263.workers.dev'
      ),
    },
  },
  build: {
    assets: 'assets',
  },
})
