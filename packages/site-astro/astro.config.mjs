import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'

const rawSiteBase = process.env.SITE_BASE ?? '/'
const siteBase = rawSiteBase.endsWith('/') ? rawSiteBase : `${rawSiteBase}/`

export default defineConfig({
  base: siteBase,
  integrations: [vue()],
  vite: {
    define: {
      // 客户端运行时 API 地址（空字符串走同域代理）
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        process.env.VITE_API_BASE_URL ?? ''
      ),
      // SSG 构建时 API 地址必须由目标环境显式提供
      'import.meta.env.VITE_SSG_API_BASE': JSON.stringify(
        process.env.VITE_SSG_API_BASE ?? ''
      ),
    },
    server: {
      proxy: {
        '/api': {
          target: process.env.VITE_SSG_API_BASE || 'http://127.0.0.1:8787',
          changeOrigin: true,
        }
      }
    }
  },
  build: {
    assets: 'assets',
  },
})
