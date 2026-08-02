# Development handoff — MCP output hardening

## Plan and checkpoint

- Read adapter: `docs/superpowers/plans/2026-08-01-semogtw-mcp-read-adapter.md`
- Remote transport: `docs/superpowers/plans/2026-08-01-semogtw-mcp-streamable-http.md` — blocked, no endpoint
- Checkpoint: internal read-only adapter hardening and dependency-free verification

## Branch

`develop/foundation-bootstrap`

## Work completed

- provider-neutral `DevOSReadService` over canonical Overview, Today, Project and Roadmap services;
- SQLite composition returning an `McpServer` without a listener;
- canonical MCP manifest for identity, tools, resources, annotations, response limit and stable errors;
- four static resources and five read-only tools;
- canonical `ProjectHub.dataSource: DataSource` contract;
- structural output schemas for all five projections;
- text plus `structuredContent` success responses;
- stable sanitized error responses;
- 256 KiB logical JSON limit;
- iterative sensitive-key scan with repeated/circular-reference support;
- rejection of password/token/secret fields, credential containers, digests, JWT/session IDs and credential value fields;
- safe status metadata allowance;
- non-JSON and malformed result containment;
- protocol specifications for identity, catalog, inputs, outputs, failures and SQLite composition;
- transport/listener guardrail across `packages/mcp`, `apps/mcp` and every `apps/mcp-*` namespace;
- cross-surface guardrail preventing MCP/SDK imports from web/API;
- blocked stateless authenticated Streamable HTTP plan.

## Tests actually executed

Dependency-free observed evidence:

- strict TypeScript-assisted compilation of `DevOSReadService`;
- strict TypeScript-assisted compilation of MCP server/catalog/schema patterns against reviewed ambient declarations;
- pure catalog/output-safety TypeScript compilation and Node execution;
- latest denylist run including JWT, session IDs, authorization header and credential value fields;
- circular/repeated-reference behavior;
- safe object graph 20,000 levels deep;
- Node-native transport import variants;
- current/future MCP app namespace protection;
- web/API MCP cross-surface protection.

Observed latest output-safety result:

```text
Latest iterative MCP output-safety checks passed.
```

## Tests unavailable or not yet executed

The shell cannot resolve the npm registry, so these remain specifications:

- real Zod + `@modelcontextprotocol/sdk` typecheck;
- Vitest MCP protocol suites;
- SQLite native composition test;
- recursive workspace `pnpm check`;
- production build;
- browser/E2E and remote-client behavior.

Do not convert static source review or ambient-declaration compilation into a passing SDK/workspace gate.

## Security/privacy implications

- current MCP results are private projections and may contain repository names, branches, blockers and evidence;
- no transport or listener exists;
- output is structurally validated, scanned for credential-bearing keys and size-bounded before protocol return;
- errors expose stable codes only;
- web/API cannot import MCP packages under the current guardrail;
- narrowing the guardrail requires the reviewed authenticated transport phase.

## Documentation updated

- `MCP.md`
- `ARCHITECTURE.md`
- `SECURITY.md` when the local authenticated path is available
- `TESTING.md` when the local authenticated path is available
- `DATA_MODEL.md`
- `DEPLOYMENT.md`
- `RUNBOOK.md`
- `CHANGELOG.md` when the local authenticated path is available
- MCP read/transport plans and plan index
- static verification reports under `docs/verification/`
- PR #1 body, kept draft

## Known blockers

- npm registry DNS/network from the shell;
- no lockfile or installed MCP SDK in the current branch evidence;
- no selected production host or authenticated MCP transport;
- no observed full workspace/typecheck/build result.

## Exact next actions

1. Confirm that `packages/mcp/src/output-schemas.ts` in the remote branch contains `.max(2_000)` on the shared record-list schema before considering `output-schemas-bounds.test.ts` implemented.
2. In a dependency-complete environment, install and commit `pnpm-lock.yaml`.
3. Run focused domain/database/MCP/MCP-app tests and typechecks.
4. Fix the first real Zod/SDK diagnostic from observed output.
5. Run `pnpm check` and `pnpm build`.
6. Keep PR #1 draft until protocol, SQLite composition, workspace and browser gates are observed.
7. Do not implement `apps/mcp-http` until all preconditions in the transport plan pass and the owner explicitly approves remote exposure.
