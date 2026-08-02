# Runbook

## Application does not build

1. confirm Node.js 22+ and pnpm 10;
2. remove only generated artifacts: `node_modules`, `.tanstack`, `.output`, `dist`;
3. run `pnpm install --frozen-lockfile=false`;
4. run `pnpm check:upstream-clean` and `pnpm check:boundaries` separately;
5. run package tests/typechecks to isolate the first failing workspace;
6. consult current official documentation before changing TanStack Start, Hono, Drizzle, GitHub REST or MCP SDK APIs;
7. record the exact failure and fix in `CHANGELOG.md`.

Do not use GitHub Actions as the default substitute for a local dependency environment.

## DevOS redirects to login repeatedly

Check, without printing values:

- `SEMOGTW_OWNER_PASSWORD_HASH` exists;
- `SEMOGTW_SESSION_SECRET` has at least 32 characters;
- database path is writable;
- migrations include `owner_accounts` and `auth_sessions`;
- web runtime called `configureWebAuth` with the local/provider adapter;
- cookie path, Secure policy and HTTPS match the environment;
- session has not expired or been revoked.

Missing configuration should keep failing closed.

## Verify the in-process MCP read adapter

The current MCP implementation is a server factory, not a deployed endpoint.

After installing dependencies, run:

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp-app typecheck
```

The expected catalog is:

```text
Resources
semogtw://devos/overview
semogtw://devos/today
semogtw://devos/projects
semogtw://devos/roadmap

Tools
devos_get_overview
devos_get_today
devos_list_projects
devos_get_project
devos_query_roadmap
```

Every tool must remain read-only, non-destructive, idempotent and closed-world. No create/update/delete/accept/complete tool should be discoverable.

The integration test creates an in-memory SQLite database, applies migrations, constructs `createSqliteSemogtwMcpServer(database)` and connects the official MCP client with `InMemoryTransport`. It does not open a port or stdio stream.

## MCP read adapter fails to install or typecheck

1. confirm the resolved `@modelcontextprotocol/sdk` version is on the reviewed stable v1.x line;
2. confirm Zod satisfies the SDK peer range;
3. keep the deep imports with `.js` suffixes:
   - `@modelcontextprotocol/sdk/server/mcp.js`;
   - `@modelcontextprotocol/sdk/client/index.js`;
   - `@modelcontextprotocol/sdk/inMemory.js`;
4. verify `packages/mcp` declares `@semogtw/domain` and the SDK;
5. verify `apps/mcp` declares `@semogtw/database` and `@semogtw/mcp`;
6. run package typechecks before the whole workspace;
7. consult the exact installed SDK tag before changing callback or schema shapes;
8. record the installed version and observed error in `CHANGELOG.md`.

Do not switch to a v2 alpha merely to silence a v1 type error. First determine whether the code or dependency resolution is wrong.

## MCP tool/resource returns `DEVOS_READ_FAILED`

The adapter intentionally hides the thrown exception.

1. reproduce through the same canonical service directly in a private development environment;
2. verify the SQLite database is open and migrations `0001`–`0004` were applied;
3. run the corresponding read-model test for Overview, Today, Projects or Roadmap;
4. inspect private server logs only for the sanitized correlation/error code configured by the future transport;
5. never change the protocol response to include the original exception, SQL, path, token or database content;
6. repair the underlying data-source or composition problem and rerun the protocol test.

`PROJECT_NOT_FOUND`, `PROJECT_INVALID_INPUT` and `ROADMAP_INVALID_INPUT` are expected stable tool errors, not infrastructure failures.

## Do not expose MCP remotely yet

The current code contains no transport listener. Do not add a route, stdio launcher or public command ad hoc.

Before a Streamable HTTP endpoint is created, a dedicated plan must define and verify:

- owner authentication and revocation;
- authorization before server connection;
- per-session isolation;
- TLS, canonical host and Origin handling;
- DNS rebinding protections when applicable;
- request/body limits, timeouts and cancellation;
- shared rate limiting for multi-instance deployment;
- private/no-store cache behavior;
- structured sanitized logging and correlation IDs;
- deployment rollback and secret rotation;
- ChatGPT/MCP client compatibility in the selected host.

Passing the in-memory protocol suite is necessary but insufficient for remote exposure.

## Configure GitHub read synchronization

1. create a fine-grained token restricted to the smallest repository set possible;
2. grant Metadata read and Contents read only;
3. store it as `SEMOGTW_GITHUB_TOKEN` in the server/runtime secret store;
4. leave `.env.example` empty and never commit the real value;
5. restart the server and open DevOS → Operação;
6. confirm the UI reports only `token configurado`, never a token fragment;
7. register a private target through the audited form;
8. run one confirmed observation cycle and inspect the persisted run and recommendations.

No GitHub write permission is required. The application has no generic provider proxy and does not implement write endpoints.

## Register a repository target

Use DevOS → Operação rather than direct SQL.

1. select an existing private project;
2. enter canonical `owner/repository`;
3. enter the expected default branch;
4. choose one canonical role: product, core, integration, infrastructure, academic or experiment;
5. provide a concrete reason and confirm the local mutation;
6. verify the target appears as enabled but still unverified until the first read;
7. inspect `repository.sync_target.create` in Auditoria.

Registration is local only and sends no request to GitHub. Duplicate full names are rejected case-insensitively. A missing project or failed audit insertion creates no repository row.

## Pause or reactivate a target

1. open the repository card in DevOS → Operação;
2. choose pause or reactivate;
3. provide a reason and confirm;
4. verify the page reloads from persisted state;
5. inspect `repository.sync_target.disable` or `repository.sync_target.enable` in Auditoria.

Pausing changes only `sync_enabled` and `updated_at`. The target remains visible, but is excluded from the next run. Observations, recommendations and branch decisions are not deleted.

## GitHub synchronization is partial

A partial run means useful evidence was persisted while at least one target or branch lookup failed.

1. inspect normalized warnings and the reset timestamp;
2. do not repeatedly trigger reads during a rate-limit window;
3. verify token repository selection and read permissions;
4. retain successful observations as evidence;
5. retry only after the provider condition is resolved.

After a branch commit lookup is rate-limited, later commit lookups for that target are not attempted. Unexpected provider exceptions are contained per target so the parent run can still finish honestly.

## Accept a branch recommendation

1. compare **Branch ativa persistida** with **Recomendação observada**;
2. read confidence, reason and warnings;
3. open the acceptance form only when the evidence matches the intended development line;
4. provide a concrete reason and confirm that this changes DevOS only;
5. verify the card reloads after the committed response;
6. inspect `repository.active_branch.accept` in Auditoria.

The server reloads the latest recommendation ID and repository state. A newer recommendation, concurrent branch change, unavailable recommendation, default-branch no-op or failed audit insert leaves `active_branch` unchanged. Do not bypass a conflict with direct SQL.

## GitHub synchronization fails entirely

- token absent: configure `SEMOGTW_GITHUB_TOKEN` server-side;
- unauthorized/forbidden: rotate or narrow the token and verify repository selection;
- not found: verify canonical `owner/name` and private access;
- rate limited: wait for `rate_limit_reset_at`; do not add tight retries;
- invalid response: verify the configured API version and provider contract;
- transport failure: verify runtime DNS, TLS and outbound access;
- storage failure: verify migrations `0001`–`0004`, foreign keys and SQLite write access.

A failed run must not change role, status, `sync_enabled`, `active_branch`, project progress or stage state.

## Migration `0004_github_sync_runs.sql` fails

`0004` extends the legacy table; it does not replace it.

1. verify `0001_foundation.sql` was applied first;
2. inspect `PRAGMA table_info(sync_runs)`;
3. confirm the legacy columns still exist: `trigger`, `repositories_checked`, `changes_applied`;
4. confirm the new columns exist: `integration`, detailed counters, rate-limit fields and `metadata_json`;
5. confirm `_semogtw_migrations` contains `0004_github_sync_runs.sql` only after the full SQL succeeds;
6. restore the pre-migration backup if the transaction failed;
7. never manually mark the migration as applied.

New GitHub runs populate both field generations. Legacy rows receive `integration = legacy` and a migration marker in metadata.

## Rotate the GitHub token

1. create a replacement with the same or narrower repository scope;
2. update the runtime secret;
3. restart/redeploy;
4. revoke the previous token;
5. run one controlled read;
6. verify no token appears in HTML, logs, database fields, MCP payloads or audit snapshots;
7. rerun anonymous confidentiality checks.

## Create a verified database backup

The destination must not exist; overwrite is refused.

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw-2026-08-01.sqlite
```

