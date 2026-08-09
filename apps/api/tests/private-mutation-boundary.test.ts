import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const sourceRoot = join(apiRoot, "src");

const mutationRoutes = [
  "routes/private/attention.ts",
  "routes/private/attention-lifecycle.ts",
  "routes/private/evidence.ts",
  "routes/private/session-handoffs.ts",
  "routes/private/stages.ts",
  "routes/private/repository-targets.ts",
  "routes/private/repository-target-registration.ts",
  "routes/private/branch-recommendations.ts",
  "routes/private/cooperative-runs.ts",
  "routes/private/cooperative-run-transitions.ts",
  "routes/private/verification-obligations.ts",
  "routes/private/scope-reservations.ts",
  "routes/private/editorial-redirects.ts",
] as const;

const forbiddenRuntimeImports = [
  'from "node:',
  "from 'node:",
  'from "better-sqlite3"',
  "from 'better-sqlite3'",
  'from "@semogtw/database"',
  "from '@semogtw/database'",
  "@hono/node-server",
] as const;

describe("private mutation Worker boundary", () => {
  it.each(mutationRoutes)("keeps %s runtime-neutral and bounded", (relativePath) => {
    const absolutePath = join(sourceRoot, relativePath);
    expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
    const content = readFileSync(absolutePath, "utf8");

    for (const forbidden of forbiddenRuntimeImports) {
      expect(content, `${relativePath} must not contain ${forbidden}`).not.toContain(
        forbidden,
      );
    }

    expect(content, `${relativePath} must bound mutation request bodies`).toContain(
      "bodyLimit",
    );
    expect(content, `${relativePath} must force private no-store caching`).toContain(
      '"cache-control", "no-store, private"',
    );
  });

  it("keeps all private routes behind shared origin, owner-auth and CSRF middleware", () => {
    const appPath = join(sourceRoot, "app.ts");
    const content = readFileSync(appPath, "utf8");

    const originIndex = content.indexOf(
      'api.use("/api/v1/private/*", requireSameBrowserOrigin)',
    );
    const authIndex = content.indexOf(
      'api.use(\n    "/api/v1/private/*",\n    createPrivateAuthMiddleware',
    );
    const csrfIndex = content.indexOf(
      'api.use(\n    "/api/v1/private/*",\n    createPrivateCsrfMiddleware',
    );
    const firstPrivateRouteIndex = content.indexOf(
      'api.route(\n    "/api/v1/private/',
    );

    expect(originIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeGreaterThan(originIndex);
    expect(csrfIndex).toBeGreaterThan(authIndex);
    expect(firstPrivateRouteIndex).toBeGreaterThan(csrfIndex);
  });

  it.each(mutationRoutes)("mounts the route module from app.ts: %s", (relativePath) => {
    const app = readFileSync(join(sourceRoot, "app.ts"), "utf8");
    const moduleName = relativePath
      .replace(/^routes\//u, "./routes/")
      .replace(/\.ts$/u, "");
    expect(app).toContain(`from "${moduleName}"`);
  });
});
