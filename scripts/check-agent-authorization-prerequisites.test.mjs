import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAgentAuthorizationPrerequisites } from "./check-agent-authorization-prerequisites.mjs";

const directories = [];

async function fixture(input = {}) {
  const root = await mkdtemp(join(tmpdir(), "semogtw-agent-auth-prereq-"));
  directories.push(root);
  await mkdir(join(root, "packages/database/migrations"), { recursive: true });
  if (input.oauthMigration === true) {
    await writeFile(
      join(root, "packages/database/migrations/0014_mcp_oauth.sql"),
      "CREATE TABLE mcp_oauth_clients (id TEXT PRIMARY KEY);",
    );
  }
  if (input.authorizationMigration === true) {
    await writeFile(
      join(root, "packages/database/migrations/0018_agent_authorization.sql"),
      "CREATE TABLE agent_profiles (id TEXT PRIMARY KEY);",
    );
  }
  if (input.authPackage !== undefined) {
    await mkdir(join(root, "packages/mcp-auth"), { recursive: true });
    await writeFile(
      join(root, "packages/mcp-auth/package.json"),
      input.authPackage,
    );
  }
  return root;
}

try {
  assert.deepEqual(
    await checkAgentAuthorizationPrerequisites(await fixture()),
    [],
  );
  assert.deepEqual(
    await checkAgentAuthorizationPrerequisites(
      await fixture({ oauthMigration: true, authPackage: '{"name":"@semogtw/mcp-auth"}' }),
    ),
    [],
  );
  assert.deepEqual(
    await checkAgentAuthorizationPrerequisites(
      await fixture({
        oauthMigration: true,
        authorizationMigration: true,
        authPackage: '{"name":"@semogtw/mcp-auth"}',
      }),
    ),
    [],
  );

  const missingOAuth = await checkAgentAuthorizationPrerequisites(
    await fixture({
      authorizationMigration: true,
      authPackage: '{"name":"@semogtw/mcp-auth"}',
    }),
  );
  assert.deepEqual(missingOAuth, [
    {
      code: "AGENT_AUTHORIZATION_OAUTH_MIGRATION_MISSING",
      path: "packages/database/migrations/0014_mcp_oauth.sql",
    },
  ]);

  const missingPackage = await checkAgentAuthorizationPrerequisites(
    await fixture({ oauthMigration: true, authorizationMigration: true }),
  );
  assert.deepEqual(missingPackage, [
    {
      code: "AGENT_AUTHORIZATION_AUTH_PACKAGE_MISSING",
      path: "packages/mcp-auth/package.json",
    },
  ]);

  for (const authPackage of [
    "not-json",
    "{}",
    '{"name":"@semogtw/mcp"}',
    '{"name":1}',
  ]) {
    const violations = await checkAgentAuthorizationPrerequisites(
      await fixture({
        oauthMigration: true,
        authorizationMigration: true,
        authPackage,
      }),
    );
    assert.deepEqual(violations, [
      {
        code: "AGENT_AUTHORIZATION_AUTH_PACKAGE_INVALID",
        path: "packages/mcp-auth/package.json",
      },
    ]);
  }

  console.log("Agent authorization prerequisite guardrail fixtures passed.");
} finally {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
