# Cooperative run ledger threat model

## Scope

This threat model covers the private Semogtw DevOS cooperative run ledger:

- run registration and lifecycle transitions;
- evidence-rich checkpoints;
- owner command queue;
- internal agent command inbox;
- append-only event history;
- owner-only `/devos/runs` surfaces.

It does not approve or model a deployed remote MCP/HTTP agent endpoint. That transport remains blocked.

## Assets

High-value assets include:

- private project, branch, blocker and next-step metadata;
- agent/owner identities and correlation IDs;
- checkpoint commits and test evidence;
- command payloads and reasons;
- lifecycle/event history;
- owner authentication/session state;
- idempotency keys and optimistic-concurrency timestamps.

The ledger intentionally excludes prompt transcripts, hidden reasoning, raw model tokens, cookies, passwords, access tokens, API keys and authorization headers.

## Trust boundaries

```text
owner browser
    │ authenticated session + CSRF + explicit confirmation
    ▼
TanStack server functions
    │ bounded Zod inputs + server-owned identity/correlation
    ▼
domain services
    │ lifecycle/payload/evidence invariants
    ▼
SQLite repositories
    │ immediate transactions + compare-and-swap + append-only events
    ▼
private SQLite database
```

A future agent adapter introduces another boundary:

```text
external agent/client
    │ authenticated, authorized, revocable transport — not implemented
    ▼
provider-neutral command inbox / transition / checkpoint services
```

The existence of the internal inbox does not authorize external access.

## Primary threats and controls

### False live-state claims

**Threat:** UI or adapter describes silence as stopped, or a persisted status as current model telemetry.

**Controls:**

- lifecycle status and freshness are separate;
- `stale` is derived from an explicit observation time and never persisted automatically;
- UI language says “relato”, “última atualização” and “possivelmente inativa”;
- no integration reads ChatGPT account state or hidden execution state.

### Unauthorized private reads

**Threat:** anonymous/public routes expose runs, commands, branches or evidence.

**Controls:**

- `/devos/runs` routes use the owner route guard;
- server functions resolve the owner again before opening SQLite;
- pages are `noindex, nofollow, noarchive`;
- public DTOs do not include run-ledger entities;
- `robots.txt` blocks `/devos`, but authentication remains the actual control.

### Cross-site request forgery

**Threat:** another origin causes the owner browser to register, transition or command a run.

**Controls:**

- every browser mutation requires the owner session plus bound CSRF token;
- mutation schemas require literal `confirmed: true`;
- server-owned actor/event/correlation IDs prevent browser impersonation of those fields.

### Replay and duplicate writes

**Threat:** lost responses or retries create duplicate runs, checkpoints or commands.

**Controls:**

- one client UUID identifies one logical attempt;
- server derives stable entity/event/correlation IDs from that UUID;
- registration and command repositories compare stable intent while ignoring regenerated server timestamps;
- checkpoint/lifecycle paths precheck persisted event idempotency;
- same key with changed intent is a conflict, not a second write.

### Lost updates and stale forms

**Threat:** two tabs or actors overwrite newer state.

**Controls:**

- lifecycle/checkpoint services require `expectedUpdatedAt`;
- repositories compare status and/or `updated_at` in the same SQL update;
- zero affected rows produce conflict;
- entity mutation and event insertion share an immediate transaction.

### Partial history

**Threat:** entity changes succeed while event/checkpoint insertion fails.

**Controls:**

- registration, lifecycle, checkpoint and command repositories use immediate SQLite transactions;
- event insertion failure rolls back entity/command/checkpoint changes;
- tests specify rollback behavior.

### Command injection or arbitrary payloads

**Threat:** owner command becomes an unrestricted instruction, patch or credential carrier.

**Controls:**

- only six command kinds exist;
- each kind has an allowlisted payload shape;
- unknown fields are rejected;
- payload is bounded to 16 KiB;
- expiration is optional but bounded to 30 days;
- credential-like keys, JWT/session identifiers and secret containers are rejected;
- commands remain data; agents must treat them as untrusted requested intent and apply repository/security policy.

### Browser impersonates agent application

**Threat:** owner UI marks a command acknowledged/completed although no agent received it.

**Controls:**

- browser exposes command creation only;
- acknowledgement/completion/rejection exist in provider-neutral domain/SQLite services for a future authenticated agent adapter;
- UI states that command creation is not instant ChatGPT delivery.

### Command lifecycle tampering

**Threat:** acknowledgement or completion changes the original kind, payload, owner, summary, correlation, enqueue time or expiration.

**Controls:**

- command transition repository verifies immutable fields;
- exact lifecycle transitions and event kinds are validated;
- CAS includes current status and `updated_at`;
- terminal command states are immutable.

### Expired commands consumed as active

**Threat:** an old queued record is returned to an agent after its deadline.

**Controls:**

- inbox filters `expires_at > observedAt` in SQL;
- domain inbox validates every repository result again;
- read model derives `queueAvailability` separately from persisted status;
- expiration does not rewrite append-only history silently.

### Secret leakage in checkpoints or free text

**Threat:** owner or agent pastes a secret into summary, test output, blocker or context.

**Controls:**

- protocol explicitly forbids secrets and raw logs;
- command object keys receive structural secret screening;
- UI warns against credential content;
- future remote adapter must add redaction/logging controls;
- database remains private and must be protected as sensitive storage.

Free-text semantic secret detection is intentionally not presented as complete. Review/operational discipline remains required.

### Malformed historical data

**Threat:** old or manually corrupted JSON crashes private pages or is silently trusted.

**Controls:**

- general history read model marks malformed before/after/payload/commit JSON;
- agent inbox fails closed on malformed command payloads;
- UI surfaces malformed history instead of inventing valid content.

### Denial of service

**Threat:** huge histories, payloads or polling rates exhaust the process.

**Controls:**

- UI/read model limits: runs 100, events 200, checkpoints 100, commands 100;
- agent inbox limit: 20;
- command payload 16 KiB;
- checkpoint commits max 100 and text fields are bounded;
- remote rate/concurrency/time limits are mandatory before transport exposure.

## Remote adapter blockers

Do not expose command polling or run writes remotely until all of these are proven:

- authenticated agent identity with revocation/expiry;
- authorization scoped to the intended run/project;
- replay-safe idempotency across instances;
- TLS and Host/Origin/DNS-rebinding policy;
- request, response, concurrency and timeout bounds;
- no-store private caching;
- structured log redaction and correlation;
- command acknowledgement/application semantics;
- credential rotation and endpoint disablement;
- selected-host rollback and backup restore;
- compatibility with the intended ChatGPT/MCP client.

## Residual risks

- Cooperative participants can report inaccurate progress; the ledger preserves provenance but cannot prove all claims automatically.
- Owner free text can contain sensitive material despite warnings.
- A compromised owner session can perform authorized browser mutations until revoked.
- SQLite single-host assumptions must be re-evaluated for multi-instance deployment.
- Command polling remains unusable externally until a separately reviewed transport exists.
