import { defineConfig, devices } from '@playwright/test';

const websitePort = process.env.PLAYWRIGHT_WEBSITE_PORT ?? '4173';
const websiteUrl = `http://127.0.0.1:${websitePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: `npm run build:website && npm exec vite -- preview --config vite.website.config.ts --host 127.0.0.1 --port ${websitePort}`,
    url: websiteUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: websiteUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
