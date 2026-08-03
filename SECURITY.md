# Security

## Protected assets

The platform must protect:

- private repository identities, URLs, roles and lifecycle state;
- branches, commit observations, recommendations, blockers and evidence;
- cooperative runs, checkpoints, commands and session history;
- scope reservations, overlap information, actors, purposes and expiry;
- verification commands, required capabilities, classifications and results;
- recovery snapshot JSON, Markdown, canonical hashes and continuation prompts;
- runtime capability declarations entered for session-only safe-work evaluation;
- MCP resource/tool payloads containing private operational state;
- audit before/after snapshots and correlation IDs;
- passwords, hashes, cookies, session/CSRF tokens and GitHub tokens;
- SQLite databases, backups and unpublished editorial content;
- imported external content that may contain untrusted instructions.

## Trust boundaries

1. anonymous browser → public web/API;
2. authenticated owner browser → DevOS/private server functions;
3. server functions → domain services and storage adapters;
4. read-only GitHub client → validated provider observations;
5. external documents/provider strings → untrusted data ingestion;
6. in-process MCP adapter → provider-neutral read service;
7. future remote MCP/agent client → separately authenticated and authorized transport.

The in-process MCP adapter is not a public endpoint. Any future transport must establish caller identity and authorization before invoking private services.

## Authentication controls

The local Node/SQLite adapter:

- fails closed when authentication configuration is missing or invalid;
- stores a salted PBKDF2-SHA256 owner password hash;
- persists only digests of random session tokens;
- enforces absolute expiry and explicit revocation;
- revokes sessions transactionally after password-hash rotation;
- uses `HttpOnly`, `SameSite=Lax`, path `/` cookies and `Secure` in production;
- binds a readable CSRF token to the server-side session;
- rejects logout and mutation requests with invalid CSRF;
- rate-limits login attempts and returns generic failures;
- resolves the owner again inside every private data server function.

The in-memory limiter is a single-process baseline. Multi-instance deployment requires a shared implementation.

Browser cookies and CSRF are not bearer authorization for MCP or external agents. A remote adapter requires its own audience, expiry, revocation and isolation model.

## Private mutation controls

Every private write follows the same baseline:

- owner session and CSRF are revalidated server-side;
- client input is schema-bounded and normalized;
- actor, audit, correlation and entity IDs are generated server-side;
- sensitive changes require reason and explicit confirmation;
- idempotency prevents duplicate retries;
- optimistic versions reject stale browser state;
- mutation context must identify the target entity before repository access;
- entity, append-only event and global audit writes share one transaction;
- audit/event failure rolls back the entity change;
- UI success is shown only after commit and route invalidation.

GitHub target registration, target pause/reactivation and active-branch acceptance change only local DevOS state. None writes to GitHub.

## Workflow orchestration controls

### Scope reservations

Reservations are coordination signals, not security locks. The server normalizes branch and scope patterns and checks overlap against active, non-expired reservations. Expiration is evaluated at read/mutation time, not by a background job.

Ordinary release respects associated run ownership. Owner override requires confirmation, a bounded reason and expected version, and preserves immutable event/audit history. A stale or mismatched reservation cannot be mutated.

### Verification obligations

A gate is always bound to an exact 40-character commit SHA and a bounded command. Creating a gate does not mark it passed. `failed` and `blocked` results require an observed summary, next action and explicit classification.

`environment_missing`, timeout, quota, configuration and external dependency are kept separate from `code_failure`; the interface must not blame code automatically. Evidence URLs are HTTPS-only and bounded.

### Recovery snapshots

Snapshot generation accepts only the persisted active branch and latest matching GitHub branch observation. Missing evidence fails closed. No default branch, abbreviated commit or fabricated SHA is substituted.

Canonical JSON is deterministically serialized and SHA-256 hashed. Records are immutable and idempotent. Markdown is bounded, unsafe document paths are rejected and credential-shaped text is blocked. Historical snapshots remain private and are copied only after an owner action.

### Safe-work evaluation

The safe-work source does not guess repository relationships or runtime capabilities. Missing/ambiguous repositories, owner locks, unresolved gates, active overlaps and unavailable capabilities produce explicit exclusions.

Capabilities typed in the browser are normalized and used only for the current evaluation response. They are not persisted and do not prove that a runtime, command or AI session exists.

