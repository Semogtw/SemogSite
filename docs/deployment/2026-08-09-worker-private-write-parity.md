# Worker private write parity — 2026-08-09

This note records the current private-write surface implemented on the Cloudflare Worker/D1 runtime. It complements older deployment notes that described a narrower write surface while the Worker adapter was still being introduced.

## Security envelope

Every route under `/api/v1/private/*` passes through the shared API envelope before reaching a domain service:

1. same-browser-origin / Fetch Metadata checks;
2. owner session authentication;
3. CSRF validation;
4. route-specific bounded JSON parsing;
5. existing domain validation and invariants;
6. sanitized HTTP errors and private/no-store caching policy.

Server-owned audit IDs, correlation IDs, timestamps and canonical identities are not accepted from the browser where the domain can derive them safely.

## Private writes available in Worker/D1

The D1 composition currently supports the following write flows through the same domain services used by the SQLite/Node composition:

| Capability | API route | D1 consistency strategy |
| --- | --- | --- |
| Attention capture | `POST /api/v1/private/attention` | entity + audit in one D1 batch |
| Attention lifecycle | `POST /api/v1/private/attention/transition` | optimistic CAS + conditional audit |
| Manual evidence | `POST /api/v1/private/evidence` | evidence + audit in one D1 batch |
| Session handoff | `POST /api/v1/private/session-handoffs` | handoff + audit in one D1 batch |
| Stage completion | `POST /api/v1/private/stages/complete` | evidence-aware optimistic CAS + conditional audit |
| Repository sync-target lifecycle | `POST /api/v1/private/repository-targets/lifecycle` | sync-state/timestamp CAS + conditional audit |
| Repository sync-target registration | `POST /api/v1/private/repository-targets/register` | conditional insert + audit; final-state outcome classification |
| Branch recommendation acceptance | `POST /api/v1/private/branch-recommendations/accept` | repository CAS plus latest-recommendation revalidation inside the update |
| Cooperative run registration | `POST /api/v1/private/cooperative-runs/register` | run + first ledger event in one batch; semantic idempotency replay |
| Cooperative run heartbeat | `POST /api/v1/private/cooperative-runs/heartbeat` | timestamp CAS + idempotent ledger append |
| Cooperative run progress | `POST /api/v1/private/cooperative-runs/progress` | timestamp CAS + idempotent ledger append |
| Cooperative run finalization | `POST /api/v1/private/cooperative-runs/finalize` | timestamp CAS + idempotent ledger append |

Cooperative-run registration or transitions only update the DevOS ledger. They do **not** claim to start, resume or control an external ChatGPT/Codex process; the API explicitly reports `processStarted: false`.

## D1 optimistic-write pattern

Adapters that must preserve compare-and-swap semantics use a common design:

1. execute a conditional `UPDATE` or `INSERT` as the first statement of `DB.batch()`;
2. append the corresponding audit/event row as the next statement with `WHERE changes() = 1`;
3. read `meta.changes` from the first D1 result;
4. treat exactly one changed row as success;
5. classify zero changed rows as stale/conflict/replay from the final persisted state;
6. fail closed if D1 does not provide trustworthy change metadata or reports an impossible multi-row mutation.

For run ledgers, the event sequence is derived only when the guarded state mutation succeeds. An existing idempotency key is a duplicate only when the persisted event represents the same semantic intent; reusing the key with different intent remains a conflict.

## External-capability boundary

Worker/D1 parity does not imply that every DevOS action belongs in the Worker. Operations whose actual effect requires GitHub, a local CLI, a checkout, a subprocess or another external capability remain separate from the D1 state adapter. A Worker route must not report an external action as completed merely because canonical state was recorded.

The following families still need dedicated designs before a safe D1 port:

- editorial redirects with idempotency replay, publication-target validation and monotonic per-slug event sequencing;
- verification-obligation results with semantic replay and ordered event history;
- scope/orchestration mutations whose SQLite transaction spans multiple coordinated state changes;
- external repository operations such as fetch/push/checkout or command execution.

These are intentionally not approximated with a weaker D1 implementation.

## Validation checkpoints

Exact full CI checkpoints already validated through `Semogtw/Offline-Toolchains` include:

- `082a21a33c54c6c711ad033d38606bee94836faf` — stage completion D1 CAS;
- `bd49e4e8862f2759cccda1da0080889ed7c827a1` — attention lifecycle D1 CAS.

Both completed the centralized SemogSite job including boundaries, confidentiality checks, package/type checks, full `pnpm check`, production build and Playwright.

Later Worker-write commits must receive their own checkpoint before being described as production-gate validated. The code should continue advancing while a shared runner is queued; an unavailable runner is documentation/validation debt, not a reason to weaken invariants or stop unrelated implementation work.
