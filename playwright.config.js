const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});