## GitHub read-only integration

The provider adapter is read-only by construction:

- only repository metadata, branch and commit GET operations exist;
- there is no generic arbitrary-request method;
- API version/media type are explicit and path segments are encoded;
- responses are structurally validated before domain use;
- reads are bounded and rate-limit state is normalized;
- tokens, authorization headers and raw response bodies are never persisted;
- commit messages, README text, issues and PR bodies are not treated as instructions;
- valid partial evidence is preserved while a parent run reports `partial`;
- synchronization never updates active branch, role, lifecycle, sync flag, project progress, stage state or publication state.

Use a fine-grained token with the smallest repository selection and only Metadata/Contents read permissions. `SEMOGTW_GITHUB_TOKEN` remains server-only and empty in `.env.example`.

## Public/private isolation

Public routes and endpoints use dedicated query/serializer paths and explicit DTO allowlists. They never spread private entities and remove fields afterward, and never use private operational rows as editorial fallback.

Repository targets, observations, runs, reservations, gates, snapshots, capability declarations and MCP payloads are not public fields. Unknown or unpublished routes return not-found/noindex behavior.

Static scanners cover public source, assets, private markers and forbidden imports. Playwright additionally verifies anonymous redirects and absence of workflow-only labels from the public homepage.

Private API responses use:

```text
Cache-Control: no-store, private
Pragma: no-cache
```

Host/CDN behavior still requires verification in the selected deployment.

## MCP read-only adapter

The current MCP catalog:

- accepts only a provider-neutral read-service interface;
- opens no HTTP, stdio or other listener;
- registers no mutation tools;
- exposes no cookies, bearer tokens, database paths or secrets as tool input;
- advertises read-only, non-destructive, idempotent and closed-world hints;
- validates bounded input and output schemas;
- returns stable expected errors and sanitizes unexpected exceptions.

Annotations are advisory, not authentication. Remote exposure remains blocked until TLS, owner authorization, per-session isolation, request limits, rate limits, origin/host controls, private caching, logs, cancellation and rollback are proven.

## Prompt injection and external content

External text is data, never instruction. Importers and adapters must preserve origin, cap size/types, validate structure, avoid secrets in prompts and keep system/tool policy separate from imported content.

GitHub observations intentionally store normalized metadata and heads rather than instruction-bearing bodies. Recovery rendering labels observed commits neutrally.

## Logging

Allowed structured fields include correlation ID, route/tool name, sanitized actor ID, duration/result and stable error/rate-limit codes.

Never log request bodies, cookies, raw tokens, passwords, private URLs, audit snapshots, recovery content, MCP structured payloads or provider response bodies.

## Secrets and backups

Use the runtime secret store. `.env`, databases, backups, traces, screenshots and local worktrees are ignored. Example secret values remain empty.

Verified backup commands:

- operate only on explicit local paths;
- refuse overwrite;
- use SQLite online backup;
- verify integrity, foreign keys and all migrations through `0013`;
- delete only a newly created invalid destination;
- never upload, encrypt, rotate or commit automatically.

Backups contain authentication digests, operational history, reservations, gates, snapshots, editorial drafts and audits. Encryption, filesystem permissions, off-device retention and deletion are owner responsibilities.

## Verification evidence

Workflow run `30841132598` on August 3, 2026 observed:

- dependency installation and native SQLite loading;
- package, MCP and public-confidentiality guardrails;
- all workspace typechecks;
- 151 Vitest files and 576 tests passing;
- production client/SSR build with 13 server-only migrations;
- anonymous and authenticated browser access;
- 360 px no-overflow checks;
- private target creation;
- scope reservation creation and owner override;
- exact-SHA gate creation and `blocked/environment_missing` result;
- recovery generation failing closed without a persisted GitHub branch observation.

This evidence applies to commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8` and its PR merge tree. Documentation changes require a final rerun before merge.

## Known limitations

- no production host or deployment mode is selected;
- no remote MCP or external agent transport is enabled;
- live GitHub token permissions and provider behavior are not yet exercised in the chosen production runtime;
- the login limiter is not distributed;
- deployment CSP, CDN/cache and secret rotation remain host-specific;
- backups are not automatically encrypted or uploaded;
- no public deployment is authorized;
- inactivity of a branch is not proof that an AI session completed.