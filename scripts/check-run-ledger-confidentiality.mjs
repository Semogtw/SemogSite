import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, relative, resolve } from "node:path";

const sourceExtension = /\.(?:c|m)?(?:j|t)sx?$|\.json$|\.md$/u;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".output",
  ".tanstack",
  "__snapshots__",
]);
const publicRouteExtensions = /\.(?:c|m)?(?:j|t)sx?$/u;

const forbiddenPatterns = [
  {
    code: "RUN_LEDGER_DATABASE_IMPORT",
    pattern:
      /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'][^"']*(?:cooperative-run|schema\/runs)[^"']*["']/u,
    message: "Public surfaces must not import cooperative run storage modules.",
  },
  {
    code: "RUN_LEDGER_PRIVATE_SYMBOL",
    pattern:
      /\b(?:SqliteCooperativeRun\w*|CooperativeRun(?:Command|Checkpoint|History|ListItem|Detail|Snapshot|Transition|Registration|Inbox)\w*)\b/u,
    message: "Public surfaces must not reference private cooperative run symbols.",
  },
  {
    code: "RUN_LEDGER_TABLE_NAME",
    pattern:
      /\bcooperative_run_(?:events|checkpoints|commands)\b|\bcooperative_runs\b/u,
    message: "Public surfaces must not reference private cooperative run table names.",
  },
  {
    code: "RUN_LEDGER_PRIVATE_ROUTE",
    pattern: /["'`]\/devos\/runs(?:\/|["'`])/u,
    message: "Public surfaces must not link to the private run ledger.",
  },
  {
    code: "RUN_LEDGER_PRIVATE_PROJECTION",
    pattern:
      /\b(?:lastHeartbeatAt|staleAfterSeconds|queueAvailability|acknowledgedAt|completedAt)\b/u,
    message: "Public projections must not serialize cooperative run lifecycle fields.",
  },
];

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) files.push(...collectFiles(absolute));
    else if (stats.isFile() && sourceExtension.test(entry)) files.push(absolute);
  }
  return files;
}

function publicRoots(root) {
  return [
    join(root, "apps/web/src/content"),
    join(root, "apps/web/src/data/public"),
    join(root, "apps/api/src/routes/public"),
    join(root, "packages/contracts/src/public"),
  ];
}

function publicRouteFiles(root) {
  const routeRoot = join(root, "apps/web/src/routes");
  if (!existsSync(routeRoot)) return [];
  return collectFiles(routeRoot).filter((file) => {
    const name = basename(file);
    return (
      publicRouteExtensions.test(name) &&
      !name.startsWith("devos") &&
      !name.startsWith("api.private")
    );
  });
}

export function scanRunLedgerPublicConfidentiality(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const candidates = [
    ...publicRoots(absoluteRoot).flatMap(collectFiles),
    ...publicRouteFiles(absoluteRoot),
  ];
  const unique = [...new Set(candidates)];
  const violations = [];

  for (const absolutePath of unique) {
    const content = readFileSync(absolutePath, "utf8");
    const path = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");
    for (const rule of forbiddenPatterns) {
      if (!rule.pattern.test(content)) continue;
      violations.push({ code: rule.code, path, message: rule.message });
    }
  }

  return violations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
  );
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanRunLedgerPublicConfidentiality();
  if (violations.length === 0) {
    console.log("Run ledger public confidentiality passed.");
  } else {
    for (const violation of violations) {
      console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
    }
    process.exitCode = 1;
  }
}
