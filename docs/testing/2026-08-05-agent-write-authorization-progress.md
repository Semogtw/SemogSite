# Agent write authorization progress — 2026-08-05

## Handoff snapshot

- Repository: `Semogtw/SemogSite`
- Branch: `develop/agent-write-authorization-implementation`
- Session base: `bdb3875efbd65b563bd10a5ce5b8bc388d71d304`
- Fully verified code head: `f3725d057cc5c2b1f0690654a5a1fd01ca2305fe`
- Pull request: #27 remains the integration PR for this branch
- Temporary write workflow: removed from the verified head

This branch continues the provider-neutral authorization foundation in `@semogtw/application`. Work remains split into small pushed commits so resets do not discard substantial progress.

## Delivered authorization behavior

### Grant and trust lifecycle

The application layer now has pure plans for:

- owner-only grant creation at version `1`;
- owner-only whole-policy grant revision under compare-and-swap versioning;
- owner-only `active <-> suspended` availability transitions;
- owner-only grant revocation with dependent trust-session invalidation;
- system-only grant expiration with dependent trust-session invalidation;
- owner-only client revocation with grant, trust-session, and challenge cascades;
- owner-only trust-session creation and revocation;
- versioned trust-session operation consumption.

Grant revision preserves immutable owner/client identity, replaces rather than partially patches authorization policy, and invalidates every derived trust session. Grant revocation stays separate from the non-cascading availability transition so callers cannot bypass trust invalidation.

### Atomic persistence contract

`createAgentAuthorizationMutationExecutor` and `AgentAuthorizationMutationRepository` define provider-neutral atomic operations for:

- `grant.create`;
- `grant.transition`;
- `grant.expire`;
- `grant.revise`;
- `grant.revoke`;
- `trust.create`;
- `trust.consume`;
- `trust.revoke`;
- `client.revoke`.

The executor rejects partial cascades, over-broad writes, writes attached to conflict/not-found outcomes, and semantically impossible mutation results. Successful cascades must report exactly the row count implied by the plan.

## Defensive boundary hardening

The authorization and command layers now fail closed against hostile JavaScript input patterns:

- sparse arrays;
- accessor-backed array entries;
- accessor-backed selector maps;
- replaced `includes`, `some`, or iterator methods;
- duplicate, padded, overlong, or excessive IDs;
- mutable caller-owned selector arrays;
- malformed command resource bindings with extra fields or accessors.

The following shared boundaries were added or expanded:

- `normalizeBoundedUniqueIds`;
- `readOwnDataArray`;
- `sanitizeResourceSelectorMapBoundary`;
- `sanitizeTrustSessionRequestBoundary`;
- `sanitizeEffectiveAgentAuthorizationBoundary`.

Created and revised grants, trust-session requests, effective authorization clauses, capability selector maps, and nested selector values are copied into deterministic own-data structures before use. Resource matching operates on normalized copies rather than caller-provided methods.

Owner-only planners consistently apply this validation order:

1. require the correct actor kind;
2. validate supplied material;
3. verify exact owner binding.

Grant versioning also rejects any state whose next optimistic version would exceed the safe integer range.

## Lockfile correction

A real frozen-offline install found that `packages/database/package.json` declared `@semogtw/application: workspace:*`, while the `packages/database` importer in `pnpm-lock.yaml` omitted it.

The lockfile was synchronized in commit:

- `bd92e7666caf6d933e71ca1fb58c3dc5769bf8ee` — `chore: sync application workspace lock`

The commit changed only `pnpm-lock.yaml` and inserted:

```yaml
'@semogtw/application':
  specifier: workspace:*
  version: link:../application
```

A temporary branch-scoped one-shot workflow was used because GitHub's contents API cannot safely patch the 153 KB lockfile incrementally. The workflow was removed immediately afterward in:

- `f3725d057cc5c2b1f0690654a5a1fd01ca2305fe` — `chore: remove one-shot lock synchronizer`

The verified head contains the lock entry and does not contain the temporary workflow.

## Authoritative verification evidence

### Offline toolchain

The public SemogSite toolchain was rebuilt by `Semogtw/Offline-Toolchains`:

- workflow run: `30986518272`;
- aggregate archive SHA-256: `ddd103de2ae8b2bb5065f3d934686d72ea1101306e09cfb6ab09f8dd76ef7026`;
- validated tools used for package gates: Node.js 22, TypeScript `5.9.3`, Vitest `2.1.9`;
- reference tool fixture installation: 412 packages reused, zero downloads.

The exact verified source was restored from the encrypted private bundle:

- source workflow run: `30988908104`;
- artifact digest: `sha256:432622a20afd0844f4f43f2187a6231c386209ef709c4c45cf75c9de8fa7e338`;
- repository bundle SHA-256: `a3ae3a37b3f604e9ad7b9bab01d6ac9f62033b4b412345449a52cc59bdaa3ac0`;
- manifest resolved commit: `f3725d057cc5c2b1f0690654a5a1fd01ca2305fe`;
- restored checkout status before gates: clean.

### Package gates on exact published head

The following gates were run against the restored `f3725d057...` checkout:

```bash
node node_modules/typescript/bin/tsc -p packages/application/tsconfig.json --noEmit

cd packages/application
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts
node ../../node_modules/typescript/bin/tsc -p tsconfig.json
```

Results:

- TypeScript typecheck: **PASS**, no diagnostics;
- Vitest: **PASS**, 59 files and **433/433 tests**;
- declaration/build output: **PASS**, 304 generated files;
- repository status after removing local tool links/build output: clean.

### Remaining full-monorepo limitation

A full frozen offline monorepo installation remains blocked by exact artifact gaps in the public store, including versions such as `tsx@4.23.1` and `@playwright/test@1.62.1`. No dependency versions were forced or upgraded to conceal this limitation.

This does not invalidate the application package evidence above: the exact source head was restored from a private bundle and the application package was typechecked, fully tested, and built with a validated offline tool fixture.

## Recommended next implementation steps

1. Harden the public functions in `trust-session.ts` so direct callers receive the same own-data boundary guarantees already enforced by the creation planner.
2. Implement the database adapter for `AgentAuthorizationMutationRepository`, preserving transaction atomicity and compare-and-swap predicates.
3. Add schema/migrations for clients, grants, trust sessions, confirmation challenges, credential material, and owner/client/version indexes.
4. Add integration tests for CAS races, complete rollback of partial cascades, and repeated terminal requests.
5. Implement one-time credential generation with one-way hashing and no later raw-secret exposure.
6. Connect owner DevOS and OAuth/MCP authorization resolution to the same persisted command/policy path.
7. Refresh the SemogSite Toolchains store so the complete monorepo frozen install covers the lockfile's exact versions.

## Invariants for continuation

- MCP clients cannot create, revise, suspend, reactivate, revoke, or expire their own grants.
- Grant revocation cannot use the non-cascading availability transition.
- Cascades succeed only when every expected row changes in the same transaction.
- A trust session cannot survive revision, revocation, or expiration of any base grant.
- Replay is never inferred from current state alone without an explicit idempotency binding.
- Authorization boundaries do not retain caller-owned mutable arrays or execute caller accessors/methods.
- Owner UI and MCP mutations remain behind shared command, policy, confirmation, audit, and receipt contracts.
