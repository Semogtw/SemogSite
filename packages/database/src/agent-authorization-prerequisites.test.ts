import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const oauthMigrationPath = resolve(
  repositoryRoot,
  "packages/database/migrations/0014_mcp_oauth.sql",
);
const authorizationMigrationPath = resolve(
  repositoryRoot,
  "packages/database/migrations/0018_agent_authorization.sql",
);
const authPackagePath = resolve(
  repositoryRoot,
  "packages/mcp-auth/package.json",
);

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("agent authorization persistence prerequisites", () => {
  it("does not allow migration 0018 before the real OAuth schema and package exist", () => {
    if (!existsSync(authorizationMigrationPath)) {
      expect(existsSync(authorizationMigrationPath)).toBe(false);
      return;
    }

    expect(existsSync(oauthMigrationPath)).toBe(true);
    expect(existsSync(authPackagePath)).toBe(true);

    const oauthMigration = source(oauthMigrationPath);
    const authorizationMigration = source(authorizationMigrationPath);
    const authPackage = JSON.parse(source(authPackagePath)) as unknown;

    expect(oauthMigration).toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+mcp_oauth_clients\b/iu,
    );
    expect(authorizationMigration).toMatch(
      /REFERENCES\s+mcp_oauth_clients\s*\(/iu,
    );
    expect(authorizationMigration).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+mcp_oauth_clients\b/iu,
    );
    expect(authPackage).toEqual(
      expect.objectContaining({ name: "@semogtw/mcp-auth" }),
    );
  });

  it("keeps the reserved authorization migration absent on the current stack", () => {
    expect(existsSync(authorizationMigrationPath)).toBe(false);
  });
});
