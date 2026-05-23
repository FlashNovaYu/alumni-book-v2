import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'

export default defineConfig({
  base: '/',
  integrations: [vue()],
  vite: {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        process.env.VITE_API_BASE_URL || 'https://alumni-book-api.chenyuhao2263.workers.dev'
      ),
    },
  },
  build: {
    assets: 'assets',
  },
})
