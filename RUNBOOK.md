# Runbook

## Build or checks fail

1. confirm Node.js 22 and pnpm 10.14;
2. remove only generated artifacts when necessary: `node_modules`, `.tanstack`, `.output`, `dist`;
3. run `corepack enable` and `pnpm install --frozen-lockfile`;
4. verify the native artifact:

   ```bash
   test -f node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/better_sqlite3.node
   ```

5. run guardrails and package typechecks to isolate the first failure;
6. run `pnpm check` and the relevant focused suite;
7. run the production build and record the exact output;
8. change the lockfile policy only after a reviewed dependency change, never as a convenience fix.

The CI allowlist for `better-sqlite3` is appended only to a discarded checkout. Do not commit a broad native-build allowlist without review.

## DevOS redirects to login repeatedly

Check without printing values:

- `SEMOGTW_OWNER_PASSWORD_HASH` exists and uses the supported format;
- `SEMOGTW_SESSION_SECRET` has at least 32 characters;
- the SQLite path is writable;
- migrations include `owner_accounts` and `auth_sessions`;
- cookie path, `Secure` policy and HTTPS match the runtime;
- the session has not expired or been revoked;
- server composition configured the intended auth provider.

Missing or invalid configuration must remain fail-closed.

## Operate workflow orchestration

Private routes:

```text
/devos/workflows
/devos/workflows/recovery
```

### Reserve a scope

1. register or verify the repository target in DevOS → Operação;
2. open DevOS → Fluxos;
3. select the persisted repository and effective branch;
4. choose scope kind and normalized paths/identifiers;
5. state a concrete purpose and bounded duration;
6. review any overlap warning;
7. confirm explicitly and submit;
8. verify the reservation appears with an expiry and inspect Auditoria.

A reservation is a cooperative soft lease, not a Git/filesystem lock. Do not use direct SQL to bypass overlap or history.

### Override a reservation

Use override only when ownership must be explicitly reclaimed.

1. locate an active persisted reservation;
2. provide a concrete reason;
3. confirm preservation of history;
4. submit with the current expected version;
5. verify the record becomes inactive/overridden and the control disappears;
6. inspect the reservation event and global audit entry.

A stale version or mismatched reservation identity must be rejected. Refresh instead of retrying with altered hidden IDs.

### Register a verification obligation

1. select the repository and branch;
2. enter a full 40-character commit SHA;
3. name the gate and preserve the exact command;
4. declare required runtime capabilities;
5. record the responsible actor and next safe action;
6. confirm that the entry is pending, not passed;
7. inspect the persisted obligation and audit event.

Do not use an abbreviated SHA or claim that an unavailable environment passed.

### Record a verification result

1. execute or directly observe the gate in the stated environment;
2. choose `passed`, `failed` or `blocked`;
3. for `failed`/`blocked`, choose the explicit classification;
4. enter an observed summary, HTTPS evidence when available and next action;
5. confirm that the result was actually observed;
6. submit against the current version;
7. verify the terminal/non-terminal state and audit history.

Use `environment_missing` for a missing runtime/toolchain. Do not select `code_failure` merely because execution was impossible.

### Re-evaluate next safe work

The initial dashboard assumes no runtime capabilities.

1. type only capabilities actually available in the current runtime;
2. choose a bounded default work duration;
3. re-evaluate;
4. read recommendation reasons and all source/evaluator exclusions;
5. treat the result as a decision aid, not proof that work started or finished.

Capabilities entered here are session-only and are not persisted.

### Generate a recovery snapshot

1. first synchronize/observe the accepted GitHub branch;
2. open DevOS → Fluxos → Snapshot de recuperação;
3. select the persisted repository target;
4. enter the exact next action and continuation prompt context;
5. optionally provide plan/toolchain metadata;
6. confirm and generate;
7. verify the branch, full SHA, source timestamp, confidence and SHA-256 hash;
8. copy the Markdown or use manual text selection when clipboard access is denied.

If the accepted branch lacks a persisted GitHub observation, generation must fail closed. Synchronize the provider; never substitute the default branch or invent a SHA.

Recent snapshots are immutable. Reuse a historical handoff rather than creating a cosmetic duplicate.

## Workflow route or browser gate fails

Run:

```bash
node scripts/prepare-e2e.mjs
pnpm exec playwright test tests/e2e/workflow-orchestration.spec.ts
```

The focused browser suite must verify:

- anonymous redirects before private content;
- no workflow markers on the public home;
- authenticated navigation to both routes;
- 360 × 800 no-overflow behavior;
- explicit capability evaluation;
- target registration, reservation creation/override and gate result recording;
- recovery fail-closed without GitHub observation.

When Playwright reports strict-mode ambiguity, scope the locator to the responsible form/article or select by semantic role and exact accessible name. Do not weaken the behavior assertion.

