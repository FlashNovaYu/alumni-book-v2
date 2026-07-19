import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', 'src/runtime/node-runtime.test.ts'],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        d1Databases: ['DB'],
        r2Buckets: ['R2'],
        bindings: {
          JWT_SECRET: 'alumni-book-test-secret',
          CORS_ORIGIN: 'http://localhost:4321',
        },
      },
    }),
  ],
})