A successful result includes integrity, foreign-key status, migration names, size and page counts. Current backups must include migrations `0001` through `0004`.

The command does not upload, encrypt, rotate or delete backups. Store the file in owner-controlled encrypted storage and never commit it.

## Verify or restore a database backup

```bash
pnpm verify:backup -- ./backups/semogtw-2026-08-01.sqlite
pnpm verify:backup -- ./backups/semogtw-2026-08-01.sqlite ./data/semogtw.sqlite
```

Restore rehearsal:

1. stop writes;
2. verify the backup and its four migrations;
3. copy it to a new temporary path;
4. start the application against that path;
5. run authenticated reads, Operations checks and confidentiality scanners;
6. construct the in-process MCP server against the restored database and run read-only smoke calls;
7. replace production only after a fresh pre-restore backup and successful rehearsal.

Do not restore across an unreviewed migration mismatch.

## Public data leak suspected

1. stop public deployment or restrict access immediately;
2. preserve the offending response privately as evidence;
3. inspect HTML, loader/API payloads, MCP transport responses, metadata, sitemap, robots, caches and logs;
4. revoke exposed credentials;
5. repair the query/DTO/transport authorization boundary rather than hiding fields client-side;
6. add a synthetic regression marker;
7. rerun all anonymous confidentiality gates;
8. document the incident and remediation.

Repository targets, names, URLs, branches, recommendations, run metadata and MCP payloads are private operational data.

## Session secret rotation

1. update the host secret;
2. revoke/delete active sessions;
3. redeploy the reviewed version;
4. confirm old cookies are denied;
5. confirm login creates a new session and CSRF token;
6. record the rotation date without storing the value.

## Rollback

Use the commit/version and schema backup recorded in `DEPLOYMENT.md`. Never roll code back across an incompatible migration. Prefer feature disablement and a forward repair migration when schema rollback is unsafe.

To disable GitHub reads without deleting evidence, remove `SEMOGTW_GITHUB_TOKEN` and restart. Existing targets, observations, recommendations, branch decisions and audits remain private historical state.

The current MCP adapter has no enabled transport to disable. If a future transport is deployed, its adapter must provide an independent feature-disable/rollback mechanism without deleting the canonical read services or data.
