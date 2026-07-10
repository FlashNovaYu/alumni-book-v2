import { defineConfig, devices } from '@playwright/test';

const siteBase = process.env.SITE_BASE
  ? `/${process.env.SITE_BASE.replace(/^\/+|\/+$/g, '')}/`
  : '/';
const previewHost = '127.0.0.1';
const previewBaseURL = `http://${previewHost}:4321${siteBase}`;
const useManagedPreview = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  globalTeardown: require.resolve('./tests/teardown.ts'),
  expect: {
    timeout: 10000,
  },
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: previewBaseURL,
    trace: 'on-first-retry',
    contextOptions: {
      reducedMotion: 'no-preference',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useManagedPreview ? undefined : {
    command: `node ./node_modules/astro/astro.js preview --host ${previewHost}`,
    port: 4321,
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
    timeout: 120000,
  },
});
