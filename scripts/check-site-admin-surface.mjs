import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedRoutes = new Set([
  "devos.tsx", "devos.index.tsx", "devos.login.tsx", "devos.more.tsx",
  "devos.content.tsx", "devos.content.index.tsx",
  "devos.content.$documentId.tsx", "devos.audit.tsx", "devos.settings.tsx",
]);
const allowedPrivateApiMounts = new Set([
  "/api/v1/private/audit",
  "/api/v1/private/capabilities",
  "/api/v1/private/editorial-redirects",
]);
const expectedEditorialWrites = new Set([
  "/api/v1/private/editorial-redirects/create",
  "/api/v1/private/editorial-redirects/revoke",
]);

export function scanSiteAdminSurface(at = root) {
  const issues = [];
  const source = (path) => {
    const full = join(at, path);
    if (!existsSync(full)) {
      issues.push(`MISSING: ${path}`);
      return "";
    }
    return readFileSync(full, "utf8");
  };
  const routeFolder = join(at, "apps/web/src/routes");
  if (!existsSync(routeFolder)) issues.push("MISSING: web route directory");
  else for (const file of readdirSync(routeFolder)) {
    if (/^devos(?:\..+)?\.tsx$/.test(file) && !allowedRoutes.has(file)) {
      issues.push(`UNAPPROVED_ADMIN_ROUTE: ${file}`);
    }
  }
  const app = source("apps/api/src/app.ts");
  const mounts = [...app.matchAll(/api\.route\(\s*["'](\/api\/v1\/private\/[^"']+)/g)]
    .map((match) => match[1]);
  for (const path of mounts) if (!allowedPrivateApiMounts.has(path)) {
    issues.push(`UNAPPROVED_PRIVATE_API: ${path}`);
  }
  for (const path of allowedPrivateApiMounts) if (!mounts.includes(path)) {
    issues.push(`MISSING_PRIVATE_API: ${path}`);
  }
  const registry = source("apps/api/src/private-capability-registry.ts");
  const writes = [...registry.matchAll(/path:\s*["'](\/api\/v1\/private\/[^"']+)["']/g)]
    .map((match) => match[1]);
  if (writes.length !== expectedEditorialWrites.size ||
    writes.some((path) => !expectedEditorialWrites.has(path))) {
    issues.push("UNAPPROVED_PRIVATE_WRITE_REGISTRY");
  }
  const client = source("apps/web/src/lib/private-devos-client.ts");
  for (const token of ["allowedEditorialMutations", "editorial_redirect.create", "editorial_redirect.revoke"]) {
    if (!client.includes(token)) issues.push(`EDITORIAL_CLIENT_GUARD_MISSING: ${token}`);
  }
  const sidebar = source("packages/ui/src/navigation/devos-sidebar.tsx");
  const bottom = source("packages/ui/src/navigation/devos-bottom-nav.tsx");
  for (const path of ["/devos/runs", "/devos/workflows", "/devos/roadmap",
    "/devos/operations", "/devos/today", "/devos/projects"]) {
    if (sidebar.includes(path) || bottom.includes(path)) {
      issues.push(`RETIRED_NAVIGATION: ${path}`);
    }
  }
  return issues;
}
const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const issues = scanSiteAdminSurface();
  if (issues.length === 0) console.log("Site admin surface guard passed.");
  else {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  }
}
