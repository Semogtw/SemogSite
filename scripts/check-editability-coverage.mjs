import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const postServerFnPattern =
  /createServerFn\s*\(\s*\{[^}]{0,500}\bmethod\s*:\s*["']POST["'][^}]*\}\s*\)/u;
const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const mutationSurfaceStates = new Set([
  "gateway",
  "legacy_registered",
  "excluded_noncanonical",
]);
const allowedExclusionReasons = new Set([
  "authentication_infrastructure",
  "bounded_evaluation",
  "read_preparation",
]);

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function violation(code, details = {}) {
  return { code, ...details };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function repositoryPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

export async function checkEditabilityCoverage(root = process.cwd()) {
  const catalogPath = resolve(
    root,
    "packages/application/src/editability-catalog.json",
  );
  const source = await readText(catalogPath);
  if (source === null) {
    return [
      violation("EDITABILITY_CATALOG_MISSING", {
        path: "packages/application/src/editability-catalog.json",
      }),
    ];
  }

  let catalog;
  try {
    catalog = JSON.parse(source);
  } catch {
    return [
      violation("EDITABILITY_CATALOG_INVALID", {
        path: "packages/application/src/editability-catalog.json",
      }),
    ];
  }

  const commands = Array.isArray(catalog.commands) ? catalog.commands : [];
  const legacyCoverageIds = Array.isArray(catalog.legacyCoverageIds)
    ? catalog.legacyCoverageIds
    : [];
  const manifests = Array.isArray(catalog.manifests) ? catalog.manifests : [];
  const adapters = Array.isArray(catalog.adapters) ? catalog.adapters : [];
  const mutationSurfaces = Array.isArray(catalog.mutationSurfaces)
    ? catalog.mutationSurfaces
    : [];
  const violations = [];
  const commandsById = new Map();

  for (const command of commands) {
    if (typeof command?.commandId !== "string") continue;
    if (commandsById.has(command.commandId)) {
      violations.push(
        violation("DUPLICATE_COMMAND_ID", { commandId: command.commandId }),
      );
    }
    commandsById.set(command.commandId, command);

    const commandSource =
      typeof command.sourceFile === "string"
        ? await readText(resolve(root, command.sourceFile))
        : null;
    if (commandSource === null || !commandSource.includes(command.commandId)) {
      violations.push(
        violation("COMMAND_SOURCE_MISSING", {
          commandId: command.commandId,
          path: command.sourceFile ?? null,
        }),
      );
    }
    if (
      (command.riskFloor === "high" || command.riskFloor === "critical") &&
      command.confirmation !== "prepare_approval" &&
      command.confirmation !== "approve_in_devos"
    ) {
      violations.push(
        violation("CRITICAL_WITHOUT_APPROVAL_PATH", {
          commandId: command.commandId,
        }),
      );
    }
  }

  const legacyCoverageSet = new Set();
  for (const commandId of legacyCoverageIds) {
    if (typeof commandId !== "string" || !commandIdPattern.test(commandId)) {
      violations.push(
        violation("LEGACY_COVERAGE_ID_INVALID", {
          commandId: typeof commandId === "string" ? commandId : null,
        }),
      );
      continue;
    }
    if (legacyCoverageSet.has(commandId)) {
      violations.push(
        violation("DUPLICATE_LEGACY_COVERAGE_ID", { commandId }),
      );
    }
    if (commandsById.has(commandId)) {
      violations.push(
        violation("LEGACY_COVERAGE_COLLIDES_WITH_COMMAND", { commandId }),
      );
    }
    legacyCoverageSet.add(commandId);
  }

  const featureIds = new Set();
  const coveredCommands = new Set();
  for (const manifest of manifests) {
    if (typeof manifest?.featureId !== "string") continue;
    if (featureIds.has(manifest.featureId)) {
      violations.push(
        violation("DUPLICATE_FEATURE_ID", { featureId: manifest.featureId }),
      );
    }
    featureIds.add(manifest.featureId);

    const routeFiles = Array.isArray(manifest.uiRouteFiles)
      ? manifest.uiRouteFiles
      : [];
    if (routeFiles.length === 0) {
      violations.push(
        violation("UI_ROUTE_MISSING", { featureId: manifest.featureId }),
      );
    }
    for (const routeFile of routeFiles) {
      if (
        typeof routeFile !== "string" ||
        (await readText(resolve(root, routeFile))) === null
      ) {
        violations.push(
          violation("UI_ROUTE_MISSING", {
            featureId: manifest.featureId,
            path: routeFile ?? null,
          }),
        );
      }
    }
    if (manifest.conflictStrategy == null) {
      violations.push(
        violation("CONFLICT_STRATEGY_MISSING", {
          featureId: manifest.featureId,
        }),
      );
    }
    if (!Array.isArray(manifest.auditEvents) || manifest.auditEvents.length === 0) {
      violations.push(
        violation("AUDIT_EVENT_MISSING", { featureId: manifest.featureId }),
      );
    }
    if (
      manifest.implementationState === "complete" &&
      manifest.mcpExposure === "not_yet"
    ) {
      violations.push(
        violation("COMPLETE_FEATURE_WITH_NOT_YET_MCP_STRATEGY", {
          featureId: manifest.featureId,
        }),
      );
    }

    for (const commandId of Array.isArray(manifest.commands)
      ? manifest.commands
      : []) {
      coveredCommands.add(commandId);
      const command = commandsById.get(commandId);
      if (command === undefined) {
        violations.push(
          violation("UNKNOWN_COMMAND_ID", {
            featureId: manifest.featureId,
            commandId,
          }),
        );
        continue;
      }
      if (manifest.riskSummary?.[commandId] !== command.riskFloor) {
        violations.push(
          violation("RISK_SUMMARY_MISMATCH", {
            featureId: manifest.featureId,
            commandId,
          }),
        );
      }
    }
  }

  for (const commandId of commandsById.keys()) {
    if (!coveredCommands.has(commandId)) {
      violations.push(violation("COMMAND_WITHOUT_MANIFEST", { commandId }));
    }
  }

  const adapterPaths = new Map();
  for (const adapter of adapters) {
    if (typeof adapter?.path !== "string") continue;
    adapterPaths.set(adapter.path, adapter);
    const adapterSource = await readText(resolve(root, adapter.path));
    const commandKnown = commandsById.has(adapter.commandId);
    const commandCovered = coveredCommands.has(adapter.commandId);
    const requiredMarkers = Array.isArray(adapter.requiredMarkers)
      ? adapter.requiredMarkers
      : [];
    const forbiddenMarkers = Array.isArray(adapter.forbiddenMarkers)
      ? adapter.forbiddenMarkers
      : [];
    const invalid =
      adapterSource === null ||
      !commandKnown ||
      !commandCovered ||
      requiredMarkers.some(
        (marker) => typeof marker !== "string" || !adapterSource.includes(marker),
      ) ||
      forbiddenMarkers.some(
        (marker) => typeof marker === "string" && adapterSource.includes(marker),
      );
    if (invalid) {
      violations.push(
        violation("MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE", {
          commandId: adapter.commandId ?? null,
          path: adapter.path,
        }),
      );
    }
  }

  const mutationSurfacePaths = new Map();
  const usedLegacyCoverageIds = new Set();
  for (const surface of mutationSurfaces) {
    if (typeof surface?.path !== "string") continue;
    if (mutationSurfacePaths.has(surface.path)) {
      violations.push(
        violation("DUPLICATE_MUTATION_SURFACE", { path: surface.path }),
      );
      continue;
    }
    mutationSurfacePaths.set(surface.path, surface);

    const surfaceSource = await readText(resolve(root, surface.path));
    if (surfaceSource === null || !postServerFnPattern.test(surfaceSource)) {
      violations.push(
        violation("MUTATION_SURFACE_NOT_POST", { path: surface.path }),
      );
      continue;
    }
    if (!mutationSurfaceStates.has(surface.state)) {
      violations.push(
        violation("MUTATION_SURFACE_STATE_INVALID", {
          path: surface.path,
          state: surface.state ?? null,
        }),
      );
      continue;
    }

    if (surface.state === "gateway") {
      if (adapterPaths.get(surface.path)?.state !== "gateway") {
        violations.push(
          violation("MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE", {
            path: surface.path,
          }),
        );
      }
      continue;
    }

    if (surface.state === "legacy_registered") {
      const coverageRefs = Array.isArray(surface.coverageRefs)
        ? surface.coverageRefs
        : [];
      if (coverageRefs.length === 0) {
        violations.push(
          violation("MUTATION_SURFACE_COVERAGE_MISSING", {
            path: surface.path,
          }),
        );
        continue;
      }
      for (const reference of coverageRefs) {
        if (
          typeof reference !== "string" ||
          (!commandsById.has(reference) && !legacyCoverageSet.has(reference))
        ) {
          violations.push(
            violation("UNKNOWN_LEGACY_COVERAGE_REFERENCE", {
              path: surface.path,
              commandId: typeof reference === "string" ? reference : null,
            }),
          );
          continue;
        }
        if (legacyCoverageSet.has(reference)) {
          usedLegacyCoverageIds.add(reference);
        }
      }
      continue;
    }

    if (!allowedExclusionReasons.has(surface.reason)) {
      violations.push(
        violation("MUTATION_SURFACE_EXCLUSION_INVALID", {
          path: surface.path,
          reason: surface.reason ?? null,
        }),
      );
    }
  }

  for (const commandId of legacyCoverageSet) {
    if (!usedLegacyCoverageIds.has(commandId)) {
      violations.push(
        violation("LEGACY_COVERAGE_WITHOUT_SURFACE", { commandId }),
      );
    }
  }

  const serverDirectory = resolve(root, "apps/web/src/server");
  for (const path of await listFiles(serverDirectory)) {
    if (!/\.[cm]?[jt]s$/u.test(path) || /\.test\.[cm]?[jt]s$/u.test(path)) {
      continue;
    }
    const text = await readText(path);
    if (text === null || !postServerFnPattern.test(text)) continue;
    const relativePath = repositoryPath(root, path);
    if (!mutationSurfacePaths.has(relativePath)) {
      violations.push(
        violation("MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE", {
          path: relativePath,
        }),
      );
    }
  }

  return violations;
}

async function main() {
  const violations = await checkEditabilityCoverage();
  if (violations.length > 0) {
    for (const item of violations) console.error(JSON.stringify(item));
    process.exitCode = 1;
    return;
  }
  console.log("Editability coverage check passed.");
}

const direct =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (direct) await main();
