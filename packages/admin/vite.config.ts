import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const siteBase = process.env.SITE_BASE ?? '/alumni-book-v2/'
const adminBase = siteBase === '/' ? '/admin/' : `${siteBase.replace(/\/$/, '')}/admin/`

export default defineConfig({
  base: adminBase,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
  },
})
