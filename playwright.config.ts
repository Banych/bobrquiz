import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load test env from .env.local (where the docs put it), then .env; the first file wins and
// variables already set in the shell win over both
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

/**
 * Playwright configuration for E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry once in dev, twice in CI for flaky tests
  failOnFlakyTests: true, // A pass on retry still exits 1: a flake needs its own cause
  // Parallel execution in dev, sequential in CI for auth stability
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000, // 60 seconds per test
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000, // 15 seconds per action
  },

  projects: [
    // Setup project - runs first to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Deletes fixture quizzes left by crashed runs (older than 30 minutes)
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/,
      dependencies: ['setup'],
    },
    // Authenticated tests - use saved auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['cleanup'],
    },
  ],

  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120000, // 2 minutes for server to start
  },
});
