import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const privateFields = [
  "branchSummary",
  "privateSummary",
  "repositoryFullNames",
  "statusBasis",
  "blocker",
  "evidenceUrl",
  "sessionDetails",
  "auditMetadata",
  "tokenDigest",
  "passwordHash",
];

const secretPatterns = [
  { name: "github-token", pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/u },
  {
    name: "generic-api-key",
    pattern: /(?:api[_-]?key|secret)["'\s:=]+[A-Za-z0-9_\-]{24,}/iu,
  },
  {
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
];

const exactPublicFiles = new Set([
  "apps/web/src/routes/index.tsx",
  "apps/web/src/routes/about.tsx",
  "apps/web/src/routes/contact.tsx",
  "apps/web/src/routes/journey.tsx",
  "apps/web/src/routes/lab.tsx",
  "apps/web/src/routes/notes.index.tsx",
  "apps/web/src/routes/notes.$slug.tsx",
  "apps/web/src/routes/projects.index.tsx",
  "apps/web/src/routes/projects.$slug.tsx",
  "apps/web/src/routes/stack.tsx",
]);

export function isPublicSurfacePath(path) {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)) return false;

  return (
    exactPublicFiles.has(path) ||
    path.startsWith("apps/web/src/components/public/") ||
    path.startsWith("apps/web/public/") ||
    path.startsWith("apps/api/src/routes/public/")
  );
}

export function scanPublicText(text) {
  const findings = [];
  for (const field of privateFields) {
    if (text.includes(field)) findings.push(`private-field:${field}`);
  }
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(text)) findings.push(`secret-pattern:${name}`);
  }
  return findings;
}

async function main() {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter(isPublicSurfacePath);

  const violations = [];
  for (const path of files) {
    let source;
    try {
      source = await readFile(path, "utf8");
    } catch {
      continue;
    }
    const findings = scanPublicText(source);
    if (findings.length > 0) violations.push({ path, findings });
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.path}: ${violation.findings.join(", ")}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Public confidentiality check passed (${files.length} files scanned).`);
}

const direct =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (direct) await main();
