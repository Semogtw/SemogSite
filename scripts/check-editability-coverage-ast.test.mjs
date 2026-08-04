import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEditabilityCoverage } from "./check-editability-coverage.mjs";

const directories = [];

async function createFixture(extraFiles = {}) {
  const root = await mkdtemp(join(tmpdir(), "semogtw-editability-ast-"));
  directories.push(root);
  await mkdir(join(root, "packages/application/src/attention"), { recursive: true });
  await mkdir(join(root, "apps/web/src/server"), { recursive: true });
  await mkdir(join(root, "apps/web/src/routes"), { recursive: true });

  await writeFile(
    join(root, "packages/application/src/editability-catalog.json"),
    JSON.stringify({
      commands: [
        {
          commandId: "attention.transition",
          commandVersion: 1,
          labelPtBr: "Finalizar item",
          capability: "attention.write",
          resourceType: "attention_item",
          riskFloor: "medium",
          confirmation: "confirm_in_client",
          conflictStrategy: "expected_timestamp",
          idempotencyStrategy: "required_receipt",
          undoStrategy: "compensating_command",
          auditStrategy: "state_and_receipt",
          execution: "enabled",
          sourceFile: "packages/application/src/attention/transition.ts",
        },
      ],
      legacyCoverageIds: [],
      manifests: [
        {
          featureId: "attention-lifecycle",
          commands: ["attention.transition"],
          uiRouteFiles: ["apps/web/src/routes/devos.today.tsx"],
          mcpExposure: "not_yet",
          riskSummary: { "attention.transition": "medium" },
          conflictStrategy: "expected_timestamp",
          auditEvents: ["attention.resolve"],
          implementationState: "partial",
        },
      ],
      adapters: [
        {
          commandId: "attention.transition",
          path: "apps/web/src/server/attention.ts",
          state: "gateway",
          requiredMarkers: ["createSqliteDevOSCommandGateway"],
          forbiddenMarkers: [],
        },
      ],
      mutationSurfaces: [
        {
          path: "apps/web/src/server/attention.ts",
          state: "gateway",
          coverageRefs: ["attention.transition"],
        },
      ],
    }),
  );
  await writeFile(
    join(root, "packages/application/src/attention/transition.ts"),
    'export const id = "attention.transition";',
  );
  await writeFile(
    join(root, "apps/web/src/server/attention.ts"),
    'createServerFn({ middleware: { owner: true }, method: "POST" });\ncreateSqliteDevOSCommandGateway();',
  );
  await writeFile(join(root, "apps/web/src/routes/devos.today.tsx"), "export {};");
  for (const [path, source] of Object.entries(extraFiles)) {
    await writeFile(join(root, "apps/web/src/server", path), source);
  }
  return root;
}

try {
  assert.deepEqual(await checkEditabilityCoverage(await createFixture()), []);

  const untracked = await createFixture({
    "untracked.ts":
      'createServerFn({ middleware: { owner: true }, method: "POST" });',
  });
  assert.ok(
    (await checkEditabilityCoverage(untracked)).some(
      (item) =>
        item.code === "MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE" &&
        item.path === "apps/web/src/server/untracked.ts",
    ),
  );

  const dynamic = await createFixture({
    "dynamic.ts":
      'const options = { method: "POST" };\ncreateServerFn(options);',
  });
  assert.ok(
    (await checkEditabilityCoverage(dynamic)).some(
      (item) =>
        item.code === "SERVER_FUNCTION_METHOD_NOT_STATIC" &&
        item.path === "apps/web/src/server/dynamic.ts",
    ),
  );

  console.log("Editability AST guardrail fixtures passed.");
} finally {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
