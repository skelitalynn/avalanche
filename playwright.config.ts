import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    launchOptions: {
      env: {
        ...process.env,
        DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
      },
      args: ["--disable-gpu"],
    },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
  reporter: [["list"]],
});
