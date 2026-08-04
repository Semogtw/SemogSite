# Agent Write Authorization — Prerequisite and Grant Guardrails

## Scope

This note records the provider-neutral continuation on PR #27 after the pure authorization policy foundation. It does not claim OAuth persistence, remote MCP write exposure or executed gates.

## OAuth persistence prerequisite guardrail

The repository now contains:

```text
scripts/check-agent-authorization-prerequisites.mjs
scripts/check-agent-authorization-prerequisites.test.mjs
packages/database/src/agent-authorization-prerequisites.test.ts
```

`pnpm check` and `pnpm test:guardrails` include the root prerequisite check.

Migration `0018_agent_authorization.sql` is allowed only when all of the following are true:

- `0014_mcp_oauth.sql` exists;
- migration `0014` actually defines `mcp_oauth_clients`;
- `packages/mcp-auth/package.json` exists with package name `@semogtw/mcp-auth`;
- migration `0018` contains a foreign-key reference to `mcp_oauth_clients`;
- migration `0018` does not recreate the OAuth client table.

When migration `0018` is absent, the guardrail passes without inventing its prerequisite. On the current stack, `0018`, `0014` and `@semogtw/mcp-auth` remain absent, so OAuth-backed persistence stays blocked.

## Owner-only grant request validation

The framework-free package now contains:

```text
packages/application/src/authorization/grant-request.ts
packages/application/src/authorization/grant-request.test.ts
```

The validator requires:

- an authenticated `owner_ui` actor;
- exact owner identity match;
- bounded owner/client/profile/reason values;
- a closed, unique, non-empty capability set;
- only low, medium or high grant ceilings;
- canonical future expiry when present;
- selectors only for resource kinds reviewed for the selected capabilities;
- at least one selector for every selected capability;
- explicit owner selection before accepting an `all` selector.

MCP clients, system actors and external adapters cannot create or broaden grants through this contract. No repository or owner-management UI is implemented by this change.

## Execution status

No test, typecheck, build or workflow result for this continuation is recorded as passed. The connected session still lacks a repository checkout and pnpm runtime. The PR must remain draft until exact-head gates run.

Mandatory focused gates:

```text
pnpm install --frozen-lockfile
pnpm test:guardrails
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm check
pnpm build
```
