import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // SPEC-V3 §V3-7: v1 specs whose surfaces are retired (map canvas, camera,
  // marquee, control groups, idle fleet) are quarantined, not deleted.
  testIgnore: ['**/retired-v1/**'],
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5199,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
