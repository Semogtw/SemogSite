# Threat Model — Workflow Orchestration Core

## Security objective

Provide useful private workflow coordination without turning Semogtw DevOS into a remote execution backdoor, provider-account automation layer or public source of repository metadata.

## Protected assets

- private repository identities and URLs;
- accepted branches and exact commit SHAs;
- scope reservations and participant labels;
- commands and required runtime capabilities;
- verification results and failure signatures;
- blockers, decisions and exact next actions;
- recovery snapshot canonical JSON and Markdown;
- continuation prompts;
- owner identity, sessions, CSRF tokens and audit history;
- optional toolchain identifiers and evidence URLs.

## Trust boundaries

```text
owner browser
    ↓ authenticated cookie + CSRF
TanStack server functions
    ↓ validated application inputs
provider-neutral domain services
    ↓ ports
SQLite repositories / read models

GitHub REST observations
    ↓ normalized untrusted evidence
SQLite observation tables
    ↓ conservative read composition
workflow dashboard / recovery source
```

Remote MCP, schedulers, webhooks and provider adapters are outside the current trusted core.

## Threats and controls

### Unauthorized private reads

Threat:
- anonymous or expired sessions read branch, SHA, gates, prompts or snapshots.

Controls:
- owner route guard before rendering;
- owner resolution repeated in every server function;
- private DTO/read models only;
- `noindex, nofollow, noarchive` metadata;
- no workflow data in public loaders, APIs, sitemap or structured metadata;
- fail closed when authentication or storage configuration is missing.

### Cross-site request forgery

Threat:
- another site creates reservations, gates, results, overrides or snapshots using the owner session.

Controls:
- CSRF token bound to the server-side session;
- POST-only mutations;
- bounded validation schemas;
- explicit confirmation for sensitive actions;
- generic authorization failure messages.

### Idempotency replay or intent substitution

Threat:
- a retried UUID creates multiple rows;
- a caller reuses an idempotency key with changed content.

Controls:
- stable server-owned entity/audit/correlation IDs derived from one client UUID;
- unique entity-scoped idempotency constraints;
- stable-intent comparison before accepting duplicates;
- changed reuse returns conflict;
- immutable snapshot canonical hash deduplication.

### Stale-state mutation

Threat:
- a browser overrides a reservation or records a gate result after another actor changed the record.

Controls:
- integer version on mutable aggregates;
- compare-and-swap update predicates;
- stale versions rejected without audit insertion;
- UI instructs refresh and reassessment.

### False completion or false test success

Threat:
- a commit, heartbeat, reservation or silence is interpreted as successful validation.

Controls:
- verification obligations are independent from run progress;
- creating a gate starts at `pending`;
- `passed` requires an explicit recorded observed result;
- absence of an environment is classified separately;
- recovery snapshots preserve explicit test status;
- no inactivity path produces completion.

### Overlap bypass

Threat:
- two agents work on the same paths because patterns are malformed or a caller hides overlap.

Controls:
- normalized bounded patterns;
- conservative repository/branch matching;
- active reservation expiry derived from timestamp;
- overlap IDs returned to the caller;
- overlap acknowledgement explicit and audited;
- owner override requires reason and confirmation;
- reservation is described as a soft coordination lease, not a hard lock.

### Path and branch injection

Threat:
- malicious path/branch strings escape intended matching or enter logs/UI unsafely.

Controls:
- Git-ref unsafe characters and sequences rejected;
- path traversal, absolute paths, control characters and unsupported glob syntax rejected;
- values rendered as text, not HTML;
- bounded lengths at browser, transport and domain layers.

### Prompt injection through provider data

Threat:
- commit messages or GitHub metadata contain instructions copied into continuation prompts.

Controls:
- GitHub content is data, never authority;
- recovery source does not copy commit messages;
- snapshot uses neutral `Observed branch head` text;
- continuation prompt is owner-provided and validated independently;
- external provider text does not alter domain decisions.

### Credential disclosure in snapshots

Threat:
- tokens, cookies, authorization headers or private keys enter immutable canonical JSON/Markdown.

Controls:
- credential-shaped scanner before persistence;
- bounded allowlisted snapshot fields;
- HTTPS evidence URLs without embedded credentials;
- unsafe document paths rejected;
- snapshots remain private;
- no detailed notification preview by default.

Residual risk:
- novel secret formats may evade pattern detection. The owner must still avoid pasting credentials; incidents require revocation and a regression rule.

### Canonical-hash confusion

Threat:
- semantically identical records hash differently due to key ordering;
- changed content is mistaken for an idempotent retry.

Controls:
- deterministic recursive key ordering;
- deterministic collection sorting and deduplication;
- SHA-256 over canonical JSON;
- unique canonical hash;
- canonical JSON stored with the hash for verification.

### Tampering with historical records

Threat:
- mutable updates rewrite prior reservations, gate events or recovery snapshots.

Controls:
- append-only event tables;
- terminal gate/snapshot semantics;
- snapshots have no update repository method;
- audit event insertion in the same transaction;
- additive migrations only.

### Foreign-key substitution

Threat:
- a snapshot or obligation references another project, repository, run or stage without validation.

Controls:
- repository methods preflight referenced IDs;
- SQLite foreign keys enabled;
- project/repository/run/stage deletion policies explicit;
- recovery source resolves project and repository from one joined persisted row.

### Unsafe remote expansion

Threat:
- future MCP or webhook exposes arbitrary SQL, shell, GitHub mutation or provider credentials.

Controls for future adapters:
- separate security plan and threat model;
- scoped revocable agent identity;
- run/project authorization;
- strict read/write scopes;
- no arbitrary patch or command execution tool;
- Host/Origin/TLS/rate/timeout/body limits;
- private cache and sanitized logging;
- rollback and endpoint kill switch;
- core remains useful when remote adapter is disabled.

## Logging and notifications

Permitted:
- stable IDs;
- bounded error codes;
- timestamps;
- action and entity type;
- sanitized result classifications;
- correlation IDs.

Do not log or place in lock-screen notifications by default:
- full repository names;
- branches or SHAs;
- command bodies;
- blockers;
- continuation prompts;
- canonical snapshot bodies;
- evidence URLs;
- credentials or request headers.

## Security verification requirements

- anonymous routes and public payloads contain no workflow markers;
- CSRF failures produce no state/audit row;
- stale versions produce no state/audit row;
- audit insertion failure rolls back entity mutation;
- duplicate idempotent requests create one row/event;
- changed idempotency reuse conflicts;
- unsafe branches, paths, URLs and credential-shaped content are rejected;
- snapshot hash is reproducible from stored canonical JSON;
- no GitHub write client is imported into workflow orchestration modules;
- no remote listener or provider cookie handling is introduced.
