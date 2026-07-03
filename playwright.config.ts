import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack e2e against the production build: `npm run build` first, then the
 * webServer below boots the single Fastify process (app + API on :3000).
 * Tests run against LIVE wiki data via the server cache, so assertions are
 * written to be robust to price movement (counts/structure, not exact values).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
