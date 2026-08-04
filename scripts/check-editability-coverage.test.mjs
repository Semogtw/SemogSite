import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEditabilityCoverage } from "./check-editability-coverage.mjs";

const directories = [];

async function fixture(catalog) {
  const root = await mkdtemp(join(tmpdir(), "semogtw-editability-"));
  directories.push(root);
  await mkdir(join(root, "packages/application/src/attention"), { recursive: true });
  await mkdir(join(root, "apps/web/src/server"), { recursive: true });
  await mkdir(join(root, "apps/web/src/routes"), { recursive: true });
  await writeFile(
    join(root, "packages/application/src/editability-catalog.json"),
    JSON.stringify(catalog),
  );
  await writeFile(
    join(root, "packages/application/src/attention/transition.ts"),
    'export const id = "attention.transition";',
  );
  await writeFile(
    join(root, "apps/web/src/server/attention.ts"),
    "createSqliteDevOSCommandGateway();",
  );
  await writeFile(join(root, "apps/web/src/routes/devos.today.tsx"), "export {};");
  return root;
}

const validCatalog = {
  commands: [
    {
      commandId: "attention.transition",
      commandVersion: 1,
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
  manifests: [
    {
      featureId: "attention-lifecycle",
      commands: ["attention.transition"],
      uiRoutes: ["/devos/today"],
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
      forbiddenMarkers: ["AttentionLifecycleService"],
    },
  ],
};

try {
  const validRoot = await fixture(validCatalog);
  assert.deepEqual(await checkEditabilityCoverage(validRoot), []);

  const invalidRoot = await fixture({
    commands: [
      ...validCatalog.commands,
      {
        ...validCatalog.commands[0],
        commandId: "roadmap.stages.complete",
        riskFloor: "high",
        confirmation: "confirm_in_client",
        sourceFile: "packages/application/src/attention/transition.ts",
      },
    ],
    manifests: [
      {
        ...validCatalog.manifests[0],
        uiRouteFiles: ["apps/web/src/routes/missing.tsx"],
        riskSummary: { "attention.transition": "low" },
      },
    ],
    adapters: [
      {
        ...validCatalog.adapters[0],
        requiredMarkers: ["missingGatewayMarker"],
      },
    ],
  });
  const codes = (await checkEditabilityCoverage(invalidRoot)).map(
    (violation) => violation.code,
  );
  assert.ok(codes.includes("UI_ROUTE_MISSING"));
  assert.ok(codes.includes("RISK_SUMMARY_MISMATCH"));
  assert.ok(codes.includes("COMMAND_WITHOUT_MANIFEST"));
  assert.ok(codes.includes("CRITICAL_WITHOUT_APPROVAL_PATH"));
  assert.ok(codes.includes("MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE"));

  console.log("Editability coverage guardrail fixtures passed.");
} finally {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
