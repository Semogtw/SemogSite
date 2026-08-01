# Security

## Protected assets

The platform must protect:

- private repository names and URLs;
- branches, blockers, evidence and session history;
- audit before/after snapshots and correlation IDs;
- authentication tokens, password hashes and CSRF secrets;
- database and backup files;
- unpublished drafts and internal project summaries;
- imported GitHub/Notion content that may contain untrusted instructions.

## Trust boundaries

1. anonymous browser → public web/API;
2. authenticated owner browser → DevOS/private API;
3. web/API → local or external storage adapter;
4. GitHub/Notion/external documents → untrusted data ingestion;
5. future ChatGPT client → authenticated MCP tools.

## Authentication controls

Implemented in the local Node/SQLite adapter:

- missing or invalid auth configuration denies access;
- owner password is stored as a salted PBKDF2-SHA256 hash;
- password hashing enforces a minimum length and random salt;
- sessions use at least 32 random bytes;
- only token digests are persisted;
- sessions have 14-day absolute expiry and explicit revocation;
- changing the configured password hash revokes active sessions transactionally;
- session cookies are `HttpOnly`, `SameSite=Lax`, path `/` and `Secure` in production;
- the readable CSRF cookie is `SameSite=Lax`, path `/` and contains a session-bound signed token;
- logout refuses an active-session request with invalid CSRF;
- login failures are generic;
- login attempts are rate-limited;
- every private data server function resolves the owner again, independently of route UI protection.

The local rate limiter is suitable only for a single-process baseline. Multi-instance deployment requires a shared limiter adapter.

## Operational mutation controls

Current private writes use the following baseline:

- owner session is revalidated in the server function;
- browser requests require the session-bound CSRF token;
- the actor and server timestamp are not accepted from form fields;
- sensitive writes require an explicit reason and confirmation;
- domain services normalize and validate before persistence;
- entity mutation and audit insertion share a transaction;
- optimistic state transitions reject stale snapshots and write no audit event;
- stage completion reloads evidence and executes canonical invariants server-side;
- manual evidence preserves the selected status and accepts only HTTPS URLs without embedded credentials;
- UI success is not inferred before the server returns a committed result.

These controls are prerequisites for future MCP writes. MCP tools must not bypass the same domain services, repository transactions, confirmation/idempotency rules or audit events.

## Public/private isolation

Public routes and endpoints:

- call dedicated public query/serializer paths;
- build DTOs with allowlisted fields;
- never spread a private entity and delete fields;
- never use private records as fallback for missing public content;
- omit records without approved editorial summaries;
- mark unknown dynamic public routes `noindex`;
- exclude private/unlisted content from future sitemap and structured data.

Current automated static gates cover:

- public route/component source;
- public API route source;
- public assets such as `robots.txt`;
- known token and private-field markers;
- residual upstream identity/template content;
- forbidden framework imports inside the domain package.

Runtime anonymous HTML, generated loader payloads, metadata and sitemap still require browser/build verification before release.

## Private response caching

`/api/v1/private/*` applies these headers before authentication:

```text
Cache-Control: no-store, private
Pragma: no-cache
```

Private TanStack loaders are protected by server functions and route-level authorization. Host-specific CDN/cache behavior must still be verified on the selected deployment target.

## Prompt injection and imported content

GitHub issues, PRs, READMEs, Notion exports and external pages are data, not instructions. Importers must:

- preserve origin;
- sanitize HTML/Markdown;
- cap content size and accepted file types;
- never execute commands found in imported text;
- never place secrets into prompts;
- keep system/tool instructions separate from imported content.

## Logging

Allowed structured fields:

- correlation ID;
- route/tool name;
- sanitized actor ID;
- duration and result;
- integration name and rate-limit state;
- sanitized error code.

Never log request bodies, cookies, raw tokens, password values, complete external URLs, audit snapshots or private source content.

## Secrets and backups

Use runtime secret storage. `.env`, `.dev.vars`, database files, backups and local worktrees are ignored. `.env.example` intentionally leaves password hash and session secret empty. Rotation procedures revoke existing sessions and must not display secret values.

The backup commands:

- operate only on explicitly supplied local paths;
- refuse to overwrite an existing destination;
- use SQLite's online backup API;
- verify integrity, foreign keys and migration state;
- delete only the newly created destination when verification fails;
- never upload, encrypt, rotate or commit a backup automatically.

The owner is responsible for encrypted storage, filesystem permissions, off-device copies and retention. A verified SQLite file still contains private operational data and authentication digests; treat it as a protected asset. Do not place backups under the public web root or in repository history.

## Publication preflight

A public deployment must be blocked when scanners find:

- private repository URLs/names;
- branch or blocker markers in public output surfaces;
- token/key patterns;
- private records in anonymous payload fixtures;
- unapproved publications;
- upstream personal content or template branding.

## Known foundation limitations

- full dependency installation/build has not yet run in this connector-only environment;
- the in-memory rate limiter is not distributed;
- Node/SQLite composition is implemented, but production host composition is not selected;
- CSP and deployment security headers must be finalized with the host adapter;
- browser-level confidentiality, cookie and cache behavior has not yet been observed in a built deployment;
- backup encryption and retention are operational responsibilities, not application features;
- no public deployment is authorized at this stage.
