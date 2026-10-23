import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npx tsx tests/browser-setup.ts && npm start",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "3101",
      HOST: "127.0.0.1",
      DB_PATH: "data/browser-tests/test.sqlite",
      BACKUP_DIR: "data/browser-tests/backups",
      TEST: "1",
    },
  },
  reporter: "list",
});
