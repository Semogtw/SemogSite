import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const releaseMode = process.argv.includes("--release");
const failures = [];

function requireFile(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    failures.push(`missing required public production file: ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function requireContains(path, content, expected) {
  if (!content.includes(expected)) {
    failures.push(`${path} must contain ${JSON.stringify(expected)}`);
  }
}

const rootRoute = requireFile("apps/web/src/routes/__root.tsx");
requireContains("apps/web/src/routes/__root.tsx", rootRoute, 'name: "theme-color"');
requireContains("apps/web/src/routes/__root.tsx", rootRoute, 'href: "/favicon.svg"');
requireContains("apps/web/src/routes/__root.tsx", rootRoute, 'href: "/site.webmanifest"');

const publicUrl = requireFile("apps/web/src/routes/-public-url.ts");
requireContains(
  "apps/web/src/routes/-public-url.ts",
  publicUrl,
  "VITE_SEMOGTW_PUBLIC_ORIGIN",
);
requireContains(
  "apps/web/src/routes/-public-url.ts",
  publicUrl,
  "PUBLIC_ORIGIN_INVALID",
);

const projectRoute = requireFile("apps/web/src/routes/projects.$slug.tsx");
requireContains(
  "apps/web/src/routes/projects.$slug.tsx",
  projectRoute,
  "throw notFound()",
);

const noteRoute = requireFile("apps/web/src/routes/notes.$slug.tsx");
requireContains(
  "apps/web/src/routes/notes.$slug.tsx",
  noteRoute,
  "throw notFound()",
);

requireFile("apps/web/src/routes/favicon[.]svg.ts");
requireFile("apps/web/src/routes/site[.]webmanifest.ts");
requireFile("tests/e2e/public-http-semantics.spec.ts");

const webServer = requireFile("scripts/start-web-server.mjs");
for (const header of [
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
  "cross-origin-opener-policy",
]) {
  requireContains("scripts/start-web-server.mjs", webServer, header);
}

const discovery = requireFile("apps/web/src/routes/-public-discovery.ts");
requireContains(
  "apps/web/src/routes/-public-discovery.ts",
  discovery,
  "Disallow: /api/",
);

if (releaseMode) {
  const configuredOrigin = process.env.VITE_SEMOGTW_PUBLIC_ORIGIN?.trim() ?? "";
  if (configuredOrigin.length === 0) {
    failures.push(
      "release mode requires VITE_SEMOGTW_PUBLIC_ORIGIN with the final HTTPS site origin",
    );
  } else {
    try {
      const url = new URL(configuredOrigin);
      if (
        url.protocol !== "https:" ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        url.pathname !== "/" ||
        url.search.length > 0 ||
        url.hash.length > 0
      ) {
        failures.push(
          "VITE_SEMOGTW_PUBLIC_ORIGIN must be a bare HTTPS origin in release mode",
        );
      }
    } catch {
      failures.push("VITE_SEMOGTW_PUBLIC_ORIGIN is not a valid URL");
    }
  }
}

if (failures.length > 0) {
  console.error("Public production readiness check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    releaseMode
      ? "Public release readiness source/config gate passed."
      : "Public production readiness source gate passed.",
  );
}