## Configure GitHub read synchronization

1. create a fine-grained token restricted to the smallest repository set;
2. grant Metadata read and Contents read only;
3. store it as `SEMOGTW_GITHUB_TOKEN` in the server secret store;
4. never place the value in `.env.example`, browser fields, logs or audit data;
5. restart the server and open DevOS → Operação;
6. register a target through the audited UI;
7. run one confirmed observation cycle;
8. inspect normalized runs, warnings, rate limits and recommendations.

No GitHub write permission is required or implemented.

## Register, pause or reactivate a repository target

Use DevOS → Operação, not direct SQL.

Registration requires an existing project, canonical `owner/repository`, expected default branch, canonical role, reason and confirmation. The target is local/manual until a provider read verifies it. Duplicates are rejected case-insensitively.

Pause/reactivation changes only `sync_enabled` and `updated_at`. Historical observations, active branch and decisions remain. Provide a reason, confirm, reload persisted state and inspect Auditoria.

## GitHub synchronization is partial or failed

A partial run preserves useful evidence while reporting at least one provider/branch failure.

- token absent: configure the server secret;
- unauthorized/forbidden: verify token scope and repository selection;
- not found: verify canonical identity and private access;
- rate limited: wait until the persisted reset time; do not add tight retries;
- invalid response: verify provider contract/API version;
- transport failure: verify DNS, TLS and outbound access;
- storage failure: verify migrations `0001`–`0013`, foreign keys and write permissions.

A failed/partial run must not automatically change role, lifecycle, sync flag, active branch, project progress, stage state or publication state.

## Accept a branch recommendation

1. compare persisted active branch with observed recommendation;
2. review confidence, reasons and warnings;
3. provide a concrete local-decision reason;
4. confirm that only DevOS state changes;
5. submit against the expected current branch;
6. verify route reload and `repository.active_branch.accept` audit.

The server reloads the latest recommendation. Stale/unavailable evidence, a concurrent branch change, default-branch no-op or audit failure leaves state unchanged.

## MCP read adapter

The current MCP implementation is an in-process server factory, not a deployed endpoint.

Run:

```bash
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp-app typecheck
```

The approved catalog remains four resources and five read-only tools for Overview, Today, Projects and Roadmap. No mutation tool or transport listener should be discoverable.

Do not expose MCP remotely without a dedicated reviewed plan covering authentication, authorization, TLS, origin/host policy, isolation, limits, rate limiting, private caching, logging, cancellation, secret rotation and rollback.

## Create and verify a database backup

The destination must not exist.

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw-2026-08-03.sqlite
pnpm verify:backup -- ./backups/semogtw-2026-08-03.sqlite ./data/semogtw.sqlite
```

A valid backup must pass integrity and foreign-key checks and contain the exact migrations `0001`–`0013`. It includes authentication digests, private operational data, reservations, gates, snapshots, audits and editorial drafts.

The command does not encrypt, upload, rotate or delete backups. Store them in owner-controlled encrypted storage and never commit them.

### Restore rehearsal

1. stop writes;
2. create a fresh pre-restore backup;
3. verify the candidate backup and all 13 migrations;
4. copy it to a temporary path;
5. start the application against the temporary database;
6. perform authenticated DevOS reads and workflow smoke tests;
7. run public confidentiality scanners;
8. verify MCP read-only smoke calls in-process;
9. replace production only after the rehearsal succeeds.

Do not roll code backward across an incompatible schema. Prefer feature disablement and reviewed forward repair when reverse migration is unsafe.

## Public data leak suspected

1. stop/restrict public deployment immediately;
2. preserve the offending response privately;
3. inspect HTML, loader/API payloads, metadata, sitemap, caches, logs and any enabled transport;
4. revoke exposed credentials;
5. repair the query/DTO/auth boundary rather than hiding fields client-side;
6. add a synthetic regression marker;
7. rerun scanners, anonymous Playwright and production build;
8. document the incident and remediation.

Repository identities, branches, runs, reservations, gates, snapshots, capability declarations and MCP payloads are private.

## Secret rotation

For session-secret or owner-password rotation:

1. update the runtime secret/hash;
2. revoke active sessions;
3. redeploy/restart the reviewed version;
4. verify old cookies fail;
5. verify new login and CSRF behavior;
6. record the date without storing the value.

For GitHub token rotation, replace with the same or narrower scope, restart, revoke the old token, run one controlled read and rerun confidentiality checks.

## Rollback

Record the exact code commit, migration set and backup in `DEPLOYMENT.md`. Never claim rollback readiness without a compatible code/schema pair.

GitHub reads can be disabled by removing `SEMOGTW_GITHUB_TOKEN` and restarting; historical evidence remains. The current MCP adapter has no listener to disable. Workflow orchestration can remain private and manual without schedulers or external agents.