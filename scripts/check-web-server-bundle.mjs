#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceDirectory = resolve(
  repositoryRoot,
  "packages/database/migrations",
);
const bundledDirectory = resolve(repositoryRoot, "apps/web/dist/migrations");
const clientDirectory = resolve(repositoryRoot, "apps/web/dist/client/migrations");
const migrationPattern = /^\d+.*\.sql$/u;

function migrationNames(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => migrationPattern.test(name))
    .sort((left, right) => left.localeCompare(right));
}

const expected = migrationNames(sourceDirectory);
const bundled = migrationNames(bundledDirectory);
if (
  expected.length === 0 ||
  JSON.stringify(bundled) !== JSON.stringify(expected)
) {
  console.error("WEB_SERVER_MIGRATION_ASSETS_MISMATCH", { expected, bundled });
  process.exit(1);
}
if (existsSync(clientDirectory)) {
  console.error("WEB_CLIENT_MIGRATION_ASSETS_EXPOSED");
  process.exit(1);
}

console.log(`Web server migration assets passed (${bundled.length} files).`);
