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
| Cooperative run transition | `POST /api/v1/private/cooperative-runs/transition` | command-driven domain transition, strong observed-state CAS + idempotent monotonic ledger append |
| Verification obligation creation | `POST /api/v1/private/verification-obligations/create` | reference-aware conditional insert + event/audit batch + semantic replay |
| Verification obligation result | `POST /api/v1/private/verification-obligations/result` | version/status CAS + monotonic event + generic audit |
| Verification obligation supersede | `POST /api/v1/private/verification-obligations/supersede` | version/status CAS + monotonic event + generic audit |
| Verification obligation waiver | `POST /api/v1/private/verification-obligations/waive` | confirmed owner decision + version/status CAS + audit trail |
| Scope reservation acquire | `POST /api/v1/private/scope-reservations/acquire` | active-repository/run references + domain overlap decision + event/audit batch |
| Scope reservation renew | `POST /api/v1/private/scope-reservations/renew` | version/state/time CAS + monotonic event + generic audit |
| Scope reservation release | `POST /api/v1/private/scope-reservations/release` | ownership/domain validation + full reservation CAS + audit trail |
| Scope reservation override | `POST /api/v1/private/scope-reservations/override` | explicit confirmed owner override + full reservation CAS + audit trail |
| Editorial redirect create | `POST /api/v1/private/editorial-redirects/create` | target/canonical/latest-event revalidation + schema triggers + atomic audit |
| Editorial redirect revoke | `POST /api/v1/private/editorial-redirects/revoke` | exact active-redirect expectation + monotonic event + atomic audit |

Cooperative-run registration or transitions only update the DevOS ledger. They do **not** claim to start, resume or control an external ChatGPT/Codex process; the API explicitly reports `processStarted: false`.

Verification-obligation routes only register the gate contract or an observed result. They do **not** execute the declared command; create/result responses explicitly report `gateExecuted: false`.

## D1 optimistic-write pattern

Adapters that must preserve compare-and-swap semantics use a common design:

1. execute a conditional `UPDATE` or `INSERT` as the first statement of `DB.batch()`;
2. append the corresponding audit/event row as the next statement with `WHERE changes() = 1`;
3. read `meta.changes` from the first D1 result;
4. treat exactly one changed row as success;
5. classify zero changed rows as stale/conflict/replay from the final persisted state;
6. fail closed if D1 does not provide trustworthy change metadata or reports an impossible multi-row mutation.

For event-ledger writes, sequence is derived only after the guarded state mutation succeeds. An existing idempotency key is a duplicate only when the persisted event represents the same semantic intent; reusing the key with different intent remains a conflict.

Editorial redirects additionally keep the migration-level invariant triggers enabled. The adapter revalidates publication status, document kind, canonical slug ownership and expected latest event inside the insert; the triggers remain the final database-level defense against invalid sequence or transitions.

## Read-model parity

Cooperative-run read models now expose the same pagination controls on D1 and SQLite:

- project/status filters;
- keyset cursor by `(updated_at, id)`;
- event pagination by `beforeSequence`;
- optional omission of heavy `before_json`/`after_json` snapshots for lightweight event timelines;
- the legacy numeric event-limit call remains supported.

## External-capability boundary

Worker/D1 parity does not imply that every DevOS action belongs in the Worker. Operations whose actual effect requires GitHub, a local CLI, a checkout, a subprocess or another external capability remain separate from the D1 state adapter. A Worker route must not report an external action as completed merely because canonical state was recorded.

The remaining Node/external-capability work should be evaluated by whether the effect can be represented as canonical D1 state without pretending that an external operation occurred. In particular, repository fetch/push/checkout, command execution and other local/toolchain effects require a dedicated execution capability or explicit observed-result flow rather than a state-only Worker approximation.

## Validation checkpoints

Exact full CI checkpoints already validated through `Semogtw/Offline-Toolchains` include:

- `082a21a33c54c6c711ad033d38606bee94836faf` — stage completion D1 CAS;
- `bd49e4e8862f2759cccda1da0080889ed7c827a1` — attention lifecycle D1 CAS.

Both completed the centralized SemogSite job including boundaries, confidentiality checks, package/type checks, full `pnpm check`, production build and Playwright.

A later checkpoint exposed two type-only compatibility gaps while the write surface was expanding: the D1 `first<Row>()` contract accidentally widened generic rows to `unknown`, and the cooperative-run D1 read model lagged behind pagination/snapshot tests already present in the repository. Both were corrected in production code rather than weakening the tests.

Checkpoint `7f4071b3307201501301a84636a43e91d10d2e36` was submitted to `Semogtw/Offline-Toolchains` after those fixes and after the Verification/Scope/Editorial Worker ports. Until an exact full run for that or a descendant SHA is green, these later capabilities are implemented and covered in code but must not be described as production-gate validated.

The code should continue advancing while a shared runner is queued; an unavailable runner is validation debt, not a reason to weaken invariants or stop unrelated implementation work.
