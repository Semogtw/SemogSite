# Agent write authorization progress — 2026-08-05

## Handoff snapshot

- Repository: `Semogtw/SemogSite`
- Branch: `develop/agent-write-authorization-implementation`
- Session base: `bdb3875efbd65b563bd10a5ce5b8bc388d71d304`
- Snapshot head before this handoff commit: `7ec6df6d890786a9e0b559c1c9b65e7d128ade1a`
- Commits since the session base: 101
- Branch protection/status checks at the snapshot head: no required checks and no combined commit statuses reported
- Pull request: #27 remains the integration PR for this branch

This session continued the provider-neutral authorization foundation in `@semogtw/application`. Work was deliberately split into small test-first and implementation commits so that progress remained pushed even if the execution environment reset.

## Delivered in this session

### Public authorization surfaces

The authorization request and mutation planners are now exposed consistently from:

- their source modules;
- `packages/application/src/authorization/index.ts`;
- `packages/application/src/authorization/operations.ts`, where applicable;
- `packages/application/src/index.ts`.

Barrel tests pin the public availability of the new functions so a future refactor cannot silently make them internal-only.

### Owner and system lifecycle planners

The application layer now has pure, provider-neutral plans for:

- owner-only grant creation with `active` status and version `1`;
- owner-only grant replacement under compare-and-swap versioning;
- owner-only grant availability transitions restricted to `active <-> suspended`;
- owner-only grant revocation with dependent trust-session invalidation;
- system-only grant expiration with dependent trust-session invalidation;
- owner-only client revocation with grant, trust-session, and challenge cascades;
- owner-only trust-session creation;
- owner-only trust-session revocation;
- versioned trust-session operation consumption.

Grant revision replaces the whole authorization policy instead of applying an ambiguous partial patch. Owner and client identities are immutable, the current `active`/`suspended` availability state is preserved, and all trust sessions derived from the previous grant policy are explicitly invalidated.

Grant revocation is intentionally separate from the ordinary availability-transition path. This prevents callers from bypassing the trust-session cascade by using a generic status update.

Automatic expiration is intentionally system-only. It requires a canonical timestamp at or after the configured expiry, preserves `revoked` as a distinct terminal state, and returns no plan when expiration was already persisted.

### Atomic persistence port

`createAgentAuthorizationMutationExecutor` and `AgentAuthorizationMutationRepository` define a database-provider-neutral transaction boundary for:

- `grant.create`;
- `grant.transition`;
- `grant.expire`;
- `grant.revise`;
- `grant.revoke`;
- `trust.create`;
- `trust.consume`;
- `trust.revoke`;
- `client.revoke`.

Each repository method must execute as one atomic transaction. The executor validates the adapter result and rejects:

- partial cascades reported as successful;
- over-broad writes;
- rows written alongside conflict/not-found outcomes;
- semantically impossible outcomes, such as `not_found` during creation or an unbound replay claim during trust consumption.

A successful result must report the exact number of rows implied by its plan. Cascading grant and client operations include every dependent row in that count.

### Defensive boundary hardening

The authorization layer now centralizes deterministic deep copies of resource-selector maps so created grants and trust sessions do not retain mutable caller-owned arrays.

`normalizeBoundedUniqueIds` centralizes bounded ID-list validation and sorting. It rejects:

- non-arrays;
- sparse arrays;
- duplicate IDs;
- empty, padded, or overlong IDs;
- excessive item counts;
- contradictory bounds;
- accessor-backed entries without invoking their getters.

The helper now supports minimum cardinality and is used by grant/client cascades, grant revision/expiration, grant request capability validation, explicit `all` resource-kind acknowledgements, and trust-session base grant IDs.

This closes a JavaScript edge where `Array.prototype.every()` can skip missing elements and where ordinary indexed access can execute hostile getters at an authorization boundary.

### Validation consistency and version safety

Owner-only planners now consistently apply this precedence:

1. require the correct actor kind;
2. validate supplied material;
3. verify exact owner binding.

The grant lifecycle also rejects `Number.MAX_SAFE_INTEGER` as a current optimistic version, because incrementing it would produce an unsafe next version.

## Verification performed

### Concrete TypeScript verification

A minimal package was assembled locally from the changed source files and their direct type dependencies. It used TypeScript `5.8.3` and the repository's strict compiler options, including:

- `strict`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `noImplicitOverride`;
- `noFallthroughCasesInSwitch`;
- `noPropertyAccessFromIndexSignature`;
- `useUnknownInCatchVariables`.

The following minimal checks completed without diagnostics:

1. new lifecycle planners and the mutation executor;
2. the hardened ID-list, grant-request, and trust-session-request sources;
3. the authorization array-boundary regression test using a local declaration stub for the Vitest API.

This is real TypeScript checking of the changed implementations, but it is not equivalent to the full workspace typecheck because the repository could not be cloned and package dependencies could not be installed in this environment.

### Full gates not executed

A full checkout attempt failed with:

```text
fatal: unable to access 'https://github.com/Semogtw/SemogSite.git/': Could not resolve host: github.com
```

The container has Node.js `22.17.0`, npm `10.9.2`, TypeScript `5.8.3`, and git `2.39.5`, but `pnpm` is not installed. GitHub remains reachable only through the connected GitHub tool, which can read and commit files but does not provide a runnable workspace.

Consequently, these authoritative package gates remain pending on a complete checkout:

```bash
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application build
```

The package scripts resolve respectively to `tsc --noEmit`, `vitest run`, and `tsc -p tsconfig.build.json`.

No GitHub status checks were associated with the snapshot head, so absence of failing CI must not be interpreted as a passing CI run.

## Recommended next implementation steps

1. Run the complete application package gates above and fix any integration-only diagnostics not visible to the minimal typecheck.
2. Implement the database adapter for `AgentAuthorizationMutationRepository`, preserving each method as one transaction and every plan version as a compare-and-swap predicate.
3. Add the database schema/migration for clients, grants, trust sessions, confirmation challenges, credential material, and the indexes needed by owner/client/version lookups.
4. Implement credential generation and one-way secret hashing without exposing raw secret material beyond the one-time creation response.
5. Connect the owner DevOS authorization UI to the pure planners and persistence port.
6. Connect OAuth/MCP authorization resolution to the same grant and trust-session records, keeping owner UI and MCP writes on the shared command/policy path.
7. Review nested selector arrays (`ids`, `prefixes`, and lifecycle `states`) for the same sparse/accessor-backed input class already closed for top-level authorization arrays.
8. Add integration tests for concurrent compare-and-swap races, rollback of partial cascades, and repeat revocation/expiration requests.

## Important invariants for the next agent

- Do not let MCP clients create, revise, suspend, reactivate, revoke, or expire their own grants.
- Do not route grant revocation through the non-cascading availability transition.
- Do not persist a successful cascade unless every expected row was changed in the same transaction.
- Do not reuse an existing trust session after any base grant is revised, revoked, or expired.
- Do not infer idempotent replay from current state alone; bind replay to an explicit idempotency record before returning `already_applied` for non-terminal mutations.
- Do not retain caller-owned mutable arrays or invoke accessors while validating authorization input.
- Keep all owner UI and MCP mutations behind the same command, policy, confirmation, audit, and receipt contracts.
