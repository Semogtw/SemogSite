#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const webDist = resolve(repositoryRoot, "apps/web/dist");
const serverDirectory = resolve(webDist, "server");
const clientDirectory = resolve(webDist, "client");
const migrationDirectory = resolve(webDist, "migrations");
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs"]);

const forbiddenMarkers = [
  { label: "better-sqlite3", pattern: /better-sqlite3/u },
  { label: "Node SQLite API composition", pattern: /createSqliteApiRuntime/u },
  { label: "Node database server module", pattern: /node-database\.server/u },
  { label: "private DevOS route", pattern: /["'`]\/devos(?:[\/"'`]|$)/u },
];

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolute = resolve(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) files.push(...collectFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

if (!existsSync(serverDirectory)) {
  console.error("PUBLIC_WEB_SERVER_BUNDLE_MISSING");
  process.exit(1);
}
if (!existsSync(clientDirectory)) {
  console.error("PUBLIC_WEB_CLIENT_BUNDLE_MISSING");
  process.exit(1);
}
if (existsSync(migrationDirectory)) {
  console.error("PUBLIC_WEB_SQLITE_MIGRATIONS_EXPOSED");
  process.exit(1);
}

const bundleFiles = [...collectFiles(serverDirectory), ...collectFiles(clientDirectory)];
const textFiles = bundleFiles.filter((file) => textExtensions.has(extname(file)));
if (textFiles.length === 0) {
  console.error("PUBLIC_WEB_BUNDLE_EMPTY");
  process.exit(1);
}

const violations = [];
for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (marker.pattern.test(content)) {
      violations.push({
        file: relative(repositoryRoot, file),
        marker: marker.label,
      });
    }
  }
}

for (const file of bundleFiles) {
  if (/(^|[\\/])devos(?:[.\-_]|[\\/])/iu.test(relative(webDist, file))) {
    violations.push({
      file: relative(repositoryRoot, file),
      marker: "private DevOS asset",
    });
  }
}

if (violations.length > 0) {
  console.error("PUBLIC_WEB_BUNDLE_BOUNDARY_VIOLATION", violations);
  process.exit(1);
}

console.log(
  `Public web bundle boundary passed (${textFiles.length} text artifacts scanned).`,
);
