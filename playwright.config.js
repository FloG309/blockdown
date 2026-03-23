const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4099',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node serve.js',
    port: 4099,
    reuseExistingServer: true,
    env: { PORT: '4099' },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
