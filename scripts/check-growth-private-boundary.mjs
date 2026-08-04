import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const PRIVATE_GROWTH_MARKERS = [
  "@semogtw/database/growth",
  "@semogtw/domain/growth",
  "learning_goals",
  "learning_checkpoints",
  "skill_alias_events",
  "GrowthOverviewRead",
  "LearningGoalDetailRead",
];
const DIRECT_PROGRESS_SETTER_PATTERNS = [
  /\bsetGoalProgress\b/,
  /\bupdateGoalProgress\b/,
  /\bwriteGoalProgress\b/,
  /\bprogressPercent\s*:/,
  /\bgoalProgressPercent\b/,
  /devos_(set|update)_learning_goal_progress/,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "coverage" ||
      entry.name === "test-results" ||
      entry.name === "playwright-report"
    ) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function normalizedRelative(root, file) {
  return relative(root, file).replaceAll("\\", "/");
}

function isPublicSurface(path) {
  if (path.startsWith("packages/contracts/src/public/")) return true;
  if (path.startsWith("apps/web/src/components/public/")) return true;
  if (path.startsWith("apps/web/src/routes/")) {
    const name = path.slice("apps/web/src/routes/".length);
    return !name.startsWith("devos.") && !name.startsWith("devos/");
  }
  return false;
}

function isRuntimeSource(path) {
  return (
    path.startsWith("apps/") ||
    path.startsWith("packages/") ||
    path.startsWith("scripts/")
  );
}

export async function checkGrowthPrivateBoundary(rootDirectory) {
  const root = resolve(rootDirectory);
  const files = await walk(root);
  const violations = [];

  for (const file of files) {
    const path = normalizedRelative(root, file);
    if (!isRuntimeSource(path)) continue;
    const source = await readFile(file, "utf8");

    if (isPublicSurface(path)) {
      for (const marker of PRIVATE_GROWTH_MARKERS) {
        if (source.includes(marker)) {
          violations.push({
            path,
            code: "PUBLIC_SURFACE_IMPORTS_PRIVATE_GROWTH",
            detail: marker,
          });
        }
      }
    }

    if (!path.endsWith(".test.ts") && !path.endsWith(".test.tsx")) {
      for (const pattern of DIRECT_PROGRESS_SETTER_PATTERNS) {
        if (pattern.test(source)) {
          violations.push({
            path,
            code: "DIRECT_GROWTH_PROGRESS_SETTER_FORBIDDEN",
            detail: String(pattern),
          });
        }
      }
    }
  }

  return violations.sort((left, right) =>
    `${left.path}:${left.code}:${left.detail}`.localeCompare(
      `${right.path}:${right.code}:${right.detail}`,
    ),
  );
}

async function main() {
  const root = process.argv[2] ?? process.cwd();
  const violations = await checkGrowthPrivateBoundary(root);
  if (violations.length === 0) {
    console.log("Growth private boundary: OK");
    return;
  }
  for (const violation of violations) {
    console.error(
      `${violation.code}: ${violation.path} (${violation.detail})`,
    );
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
