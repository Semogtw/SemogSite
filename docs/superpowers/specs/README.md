# SemogSite Design Specifications

This directory contains approved product and architecture specifications. Specifications define decisions and invariants; executable task sequencing lives in [`../plans/README.md`](../plans/README.md).

Agents must verify the newest consolidated branch and current code before applying a specification. A specification may describe future work that is not implemented yet.

## Current remote MCP direction

### Remote MCP and Gemini Spark integration

- [`2026-08-03-semogtw-remote-mcp-spark-design.md`](./2026-08-03-semogtw-remote-mcp-spark-design.md)

Defines:

- Mode B external MCP bridge;
- `packages/mcp-auth` and migration `0014_mcp_oauth.sql`;
- preregistration and Dynamic Client Registration;
- authorization code + PKCE S256;
- digest-only opaque access/refresh tokens, rotation and revocation;
- private owner client management and consent;
- authenticated stateless Streamable HTTP;
- Gemini Spark as an optional compatibility target;
- six later workflow/recovery read tools;
- explicit deferral of writes.

Executable plans:

- [`../plans/2026-08-03-semogtw-remote-mcp-spark.md`](../plans/2026-08-03-semogtw-remote-mcp-spark.md)
- [`../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md`](../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md)

The historical 2026-08-01 Streamable HTTP plan is not the current execution source.

## Workflow and continuity specifications

### Workflow orchestration core

- [`2026-08-03-workflow-orchestration-core-design.md`](./2026-08-03-workflow-orchestration-core-design.md)

Provider-neutral scope reservations, exact-SHA verification obligations, immutable recovery snapshots and conservative safe-work evaluation.

### Provider-agnostic project session resume

- [`2026-08-02-provider-agnostic-project-resume-design.md`](./2026-08-02-provider-agnostic-project-resume-design.md)

Conservative activity classification, trustworthy continuation context and clipboard/open-destination behavior without provider UI scraping or automatic submission.

## Platform and editorial specifications

### Platform foundation

- [`2026-08-01-semogtw-platform-foundation-design.md`](./2026-08-01-semogtw-platform-foundation-design.md)

Portable TypeScript platform, public/editorial site, private DevOS, relational persistence, authentication and adapter boundaries.

### Editorial workflow

- [`2026-08-01-semogtw-editorial-workflow.md`](./2026-08-01-semogtw-editorial-workflow.md)

Owner-only draft/revision/review/publication/withdrawal/rollback workflow and safe public projection rules.

### Editorial redirects

- [`2026-08-03-semogtw-editorial-redirect-registry.md`](./2026-08-03-semogtw-editorial-redirect-registry.md)

Append-only aliases and audited canonical redirect behavior.

## Specification rules

- Code and observed tests remain the source of truth for implementation state.
- Do not mark a future design as implemented merely because the specification exists.
- Provider availability, plans, regions and client behavior are external dependencies and must be reverified.
- Preserve provider-neutral domain contracts; provider-specific compatibility belongs in adapters/evidence.
- Security-sensitive surfaces require dedicated implementation plans, tests, preview evidence and rollback.
- Update the relevant specification only when an architectural decision changes; implementation progress belongs in plans, test matrices, runbooks and changelog.
