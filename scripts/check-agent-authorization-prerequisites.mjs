import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const authorizationMigrationPath =
  "packages/database/migrations/0018_agent_authorization.sql";
const oauthMigrationPath =
  "packages/database/migrations/0014_mcp_oauth.sql";
const authPackagePath = "packages/mcp-auth/package.json";

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function violation(code, path) {
  return { code, path };
}

export async function checkAgentAuthorizationPrerequisites(
  root = process.cwd(),
) {
  const authorizationMigration = await readText(
    resolve(root, authorizationMigrationPath),
  );
  if (authorizationMigration === null) return [];

  const violations = [];
  const oauthMigration = await readText(resolve(root, oauthMigrationPath));
  if (oauthMigration === null) {
    violations.push(
      violation(
        "AGENT_AUTHORIZATION_OAUTH_MIGRATION_MISSING",
        oauthMigrationPath,
      ),
    );
  }

  const authPackageSource = await readText(resolve(root, authPackagePath));
  if (authPackageSource === null) {
    violations.push(
      violation(
        "AGENT_AUTHORIZATION_AUTH_PACKAGE_MISSING",
        authPackagePath,
      ),
    );
  } else {
    try {
      const packageJson = JSON.parse(authPackageSource);
      if (
        typeof packageJson !== "object" ||
        packageJson === null ||
        Array.isArray(packageJson) ||
        packageJson.name !== "@semogtw/mcp-auth"
      ) {
        violations.push(
          violation(
            "AGENT_AUTHORIZATION_AUTH_PACKAGE_INVALID",
            authPackagePath,
          ),
        );
      }
    } catch {
      violations.push(
        violation(
          "AGENT_AUTHORIZATION_AUTH_PACKAGE_INVALID",
          authPackagePath,
        ),
      );
    }
  }

  return violations;
}

async function main() {
  const violations = await checkAgentAuthorizationPrerequisites();
  if (violations.length > 0) {
    for (const item of violations) console.error(JSON.stringify(item));
    process.exitCode = 1;
    return;
  }
  console.log("Agent authorization prerequisite check passed.");
}

const direct =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (direct) await main();
