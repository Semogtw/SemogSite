import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const databasePath = resolve("data/semogtw-e2e.sqlite");
const sessionSecret =
  "semogtw-e2e-session-secret-at-least-thirty-two-characters";
const ownerPasswordHash =
  "pbkdf2-sha256$310000$c2Vtb2d0dy1lMmUtc2FsdA$TKYbDFcqHLlEr85f3DoXqjpIY0ZL3B8Cmpbb4jomd7w";

const sharedRuntimeEnv = {
  ...process.env,
  NODE_ENV: "test",
  SEMOGTW_DATABASE_URL: databasePath,
  SEMOGTW_SESSION_SECRET: sessionSecret,
  SEMOGTW_OWNER_PASSWORD_HASH: ownerPasswordHash,
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @semogtw/api dev",
      url: "http://127.0.0.1:4174/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...sharedRuntimeEnv,
        SEMOGTW_API_PORT: "4174",
      },
    },
    {
      command: "pnpm --filter @semogtw/web start",
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...sharedRuntimeEnv,
        HOST: "127.0.0.1",
        PORT: "4173",
        SEMOGTW_E2E_API_PROXY_ORIGIN: "http://127.0.0.1:4174",
      },
    },
  ],
});
