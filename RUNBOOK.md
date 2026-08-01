# Runbook

## Application does not build

1. confirm Node.js 22+ and pnpm 10;
2. remove only generated artifacts: `node_modules`, `.tanstack`, `.output`, `dist`;
3. run `pnpm install`;
4. run `pnpm check:upstream-clean` and `pnpm check:boundaries` separately;
5. run package typechecks to isolate the first failing workspace;
6. consult current official documentation before changing TanStack Start, Hono or Drizzle APIs;
7. record the exact failure and fix in `CHANGELOG.md`.

Do not use GitHub Actions as the default substitute for a local dependency environment.

## DevOS redirects to login repeatedly

Check, without printing values:

- `SEMOGTW_OWNER_PASSWORD_HASH` exists;
- `SEMOGTW_SESSION_SECRET` has at least 32 characters;
- database path is writable;
- migrations include `owner_accounts` and `auth_sessions`;
- web runtime called `configureWebAuth` with the local/provider adapter;
- cookie path, Secure policy and HTTPS match the current environment;
- session has not expired or been revoked.

Missing configuration should keep failing closed.

## Login always fails

1. generate a fresh encoded hash with `pnpm hash-owner-password`;
2. update the runtime secret store, not source files;
3. restart/redeploy the server;
4. verify rate limit has expired or use a fresh controlled client;
5. never compare or log the raw password.

## Create a verified database backup

Choose source and destination explicitly. The destination must not exist; the command refuses overwrite.

```bash
pnpm backup:database -- ./data/semogtw.sqlite ./backups/semogtw-2026-08-01.sqlite
```

A successful command prints JSON containing:

- destination path;
- SQLite `integrity_check` result;
- zero foreign-key violations;
- applied migration names;
- file size and backup page counts.

The backup is local only. The command does not upload, encrypt, rotate or delete files. Store the resulting file in owner-controlled encrypted storage and apply a retention policy outside the repository. Never commit database or backup files.

## Verify or restore a database backup

Verify the file by itself:

```bash
pnpm verify:backup -- ./backups/semogtw-2026-08-01.sqlite
```

Compare its migration state with the current source database:

```bash
pnpm verify:backup -- ./backups/semogtw-2026-08-01.sqlite ./data/semogtw.sqlite
```

For a restore rehearsal:

1. stop writes to the target environment;
2. verify the backup with the command above;
3. copy it to a new temporary path rather than overwriting the live database;
4. start the application against the temporary path;
5. run authenticated read checks and the confidentiality scanners;
6. only replace the production path after the rehearsal succeeds and a fresh pre-restore backup exists.

Do not restore across an unreviewed migration mismatch. The CLI removes a newly created backup when post-backup verification fails, but it never deletes an existing source or verified destination.

## Public data leak suspected

1. stop public deployment or restrict access immediately;
2. preserve the offending response privately as evidence;
3. identify whether it came from HTML, loader data, API, metadata, sitemap, robots, cache or logs;
4. revoke exposed tokens/credentials if any;
5. fix the query/DTO boundary rather than adding a client-side hide;
6. add a regression test with a synthetic private marker;
7. rerun all anonymous confidentiality gates;
8. document the incident and remediation.

## Migration fails

- do not continue with partial manual edits;
- roll back the transaction or restore the pre-import backup;
- retain source checksum and diagnostics;
- correct mapping/validation in the importer;
- rerun preview before confirmation.

## GitHub sync fails in future phases

- retain last valid persisted state;
- mark data as stale with timestamp;
- record a failed/partial `sync_run`;
- inspect authentication and rate-limit state without printing tokens;
- retry with backoff;
- create an attention item after the configured failure threshold.

## Session secret rotation

1. update the host secret;
2. revoke/delete active sessions;
3. redeploy the reviewed version;
4. confirm old cookies are denied;
5. confirm login creates a new session and CSRF token;
6. record the rotation date without storing the value.

## Rollback

Use the commit/version and schema backup recorded in `DEPLOYMENT.md`. Never roll code back across an incompatible destructive migration. Prefer feature disablement and a forward repair migration when a direct schema rollback is unsafe.
