import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const importSpecifierPattern =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/gu;
const forbiddenWorkerSpecifiers = new Set([
  "@hono/node-server",
  "@semogtw/database",
  "better-sqlite3",
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function importedSpecifiers(content) {
  return [...content.matchAll(importSpecifierPattern)].map(
    (match) => match[1],
  );
}

function addViolation(violations, code, path, message, detail = null) {
  violations.push({ code, path, message, detail });
}

function validateWorkerImports(root, violations) {
  const workerFiles = [
    join(root, "apps/api/src/worker.ts"),
    join(root, "apps/api/src/composition/d1.ts"),
  ];

  for (const absolutePath of workerFiles) {
    const path = relative(root, absolutePath).replaceAll("\\", "/");
    if (!existsSync(absolutePath)) {
      addViolation(
        violations,
        "CLOUDFLARE_WORKER_FILE_MISSING",
        path,
        "The Cloudflare Worker entry and D1 composition must be committed.",
      );
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    for (const specifier of importedSpecifiers(content)) {
      if (!specifier) continue;
      if (isBuiltin(specifier) || forbiddenWorkerSpecifiers.has(specifier)) {
        addViolation(
          violations,
          "CLOUDFLARE_WORKER_FORBIDDEN_IMPORT",
          path,
          "The Worker boundary must not import Node runtime or the SQLite-capable database barrel.",
          specifier,
        );
      }
    }
  }

  const compositionPath = join(root, "apps/api/src/composition/d1.ts");
  if (existsSync(compositionPath)) {
    const content = readFileSync(compositionPath, "utf8");
    for (const required of [
      "@semogtw/database/d1",
      "@semogtw/database/d1-auth-sessions",
      "@semogtw/database/d1-attention-capture",
      "@semogtw/database/d1-login-rate-limiter",
      "@semogtw/database/d1-roadmap",
      "@semogtw/database/d1-today",
      "@semogtw/database/d1-overview",
      "@semogtw/database/d1-public-projects",
    ]) {
      if (!importedSpecifiers(content).includes(required)) {
        addViolation(
          violations,
          "CLOUDFLARE_WORKER_D1_IMPORT_MISSING",
          "apps/api/src/composition/d1.ts",
          "The D1 composition must use explicit Worker-safe database subpath exports.",
          required,
        );
      }
    }
  }
}

function validateDatabaseExports(root, violations) {
  const packagePath = join(root, "packages/database/package.json");
  const displayPath = "packages/database/package.json";
  if (!existsSync(packagePath)) {
    addViolation(
      violations,
      "CLOUDFLARE_DATABASE_PACKAGE_MISSING",
      displayPath,
      "The database package manifest is required for Worker-safe subpath exports.",
    );
    return;
  }

  let manifest;
  try {
    manifest = readJson(packagePath);
  } catch (error) {
    addViolation(
      violations,
      "CLOUDFLARE_DATABASE_PACKAGE_INVALID",
      displayPath,
      "The database package manifest must contain valid JSON.",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  const requiredExports = {
    "./d1": "./src/adapters/d1.ts",
    "./d1-auth-sessions": "./src/repositories/d1-auth-session-store.ts",
    "./d1-attention-capture":
      "./src/repositories/d1-attention-capture-repository.ts",
    "./d1-login-rate-limiter":
      "./src/repositories/d1-login-rate-limiter.ts",
    "./d1-roadmap": "./src/repositories/d1-roadmap-data-source.ts",
    "./d1-today": "./src/repositories/d1-today-data-source.ts",
    "./d1-overview": "./src/repositories/d1-overview-data-source.ts",
    "./d1-public-projects": "./src/repositories/d1-public-project-source.ts",
  };
  for (const [subpath, target] of Object.entries(requiredExports)) {
    if (manifest.exports?.[subpath] !== target) {
      addViolation(
        violations,
        "CLOUDFLARE_DATABASE_EXPORT_INVALID",
        displayPath,
        "Worker-safe database subpath exports must remain explicit and stable.",
        `${subpath} -> ${target}`,
      );
      continue;
    }
    if (!existsSync(resolve(dirname(packagePath), target))) {
      addViolation(
        violations,
        "CLOUDFLARE_DATABASE_EXPORT_TARGET_MISSING",
        displayPath,
        "A Worker-safe database subpath export points to a missing file.",
        `${subpath} -> ${target}`,
      );
    }
  }
}

function validateWranglerConfiguration(root, violations) {
  const configPath = join(root, "apps/api/wrangler.jsonc");
  const displayPath = "apps/api/wrangler.jsonc";
  if (!existsSync(configPath)) {
    addViolation(
      violations,
      "CLOUDFLARE_WRANGLER_CONFIG_MISSING",
      displayPath,
      "The Cloudflare Worker configuration must be committed.",
    );
    return;
  }

  let config;
  try {
    config = readJson(configPath);
  } catch (error) {
    addViolation(
      violations,
      "CLOUDFLARE_WRANGLER_CONFIG_INVALID",
      displayPath,
      "The Wrangler configuration must contain valid JSONC without unsupported syntax.",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  if (config.main !== "src/worker.ts") {
    addViolation(
      violations,
      "CLOUDFLARE_WORKER_ENTRY_INVALID",
      displayPath,
      "Wrangler must point to the runtime-neutral module Worker entry.",
      String(config.main),
    );
  }

  const bindings = Array.isArray(config.d1_databases)
    ? config.d1_databases
    : [];
  const binding = bindings.find((candidate) => candidate?.binding === "DB");
  if (!binding) {
    addViolation(
      violations,
      "CLOUDFLARE_D1_BINDING_MISSING",
      displayPath,
      "Wrangler must expose the canonical D1 binding as env.DB.",
    );
    return;
  }

  if (binding.database_name !== "semogsite-development") {
    addViolation(
      violations,
      "CLOUDFLARE_D1_DATABASE_NAME_INVALID",
      displayPath,
      "The checked-in configuration must target the non-production SemogSite database.",
      String(binding.database_name),
    );
  }
  if (
    typeof binding.database_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      binding.database_id,
    )
  ) {
    addViolation(
      violations,
      "CLOUDFLARE_D1_DATABASE_ID_INVALID",
      displayPath,
      "The D1 database identifier must be a concrete UUID, not a placeholder.",
      String(binding.database_id),
    );
  }

  if (typeof binding.migrations_dir !== "string") {
    addViolation(
      violations,
      "CLOUDFLARE_D1_MIGRATIONS_DIR_MISSING",
      displayPath,
      "The D1 binding must reuse the canonical monorepo migrations directory.",
    );
    return;
  }

  const migrationsDirectory = resolve(dirname(configPath), binding.migrations_dir);
  if (!existsSync(migrationsDirectory) || !statSync(migrationsDirectory).isDirectory()) {
    addViolation(
      violations,
      "CLOUDFLARE_D1_MIGRATIONS_DIR_INVALID",
      displayPath,
      "The configured D1 migrations directory does not exist.",
      binding.migrations_dir,
    );
    return;
  }

  const migrations = readdirSync(migrationsDirectory)
    .filter((entry) => /^\d{4}_.+\.sql$/u.test(entry))
    .sort();
  if (migrations.length === 0) {
    addViolation(
      violations,
      "CLOUDFLARE_D1_MIGRATIONS_EMPTY",
      relative(root, migrationsDirectory).replaceAll("\\", "/"),
      "At least one canonical D1 migration must be committed.",
    );
    return;
  }

  for (const [index, migration] of migrations.entries()) {
    const expectedPrefix = String(index + 1).padStart(4, "0");
    if (!migration.startsWith(`${expectedPrefix}_`)) {
      addViolation(
        violations,
        "CLOUDFLARE_D1_MIGRATION_SEQUENCE_INVALID",
        relative(root, join(migrationsDirectory, migration)).replaceAll("\\", "/"),
        "D1 migrations must remain contiguous and lexically ordered for Wrangler.",
        `expected ${expectedPrefix}`,
      );
    }
  }
}

export function scanCloudflareWorkerBoundary(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const violations = [];
  validateWorkerImports(absoluteRoot, violations);
  validateDatabaseExports(absoluteRoot, violations);
  validateWranglerConfiguration(absoluteRoot, violations);
  return violations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      String(left.detail).localeCompare(String(right.detail)),
  );
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanCloudflareWorkerBoundary();
  if (violations.length === 0) {
    console.log("Cloudflare Worker boundary passed.");
  } else {
    for (const violation of violations) {
      const detail = violation.detail ? `: ${violation.detail}` : "";
      console.error(
        `${violation.code}: ${violation.path}${detail}: ${violation.message}`,
      );
    }
    process.exitCode = 1;
  }
}
