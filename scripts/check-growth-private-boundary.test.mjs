import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGrowthPrivateBoundary } from "./check-growth-private-boundary.mjs";

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "growth-boundary-"));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path);
    await mkdir(fullPath.slice(0, fullPath.lastIndexOf("/")), {
      recursive: true,
    });
    await writeFile(fullPath, content, "utf8");
  }
  return root;
}

async function run() {
  const allowed = await fixture({
    "apps/web/src/routes/devos.growth.tsx":
      'import type { GrowthOverviewRead } from "@semogtw/database/growth";\nexport const value = 1;\n',
    "apps/web/src/components/devos/growth-progress.tsx":
      'import { deriveGoalProgress } from "@semogtw/domain/growth";\nexport { deriveGoalProgress };\n',
    "packages/domain/src/growth/progress.ts":
      "export function deriveGoalProgress() { return null; }\n",
  });
  try {
    assert.deepEqual(await checkGrowthPrivateBoundary(allowed), []);
  } finally {
    await rm(allowed, { recursive: true, force: true });
  }

  const publicLeak = await fixture({
    "apps/web/src/routes/index.tsx":
      'import { SqliteGrowthReadModel } from "@semogtw/database/growth";\nexport const loader = SqliteGrowthReadModel;\n',
    "packages/contracts/src/public/growth.ts":
      'export type PublicGrowth = import("@semogtw/domain/growth").LearningGoalAggregate;\n',
  });
  try {
    const violations = await checkGrowthPrivateBoundary(publicLeak);
    assert.equal(violations.length, 2);
    assert.ok(
      violations.every(
        (violation) =>
          violation.code === "PUBLIC_SURFACE_IMPORTS_PRIVATE_GROWTH",
      ),
    );
  } finally {
    await rm(publicLeak, { recursive: true, force: true });
  }

  const setter = await fixture({
    "packages/mcp/src/growth-write-tools.ts":
      "export function setGoalProgress(progressPercent: number) { return progressPercent; }\n",
  });
  try {
    const violations = await checkGrowthPrivateBoundary(setter);
    assert.ok(
      violations.some(
        (violation) =>
          violation.code === "DIRECT_GROWTH_PROGRESS_SETTER_FORBIDDEN",
      ),
    );
  } finally {
    await rm(setter, { recursive: true, force: true });
  }

  console.log("Growth private boundary fixtures: OK");
}

await run();
