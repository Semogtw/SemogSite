# Security

## Protected assets

The platform must protect:

- private repository names and URLs;
- branches, blockers, evidence and session history;
- authentication tokens, password hashes and CSRF secrets;
- unpublished drafts and internal project summaries;
- imported GitHub/Notion content that may contain untrusted instructions.

## Trust boundaries

1. anonymous browser → public web/API;
2. authenticated owner browser → DevOS/private API;
3. web/API → local or external storage adapter;
4. GitHub/Notion/external documents → untrusted data ingestion;
5. future ChatGPT client → authenticated MCP tools.

## Authentication controls

- missing auth configuration denies access;
- owner password is stored as a salted PBKDF2-SHA256 hash;
- password hashing enforces a minimum length and random salt;
- sessions use at least 32 random bytes;
- only token digests are persisted;
- sessions have absolute expiry and revocation;
- cookies are `HttpOnly`, `SameSite=Lax`, path-scoped and `Secure` in production;
- login failures are generic;
- login attempts are rate-limited;
- private mutations require a session-bound CSRF token.

The local rate limiter is suitable only for a single-process baseline. Multi-instance deployment requires a shared limiter adapter.

## Public/private isolation

Public routes and endpoints:

- call dedicated public query/serializer paths;
- build DTOs with allowlisted fields;
- never spread a private entity and delete fields;
- never use private records as fallback for missing public content;
- mark unknown dynamic public routes `noindex`;
- exclude private/unlisted content from future sitemap and structured data.

Automated gates must search anonymous HTML, loader data, API output, metadata, sitemap, robots and logs for known private markers.

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

Never log request bodies, cookies, raw tokens, password values, complete external URLs or private source content.

## Secrets

Use runtime secret storage. `.env`, `.dev.vars`, database files, backups and local worktrees are ignored. Rotation procedures must revoke existing sessions and update integration diagnostics without displaying secret values.

## Publication preflight

A public deployment must be blocked when scanners find:

- private repository URLs/names;
- branch or blocker markers in public files;
- token/key patterns;
- `private` records in public payload fixtures;
- unapproved publications;
- upstream personal content or template branding.

## Known foundation limitations

- full dependency installation/build has not yet run in this connector-only environment;
- the in-memory rate limiter is not distributed;
- production auth/database composition is intentionally absent until a host is selected;
- CSP, security headers and deployment-specific cookie domain policy must be finalized with the host adapter;
- no public deployment is authorized at this stage.
