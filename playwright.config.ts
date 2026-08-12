import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3000;
const API_PORT = 8787;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w @tfw/api',
      url: `http://127.0.0.1:${API_PORT}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        DATABASE_URL:
          process.env.DATABASE_URL ||
          'postgresql://tfw:tfw_ci_test@localhost:5433/tfw?schema=public',
        WEB_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
        RETURN_VERIFY_TOKEN_ON_MAIL_FAIL: '1',
        VALIDATE_PVP: '1',
        STRICT_PVP: '1',
      },
    },
    {
      command: 'npm run start -w @tfw/web',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}/v1`,
      },
    },
  ],
});
