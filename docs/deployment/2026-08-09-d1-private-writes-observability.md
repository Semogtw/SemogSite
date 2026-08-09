# D1 private writes and sanitized observability — August 9, 2026

## Status

`main` now contains the first two private DevOS mutations that are intentionally portable across the Node/SQLite and Cloudflare Worker/D1 compositions:

```text
POST /api/v1/private/attention
POST /api/v1/private/evidence
```

Both routes reuse the existing domain services instead of introducing Worker-specific business rules. They inherit the shared private HTTP boundary in this order:

1. browser same-origin / Fetch Metadata guard;
2. owner-session authentication;
3. shared CSRF verification for unsafe private methods;
4. bounded JSON request parsing;
5. domain validation and confirmation;
6. audited persistence.

This reduces the split-runtime gap, but it does **not** make the DevOS fully Worker-write-capable. Mutation families with optimistic concurrency, idempotency or richer multi-row invariants remain on the Node/SQLite reference path until equivalent D1 semantics are proved.

## Attention capture

The Worker composition uses:

```text
AttentionCaptureService
  -> D1AttentionCaptureRepository
```

The D1 repository submits the canonical `attention_items` row and mandatory `audit_events` row in one D1 batch. The domain remains authoritative for normalization, confirmation and owner derivation.

The API boundary limits the body to 8 KiB and accepts only JSON media types. Project-less capture remains intentional and matches the existing quick-capture UI path. Storage errors are converted to a sanitized `503` and never expose D1 details.

### Lifecycle deliberately not ported yet

Resolve/dismiss attention transitions were inspected but were **not** copied naively to D1. The SQLite repository performs optimistic concurrency using the expected status and `updated_at`, and it records the audit event only when exactly one row changes.

A simple D1 batch could weaken that guarantee by allowing the audit statement to execute after a lost update race. The lifecycle therefore remains a promotion gap until a conditional/atomic D1 strategy is demonstrated by an executable test. Preserving the invariant is more important than claiming superficial route parity.

## Manual evidence

The Worker composition uses:

```text
EvidenceService
  -> D1EvidenceWriteRepository
```

Manual evidence and its audit event are submitted together through D1 batch. The existing `EvidenceService` still validates:

- project/stage identifiers;
- allowed evidence kinds and statuses;
- bounded text fields;
- confirmation;
- ISO timestamps;
- HTTPS URLs;
- absence of URL credentials.

The API boundary limits the body to 16 KiB and accepts only JSON media types. `occurredAt` is generated server-side, matching the existing Node server action.

## Shared private CSRF boundary

`apps/api/src/middleware/csrf.ts` now protects every unsafe method mounted below `/api/v1/private/*` after owner authentication. Future private mutation routes inherit the policy automatically instead of implementing independent CSRF checks.

Safe methods (`GET`, `HEAD`, `OPTIONS`) are not blocked by CSRF. Unsafe methods fail closed with a sanitized `403 CSRF_INVALID` when the session secret, owner session, CSRF cookie or `X-CSRF-Token` pair is unavailable/invalid.

This middleware complements, rather than replaces, the same-origin and `Sec-Fetch-Site` checks.

## Privacy-safe request observability

The shared API now supports an optional request observer. The default console implementation is enabled only when:

```text
SEMOGTW_REQUEST_LOGGING=1
SEMOGTW_REQUEST_LOGGING=true
SEMOGTW_REQUEST_LOGGING=enabled
```

The value comparison is case-insensitive and trims surrounding whitespace. All other values, including an unset variable, leave request logging disabled.

The Node entrypoint passes `process.env` to the SQLite composition, and the Worker binding exposes the same variable. The D1 runtime cache fingerprint includes the logging on/off state so a cached runtime cannot silently reuse the wrong observability policy.

### Allowlisted event shape

A request observation contains only:

```text
correlationId
method
scope
status
durationMs
```

`scope` is intentionally coarse:

```text
health | ready | public | auth | private | unknown
```

The observer type has no fields for raw URL, query string, route parameters, slug, branch, headers, cookies, IP address, authorization material, request body, response body, private DTOs or exception text.

Tests inject fake private slugs, query values, bearer tokens, cookies and storage exception details and assert that none are present in the emitted record. Observer failures are swallowed so logging cannot change the request outcome.

This is an application-level baseline only. Cloudflare log retention, sampling, destination access control and any platform-generated request metadata still require explicit preview/production review.

## Worker boundary guard

`pnpm check:cloudflare-worker-boundary` now pins explicit Worker-safe exports for both write adapters:

```text
@semogtw/database/d1-attention-capture
@semogtw/database/d1-evidence-write
```

The guard continues to reject the SQLite-capable `@semogtw/database` barrel and Node built-ins from Worker composition. Fixture tests fail if either write subpath disappears from the package exports or Worker composition.

## Exact-SHA CI evidence

Heavy checkout/testing is intentionally executed through `Semogtw/Offline-Toolchains` rather than recreated in the private repository.

The following checkpoints completed successfully:

### `cadacee9ecfeb75bfeaf520c20889e32b895365b`

Covered the first D1 attention mutation and shared private CSRF boundary. Public toolchain run `31290787259` completed:

- private disposable checkout;
- frozen install;
- native SQLite verification;
- package and confidentiality boundaries;
- focused orchestration/domain/database/web checks;
- full `pnpm check`;
- production web build;
- isolated E2E database preparation;
- Chromium/Playwright privacy and mobile-navigation tests.

### `7a3de4ef57fd97e7ebf63a60e339738534f39c53`

Covered D1 manual evidence writes plus the expanded Worker boundary guard. Public toolchain run `31290969921` completed the same full pipeline successfully, including `pnpm check`, production build and Playwright.

Observability commits are newer than `7a3de4e`; they require a newer exact-SHA checkpoint before preview promotion.

## Remaining Worker write gaps

At minimum, the following still require deliberate D1 parity or an explicitly split deployment:

- attention lifecycle transitions with optimistic concurrency;
- session handoff lifecycle where concurrency/idempotency semantics require equivalent guarantees;
- guarded stage completion and evidence requirements;
- workflow reservations, overrides and verification mutations;
- recovery snapshot generation/persistence where applicable;
- editorial review/approval/publish/rollback writes;
- GitHub target/recommendation local decisions and other operational writes;
- Growth/Learning work preserved in conflicting PR #24.

Port each mutation through the existing domain contract and preserve its audit, confirmation, versioning, idempotency and concurrency guarantees. Do not use route-count parity as a reason to weaken invariants.

## Preview gates added by this slice

Before a Cloudflare preview can be promoted, verify against the exact candidate SHA:

```text
[ ] attention capture succeeds with owner + same-origin + valid CSRF
[ ] attention capture rejects anonymous, cross-site and invalid-CSRF requests
[ ] evidence creation succeeds with owner + same-origin + valid CSRF
[ ] evidence rejects unsafe URL credentials and missing confirmation
[ ] oversized/non-JSON private write requests are rejected before the domain command
[ ] D1 writes create their mandatory audit record
[ ] storage failures are sanitized
[ ] request logging is disabled when the flag is absent
[ ] request logging emits only the allowlisted coarse shape when enabled
[ ] platform/edge logs do not add private payloads beyond the application event
[ ] disabling logging does not require a database mutation
[ ] Worker rollback remains compatible with the additive D1 schema already applied
```

Remote D1 migration/export/restore, real edge-path verification and explicit production approval remain unresolved gates.