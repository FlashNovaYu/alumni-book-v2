import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'

export default defineConfig({
  base: '/',
  integrations: [vue()],
  vite: {
    define: {
      // 客户端运行时 API 地址（CI 中设为空走 Pages Function 代理，本地开发走 Worker）
      // 客户端运行时 API 地址（空字符串 = 同域相对路径）
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
