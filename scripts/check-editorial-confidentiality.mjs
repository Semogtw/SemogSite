import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceExtension = /\.(?:c|m)?(?:j|t)sx?$|\.json$|\.md$/u;
const routeExtension = /\.(?:c|m)?(?:j|t)sx?$/u;
const testFilePattern = /\.(?:test|spec)\.(?:c|m)?(?:j|t)sx?$/u;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".output",
  ".tanstack",
  "__snapshots__",
]);

const rules = [
  {
    code: "EDITORIAL_PRIVATE_STORAGE_IMPORT",
    pattern:
      /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'][^"']*(?:editorial-workflow|schema\/editorial|editorial-(?:write|review|transition|repository))[^"']*["']/u,
    message: "Public surfaces must not import private editorial workflow/storage modules.",
  },
  {
    code: "EDITORIAL_PRIVATE_SYMBOL",
    pattern:
      /\b(?:EditorialApprovalSnapshot|EditorialDocumentSnapshot|EditorialRevisionSnapshot|EditorialEventProposal|SqliteEditorial\w*|EditorialTransition\w*|EditorialReview\w*)\b/u,
    message: "Public surfaces must not reference private editorial workflow symbols.",
  },
  {
    code: "EDITORIAL_PRIVATE_TABLE",
    pattern:
      /\beditorial_(?:documents|revisions|reviews|events)\b/u,
    message: "Public surfaces must not reference private editorial tables.",
  },
  {
    code: "EDITORIAL_PRIVATE_FIELD",
    pattern:
      /\b(?:workflowStatus|publicationStatus|workingRevisionId|approvedRevisionId|lastPublishedRevisionId|reviewerId|reviewedAt|reviewNotes|idempotencyKey|correlationId)\b/u,
    message: "Public projections must not serialize private editorial workflow fields.",
  },
  {
    code: "EDITORIAL_PRIVATE_ROUTE",
    pattern: /["'`]\/devos\/editorial(?:\/|["'`])/u,
    message: "Public surfaces must not link to the private editorial workspace.",
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
    else if (
      stats.isFile() &&
      sourceExtension.test(entry) &&
      !testFilePattern.test(entry)
    ) {
      files.push(absolute);
    }
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
      routeExtension.test(name) &&
      !name.startsWith("devos") &&
      !name.startsWith("api.private")
    );
  });
}

export function scanEditorialPublicConfidentiality(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const candidates = [
    ...publicRoots(absoluteRoot).flatMap(collectFiles),
    ...publicRouteFiles(absoluteRoot),
  ];
  const violations = [];

  for (const absolutePath of [...new Set(candidates)]) {
    const content = readFileSync(absolutePath, "utf8");
    const path = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");
    for (const rule of rules) {
      if (rule.pattern.test(content)) {
        violations.push({ code: rule.code, path, message: rule.message });
      }
    }
  }

  return violations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
  );
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanEditorialPublicConfidentiality();
  if (violations.length === 0) {
    console.log("Editorial public confidentiality passed.");
  } else {
    for (const violation of violations) {
      console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
    }
    process.exitCode = 1;
  }
}
