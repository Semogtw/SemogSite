import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEditabilityCoverage } from "./check-editability-coverage.mjs";

const directories = [];

async function fixture(catalog, extraServerFiles = {}) {
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
    'createServerFn({ method: "POST" });\ncreateSqliteDevOSCommandGateway();',
  );
  for (const [path, source] of Object.entries(extraServerFiles)) {
    await writeFile(join(root, "apps/web/src/server", path), source);
  }
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
  legacyCoverageIds: [],
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
  mutationSurfaces: [
    {
      path: "apps/web/src/server/attention.ts",
      state: "gateway",
      coverageRefs: ["attention.transition"],
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
    legacyCoverageIds: [],
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
    mutationSurfaces: validCatalog.mutationSurfaces,
  });
  const codes = (await checkEditabilityCoverage(invalidRoot)).map(
    (violation) => violation.code,
  );
  assert.ok(codes.includes("UI_ROUTE_MISSING"));
  assert.ok(codes.includes("RISK_SUMMARY_MISMATCH"));
  assert.ok(codes.includes("COMMAND_WITHOUT_MANIFEST"));
  assert.ok(codes.includes("CRITICAL_WITHOUT_APPROVAL_PATH"));
  assert.ok(codes.includes("MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE"));

  const untrackedRoot = await fixture(validCatalog, {
    "untracked.ts": 'createServerFn({ method: "POST" });',
  });
  assert.ok(
    (await checkEditabilityCoverage(untrackedRoot)).some(
      (item) =>
        item.code === "MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE" &&
        item.path === "apps/web/src/server/untracked.ts",
    ),
  );

  const excludedCatalog = {
    ...validCatalog,
    mutationSurfaces: [
      ...validCatalog.mutationSurfaces,
      {
        path: "apps/web/src/server/auth.ts",
        state: "excluded_noncanonical",
        reason: "authentication_infrastructure",
      },
    ],
  };
  const excludedRoot = await fixture(excludedCatalog, {
    "auth.ts": 'createServerFn({ method: "POST" });',
  });
  assert.deepEqual(await checkEditabilityCoverage(excludedRoot), []);

  const invalidExclusionRoot = await fixture(
    {
      ...excludedCatalog,
      mutationSurfaces: excludedCatalog.mutationSurfaces.map((surface) =>
        surface.path.endsWith("auth.ts")
          ? { ...surface, reason: "convenient_bypass" }
          : surface,
      ),
    },
    { "auth.ts": 'createServerFn({ method: "POST" });' },
  );
  assert.ok(
    (await checkEditabilityCoverage(invalidExclusionRoot)).some(
      (item) => item.code === "MUTATION_SURFACE_EXCLUSION_INVALID",
    ),
  );

  const legacyCatalog = {
    ...validCatalog,
    legacyCoverageIds: ["legacy.example"],
    mutationSurfaces: [
      ...validCatalog.mutationSurfaces,
      {
        path: "apps/web/src/server/legacy.ts",
        state: "legacy_registered",
        coverageRefs: ["legacy.example"],
      },
    ],
  };
  const legacyRoot = await fixture(legacyCatalog, {
    "legacy.ts": 'createServerFn({ method: "POST" });',
  });
  assert.deepEqual(await checkEditabilityCoverage(legacyRoot), []);

  const unknownReferenceRoot = await fixture(
    {
      ...legacyCatalog,
      mutationSurfaces: legacyCatalog.mutationSurfaces.map((surface) =>
        surface.path.endsWith("legacy.ts")
          ? { ...surface, coverageRefs: ["legacy.typo"] }
          : surface,
      ),
    },
    { "legacy.ts": 'createServerFn({ method: "POST" });' },
  );
  assert.ok(
    (await checkEditabilityCoverage(unknownReferenceRoot)).some(
      (item) => item.code === "UNKNOWN_LEGACY_COVERAGE_REFERENCE",
    ),
  );

  const unusedCoverageRoot = await fixture({
    ...validCatalog,
    legacyCoverageIds: ["legacy.unused"],
  });
  assert.ok(
    (await checkEditabilityCoverage(unusedCoverageRoot)).some(
      (item) => item.code === "LEGACY_COVERAGE_WITHOUT_SURFACE",
    ),
  );

  const staleCatalogRoot = await fixture(
    {
      ...legacyCatalog,
      mutationSurfaces: [
        ...validCatalog.mutationSurfaces,
        {
          path: "apps/web/src/server/stale.ts",
          state: "legacy_registered",
          coverageRefs: ["legacy.example"],
        },
      ],
    },
    { "stale.ts": "export {};" },
  );
  assert.ok(
    (await checkEditabilityCoverage(staleCatalogRoot)).some(
      (item) => item.code === "MUTATION_SURFACE_NOT_POST",
    ),
  );

  console.log("Editability coverage guardrail fixtures passed.");
} finally {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
