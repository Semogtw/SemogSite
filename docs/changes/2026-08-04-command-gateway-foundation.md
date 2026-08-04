# 2026-08-04 — Command Gateway editability foundation

## Added

- framework-free `@semogtw/application` command package;
- strict command registry, resource binding and monotonic owner-browser risk policy;
- canonical JSON and host-neutral Web Crypto SHA-256 preparation;
- durable SQLite command receipts with semantic idempotency, replay, lease recovery and immutable final states;
- transaction-bound synchronous SQLite command executor coupling state, audit and receipt;
- `attention.transition` as the first owner-browser command migrated end to end;
- `roadmap.stages.complete` registered as high-risk and blocked pending real DevOS approvals;
- shared editability catalog, semantic manifests and static coverage guardrail;
- owner-only resource-filtered action discovery and human DevOS disclosures;
- package/application boundary checks and explicit package subpaths;
- focused E2E specification for privacy, Attention parity and blocked Stage visibility.

## Security properties

- ordinary clients cannot select command handlers, capabilities, principals or risk;
- client confirmation cannot authorize high/critical commands;
- client-provided approval IDs are ignored without a verified approval executor;
- receipts persist hashes and bounded summaries, not raw payloads, cookies, tokens or secrets;
- recovered leases retain original receipt and correlation identity;
- missing/terminal/denied resources return indistinguishable empty action discovery;
- no MCP write, generic SQL, shell, filesystem, Git or HTTP mutation is enabled.

## Verification state

The implementation and tests are committed, but no exact-head test, typecheck, build or Playwright run was observed in the connected session. `pnpm-lock.yaml` also remains pending regeneration for the new workspace importer and dependency edge. PR #26 remains draft.

See:

- `docs/architecture/EDITABILITY_COVERAGE.md`
- `docs/testing/2026-08-04-command-gateway-test-matrix.md`
- `docs/testing/2026-08-04-command-gateway-progress.md`
