# Cooperative run ledger residual review — 2026-08-01

## Purpose

Record the remaining correctness, verification and deployment gaps after feature implementation. “Approximately 98% implemented” means the planned local/domain/owner-web capability exists; it does not mean the branch has passed all gates or that remote access is approved.

## P1 — Verification and build evidence

**Status:** open, release-blocking.

Missing observed evidence for the current HEAD:

- frozen-lockfile install;
- real domain/database/web typecheck;
- Vitest suites;
- migrations `0001`–`0005` on in-memory/file SQLite;
- backup/restore after `0005`;
- full `pnpm check` and build;
- authenticated/anonymous browser scenarios;
- keyboard/360 px review.

**Acceptance:** execute and record every gate from the verification plan. Keep PR draft until clean.

## P1 — Command creation replay after consumption

**Status:** tracked, remote-surface blocker.

A retry of the original command-creation request must remain idempotent even when the command has already advanced from `queued`. Duplicate recognition should use the immutable queued event/stable original intent, not mutable current lifecycle fields.

**Acceptance:** queue → acknowledge/complete/reject → retry original create request returns duplicate/idempotent without changing current command state; changed original intent with same key returns conflict.

## P1 — Stable request fingerprint for transition/checkpoint replay

**Status:** tracked, remote-surface blocker.

Lifecycle/checkpoint server functions prevent a second write when the idempotency event exists, but the fast precheck does not yet prove the replay carries the same material request.

**Acceptance:** persist/derive a bounded stable request fingerprint. Exact replay after state advancement returns the original idempotent outcome; same key with changed material input returns conflict.

## P2 — Inbox adapter-result bounds/order defense

**Status:** review item.

The SQLite inbox enforces FIFO and SQL limit. The provider-neutral service validates run/status/expiry but should be verified to reject or normalize a repository result that exceeds the requested limit or is out of FIFO order.

**Acceptance:** tests cover over-limit and out-of-order repository responses; service behavior is deterministic and documented. No acknowledgement side effect.

## P2 — Repository timestamp fail-closed hardening

**Status:** review item.

Domain services validate timestamps before repository calls. Repository-level transition integrity checks should also be verified against invalid timestamps for callers that bypass domain composition.

**Acceptance:** invalid `updatedAt`/`occurredAt` snapshots cannot update commands/runs or append events, even through direct repository invocation.

## P2 — Guardrail integration

**Status:** implementation exists, workspace integration pending.

Added standalone Node-native runners:

```bash
node scripts/check-run-ledger-guardrails.mjs
node scripts/check-security-guardrails.mjs
```

They are not yet confirmed as part of the root `pnpm check` script.

**Acceptance:** execute fixtures/scanners on the current tree, then add them to the canonical workspace guardrail command without duplicating or reordering existing critical checks incorrectly.

## P2 — Free-text secret handling

**Status:** accepted residual risk for owner-only local phase.

Structural command payload keys reject credential-like fields, but owner/agent free text can still contain secrets. Semantic secret detection is not complete and should not be advertised as complete.

**Acceptance before remote exposure:** transport/log redaction, payload review policy, bounded error logging and incident procedure are verified. Never log checkpoint/command text by default.

## P3 — Source-hash semantics

**Status:** review item.

Confirm whether checkpoint `sourceHash` is intended as a content fingerprint independent of idempotency identity or as a unique logical-attempt fingerprint. The owner adapter currently hashes the material checkpoint input together with its client idempotency UUID.

**Acceptance:** document the intended semantic and add a deterministic test. If used for content deduplication, exclude operation identity from the hash; if used for attempt provenance, rename/document accordingly.

## Deployment blockers independent of code completion

- durable selected-host storage;
- secret handling and owner session behavior;
- backup restore drill;
- multi-instance/SQLite decision;
- authenticated agent identity/authorization;
- remote Host/Origin/TLS/rate-limit/revocation/rollback controls;
- intended ChatGPT/MCP client compatibility.

## Readiness interpretation

- Feature implementation may remain around 98% while release readiness is materially lower.
- P1 items block ready-for-review or remote access as stated.
- P2/P3 items must be resolved or explicitly accepted with evidence before the applicable release stage.
- No item authorizes adding an unauthenticated temporary endpoint.
