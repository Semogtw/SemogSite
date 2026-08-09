import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanCloudflareWorkerBoundary } from "./check-cloudflare-worker-boundary.mjs";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function createFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-cloudflare-boundary-"));
  const files = {
    "apps/api/src/worker.ts":
      'import { createD1ApiApp } from "./composition/d1";\nexport default { fetch: (request, env) => createD1ApiApp(env).fetch(request, env) };\n',
    "apps/api/src/composition/d1.ts": [
      'import { createD1Database } from "@semogtw/database/d1";',
      'import { D1AuthSessionStore } from "@semogtw/database/d1-auth-sessions";',
      'import { D1AttentionCaptureRepository } from "@semogtw/database/d1-attention-capture";',
      'import { D1AttentionLifecycleRepository } from "@semogtw/database/d1-attention-lifecycle";',
      'import { D1EvidenceWriteRepository } from "@semogtw/database/d1-evidence-write";',
      'import { D1SessionHandoffRepository } from "@semogtw/database/d1-session-handoff";',
      'import { D1StageCompletionRepository } from "@semogtw/database/d1-stage-completion";',
      'import { D1RepositoryTargetLifecycleRepository } from "@semogtw/database/d1-repository-target-lifecycle";',
      'import { D1LoginRateLimiter } from "@semogtw/database/d1-login-rate-limiter";',
      'import { D1RoadmapDataSource } from "@semogtw/database/d1-roadmap";',
      'import { D1TodayDataSource } from "@semogtw/database/d1-today";',
      'import { D1OverviewDataSource } from "@semogtw/database/d1-overview";',
      'import { D1PublicProjectSource } from "@semogtw/database/d1-public-projects";',
      "export const createD1ApiApp = () => ({ fetch: () => new Response() });",
    ].join("\n"),
    "apps/api/wrangler.jsonc": JSON.stringify(
      {
        name: "semogtw-api",
        main: "src/worker.ts",
        d1_databases: [
          {
            binding: "DB",
            database_name: "semogsite-development",
            database_id: "d40eebf8-8f66-4856-bcee-6d300916fd9b",
            migrations_dir: "../../packages/database/migrations",
          },
        ],
      },
      null,
      2,
    ),
    "packages/database/package.json": JSON.stringify(
      {
        exports: {
          "./d1": "./src/adapters/d1.ts",
          "./d1-auth-sessions": "./src/repositories/d1-auth-session-store.ts",
          "./d1-attention-capture":
            "./src/repositories/d1-attention-capture-repository.ts",
          "./d1-attention-lifecycle":
            "./src/repositories/d1-attention-lifecycle-repository.ts",
          "./d1-evidence-write":
            "./src/repositories/d1-evidence-write-repository.ts",
          "./d1-session-handoff":
            "./src/repositories/d1-session-handoff-repository.ts",
          "./d1-stage-completion":
            "./src/repositories/d1-stage-completion-repository.ts",
          "./d1-repository-target-lifecycle":
            "./src/repositories/d1-repository-target-lifecycle-repository.ts",
          "./d1-login-rate-limiter":
            "./src/repositories/d1-login-rate-limiter.ts",
          "./d1-roadmap": "./src/repositories/d1-roadmap-data-source.ts",
          "./d1-today": "./src/repositories/d1-today-data-source.ts",
          "./d1-overview": "./src/repositories/d1-overview-data-source.ts",
          "./d1-public-projects":
            "./src/repositories/d1-public-project-source.ts",
        },
      },
      null,
      2,
    ),
    "packages/database/src/adapters/d1.ts": "export const createD1Database = () => null;\n",
    "packages/database/src/repositories/d1-auth-session-store.ts":
      "export class D1AuthSessionStore {}\n",
    "packages/database/src/repositories/d1-attention-capture-repository.ts":
      "export class D1AttentionCaptureRepository {}\n",
    "packages/database/src/repositories/d1-attention-lifecycle-repository.ts":
      "export class D1AttentionLifecycleRepository {}\n",
    "packages/database/src/repositories/d1-evidence-write-repository.ts":
      "export class D1EvidenceWriteRepository {}\n",
    "packages/database/src/repositories/d1-session-handoff-repository.ts":
      "export class D1SessionHandoffRepository {}\n",
    "packages/database/src/repositories/d1-stage-completion-repository.ts":
      "export class D1StageCompletionRepository {}\n",
    "packages/database/src/repositories/d1-repository-target-lifecycle-repository.ts":
      "export class D1RepositoryTargetLifecycleRepository {}\n",
    "packages/database/src/repositories/d1-login-rate-limiter.ts":
      "export class D1LoginRateLimiter {}\n",
    "packages/database/src/repositories/d1-roadmap-data-source.ts":
      "export class D1RoadmapDataSource {}\n",
    "packages/database/src/repositories/d1-today-data-source.ts":
      "export class D1TodayDataSource {}\n",
    "packages/database/src/repositories/d1-overview-data-source.ts":
      "export class D1OverviewDataSource {}\n",
    "packages/database/src/repositories/d1-public-project-source.ts":
      "export class D1PublicProjectSource {}\n",
    "packages/database/migrations/0001_foundation.sql":
      "CREATE TABLE projects (id TEXT PRIMARY KEY);\n",
    "packages/database/migrations/0002_seed.sql":
      "INSERT INTO projects (id) VALUES ('demo');\n",
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

function scan(overrides = {}) {
  const root = createFixture(overrides);
  try {
    return scanCloudflareWorkerBoundary(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(scan(), []);

assert.equal(
  scan({
    "apps/api/src/composition/d1.ts":
      'import { createSqliteDatabase } from "@semogtw/database";\nvoid createSqliteDatabase;\n',
  }).some(
    (violation) =>
      violation.code === "CLOUDFLARE_WORKER_FORBIDDEN_IMPORT" &&
      violation.detail === "@semogtw/database",
  ),
  true,
);

assert.equal(
  scan({
    "apps/api/src/worker.ts":
      'import { readFile } from "node:fs";\nvoid readFile;\n',
  }).some(
    (violation) =>
      violation.code === "CLOUDFLARE_WORKER_FORBIDDEN_IMPORT" &&
      violation.detail === "node:fs",
  ),
  true,
);

const requiredExports = {
  "./d1": "./src/adapters/d1.ts",
  "./d1-auth-sessions": "./src/repositories/d1-auth-session-store.ts",
  "./d1-attention-capture":
    "./src/repositories/d1-attention-capture-repository.ts",
  "./d1-attention-lifecycle":
    "./src/repositories/d1-attention-lifecycle-repository.ts",
  "./d1-evidence-write":
    "./src/repositories/d1-evidence-write-repository.ts",
  "./d1-session-handoff":
    "./src/repositories/d1-session-handoff-repository.ts",
  "./d1-stage-completion":
    "./src/repositories/d1-stage-completion-repository.ts",
  "./d1-repository-target-lifecycle":
    "./src/repositories/d1-repository-target-lifecycle-repository.ts",
  "./d1-login-rate-limiter":
    "./src/repositories/d1-login-rate-limiter.ts",
  "./d1-roadmap": "./src/repositories/d1-roadmap-data-source.ts",
  "./d1-today": "./src/repositories/d1-today-data-source.ts",
  "./d1-overview": "./src/repositories/d1-overview-data-source.ts",
  "./d1-public-projects": "./src/repositories/d1-public-project-source.ts",
};

for (const missing of [
  "./d1-attention-capture",
  "./d1-attention-lifecycle",
  "./d1-evidence-write",
  "./d1-session-handoff",
  "./d1-stage-completion",
  "./d1-repository-target-lifecycle",
]) {
  const exportsWithoutOne = { ...requiredExports };
  delete exportsWithoutOne[missing];
  assert.equal(
    scan({
      "packages/database/package.json": JSON.stringify({
        exports: exportsWithoutOne,
      }),
    }).some(
      (violation) =>
        violation.code === "CLOUDFLARE_DATABASE_EXPORT_INVALID" &&
        violation.detail?.startsWith(`${missing} ->`),
    ),
    true,
  );
}

assert.equal(
  scan({
    "apps/api/wrangler.jsonc": JSON.stringify({
      main: "src/node.ts",
      d1_databases: [],
    }),
  }).some((violation) => violation.code === "CLOUDFLARE_D1_BINDING_MISSING"),
  true,
);

assert.equal(
  scan({
    "packages/database/migrations/0003_gap.sql": "SELECT 1;\n",
    "packages/database/migrations/0002_seed.sql": "",
  }).some(
    (violation) =>
      violation.code === "CLOUDFLARE_D1_MIGRATION_SEQUENCE_INVALID",
  ),
  false,
  "an empty but sequential migration remains structurally valid",
);

assert.equal(
  scan({
    "packages/database/migrations/0002_seed.sql": "",
    "packages/database/migrations/0004_gap.sql": "SELECT 1;\n",
  }).some(
    (violation) =>
      violation.code === "CLOUDFLARE_D1_MIGRATION_SEQUENCE_INVALID",
  ),
  true,
);

console.log("Cloudflare Worker boundary passed.");
