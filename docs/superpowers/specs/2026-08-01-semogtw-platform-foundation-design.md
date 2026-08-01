# Semogtw Platform Foundation — Design Specification

**Status:** Approved design baseline  
**Date:** 2026-08-01  
**Repository:** `Semogtw/SemogSite`  
**Canonical product source:** `Arthur Digital Platform — Especificação v2`, adapted only where this document explicitly overrides naming and initial hosting posture.

## 1. Purpose

Build a portable personal platform under the **Semogtw** identity with three surfaces sharing one domain model:

1. an editorial public website;
2. a private operational application named **Semogtw DevOS** under `/devos`;
3. a future remote MCP adapter using the same application services and data.

This foundation does not target ChatGPT Sites specifically. It must run locally and remain deployable to a conventional Node host, serverless platform, edge runtime, or a future ChatGPT Sites-compatible environment through adapters rather than rewrites.

The first implementation slice establishes the architecture, design system, public shell, private shell, local authentication, relational model, public home, DevOS overview, Today, Projects, project hub, and Roadmap. Migration, GitHub synchronization, MCP, editorial workflow, automation, and production hosting are later slices built on the same contracts.

## 2. Product naming and copy rules

- Public identity: **Semogtw**.
- Private operational product: **Semogtw DevOS**.
- Repository owner and technical identity: `Semogtw`.
- UI copy must not use “Arthur” as the product name.
- Historical source documents may retain their original title for traceability, but all implemented routes, metadata, components, tests, documentation, and seed content must use Semogtw naming.
- The interface language is Brazilian Portuguese.
- Stored timestamps use UTC; presentation uses `America/Bahia`.

## 3. Architectural choice

### 3.1 Selected approach

Use a TypeScript monorepo with:

- **React Router framework mode** for the web application, SSR, route loaders/actions, and prerendered public pages;
- **Hono** for a portable HTTP API based on Web Standards;
- **Zod** for runtime validation and API/domain contracts;
- **Drizzle ORM** for SQL schema and type-safe persistence;
- **SQLite** as the local and test database;
- repository and storage interfaces that permit PostgreSQL or another relational implementation later;
- **Vitest** for unit and integration tests;
- **Playwright** for browser-level flows;
- **pnpm workspaces** for package management.

### 3.2 Why this approach

React Router provides SSR and prerendering without coupling the entire product to one hosting vendor. Hono can run in Node, serverless, and edge-style environments. Drizzle keeps the schema close to SQL and supports more than one relational backend. The domain and application layers remain independent from both React Router and Hono.

Next.js was rejected for the foundation because its framework conventions would create stronger runtime coupling than required. Astro plus a separate React DevOS was rejected because it would split navigation, authentication, component conventions, and rendering infrastructure before that complexity provides value.

### 3.3 Deployment posture

The production mode is intentionally not declared as A, B, or C yet because no production runtime has been selected or verified.

Current documented state:

```text
Execution baseline: local Node runtime
Production host: not selected
Storage baseline: SQLite through a repository adapter
Authentication baseline: local AuthProvider
MCP endpoint: contract reserved, not implemented in the foundation
Webhooks: not implemented in the foundation
Background jobs: not implemented in the foundation
Deployment mode A/B/C: pending host capability verification
```

The architecture must support:

- Mode A by replacing runtime adapters while preserving domain and API contracts;
- Mode B by deploying only the MCP adapter externally;
- Mode C by deploying the API and persistence externally while retaining the same public and private route interfaces.

No document may present an unverified hosting capability as available.

## 4. Repository structure

```text
SemogSite/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── layouts/
│   │   │   ├── components/
│   │   │   ├── styles/
│   │   │   └── entry.server.tsx
│   │   ├── public/
│   │   └── tests/
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── server.ts
│       └── tests/
├── packages/
│   ├── domain/
│   │   └── src/
│   │       ├── projects/
│   │       ├── roadmap/
│   │       ├── attention/
│   │       ├── sessions/
│   │       ├── publishing/
│   │       └── shared/
│   ├── contracts/
│   │   └── src/
│   │       ├── public/
│   │       ├── private/
│   │       └── common/
│   ├── database/
│   │   └── src/
│   │       ├── schema/
│   │       ├── repositories/
│   │       ├── migrations/
│   │       └── adapters/
│   ├── auth/
│   │   └── src/
│   │       ├── provider.ts
│   │       ├── local-provider.ts
│   │       ├── sessions.ts
│   │       └── password.ts
│   ├── ui/
│   │   └── src/
│   │       ├── foundations/
│   │       ├── primitives/
│   │       ├── public/
│   │       └── devos/
│   ├── github/
│   ├── mcp/
│   └── config/
├── docs/
├── scripts/
└── tests/
```

Package boundaries are strict:

- `domain` depends on no web framework, ORM, or host runtime;
- `contracts` may depend on Zod but not on UI or persistence;
- `database` implements repository interfaces declared by the domain/application boundary;
- `auth` exposes an `AuthProvider` interface and contains no route-specific UI;
- `ui` contains presentation only and does not query the database;
- `web` and `api` compose services and adapters;
- future `github` and `mcp` packages call application services rather than duplicating rules.

## 5. Domain and application boundaries

### 5.1 Core entities in the foundation

The initial schema includes the source specification’s entities required by the first slice:

- `projects`;
- `repositories`;
- `workstreams`;
- `stages`;
- `attention_items`;
- `development_sessions`;
- `evidence`;
- `publications`;
- `timeline_entries`;
- `media_assets`;
- `sync_runs`;
- `audit_events`;
- `app_settings`;
- authentication users and sessions.

Not every entity receives a complete UI in the foundation, but the schema and repository boundaries must avoid a later destructive redesign.

### 5.2 Mandatory invariants

The domain enforces these rules independently from routes and components:

1. A completed stage has `progress = 100`, `done = true`, and at least one valid evidence reference.
2. A blocked stage has a non-empty blocker description.
3. Every non-completed stage has a concrete next step.
4. `progress = 100` alone never completes a stage.
5. Synchronization cannot overwrite a field whose `manualLock` is true.
6. Failed evidence cannot satisfy a completion gate.
7. A private URL cannot be serialized into a public DTO.
8. Sensitive or destructive changes generate audit events.
9. Timestamps are persisted in UTC.
10. Technical data includes source, age, and confidence where relevant.
11. Only a human owner approval can move a publication to `published`.

### 5.3 Application services

The first implementation defines service interfaces for:

- `ProjectService` — project listings, project hub, active project summaries;
- `RoadmapService` — stage retrieval, ordering, transition validation, completion proposals;
- `AttentionService` — open attention items and owner-specific queues;
- `SessionService` — recent development continuity records;
- `PublishingService` — explicit public DTO generation and publication-state validation;
- `OverviewService` — DevOS overview and Today queue composition;
- `AuthorizationService` — owner checks and access decisions;
- `AuditService` — append-only audit event creation.

Handlers in React Router, Hono, and the future MCP adapter call these services.

## 6. Public/private data separation

Security is enforced through separate queries and allowlisted serializers, not by loading a private entity and removing fields at the edge.

### 6.1 Public contracts

Representative contracts:

```ts
export type PublicProjectDto = {
  slug: string;
  name: string;
  publicSummary: string;
  publicProgress: number | null;
  featured: boolean;
  cover: PublicMediaDto | null;
  liveUrl: string | null;
  documentationUrl: string | null;
  lastPublicActivityAt: string | null;
};
```

A public DTO cannot contain:

- repository names for private repositories;
- private GitHub URLs;
- branches;
- blockers;
- private summaries;
- internal status basis;
- private evidence links;
- audit metadata;
- session details;
- secrets or external tokens.

### 6.2 Public visibility rules

- `public`: appears in navigation, listings, canonical metadata, and sitemap;
- `unlisted`: accessible by exact URL but absent from listings and sitemap;
- `private`: requires owner authorization and is unavailable through public loaders and APIs.

### 6.3 Verification requirements

Automated tests must inspect:

- anonymous HTML;
- route loader payloads;
- public API responses;
- metadata;
- `sitemap.xml`;
- `robots.txt`;
- structured data and Open Graph output;

and assert that known private markers do not occur.

## 7. Local authentication design

### 7.1 Provider interface

```ts
export interface AuthProvider {
  authenticate(credentials: OwnerCredentials): Promise<AuthResult>;
  resolveSession(rawToken: string): Promise<AuthenticatedOwner | null>;
  revokeSession(sessionId: string): Promise<void>;
}
```

The web and API applications depend only on this interface.

### 7.2 Local provider behavior

- One owner account is supported in the MVP.
- The password hash is supplied through environment configuration.
- No default password exists.
- A password-hashing script creates a deployable hash without printing the raw password after input.
- Successful login generates at least 32 random bytes for the session token.
- Only a cryptographic hash of the token is stored in the database.
- The raw token exists only in an `HttpOnly` cookie.
- Cookies use `SameSite=Lax`; production cookies also use `Secure`.
- Sessions have absolute expiry and can be revoked.
- Authentication failures use a generic response and are rate-limited.
- Missing authentication configuration fails closed: `/devos` and private APIs remain inaccessible.

### 7.3 Server-side protection

All `/devos` route loaders and actions perform authorization before reading private data. All private API middleware resolves and validates the session before invoking application services. Client-side route hiding is supplementary only.

## 8. Web routing and surface design

### 8.1 Public foundation routes

The first slice implements functional structure for:

- `/`;
- `/about`;
- `/projects`;
- `/projects/:slug`;
- `/journey`;
- `/lab`;
- `/notes`;
- `/stack`;
- `/contact`.

The home is fully designed and implemented. Secondary routes receive meaningful page structure, metadata, navigation, safe empty states, and extension points; they are not represented as finished editorial content until real content is approved.

### 8.2 Private foundation routes

- `/devos/login`;
- `/devos`;
- `/devos/today`;
- `/devos/projects`;
- `/devos/projects/:slug`;
- `/devos/roadmap`.

The navigation reserves the complete future information architecture without exposing nonfunctional controls as working features.

### 8.3 API partition

Public endpoints use an explicit `/api/v1/public/*` namespace. Private endpoints use `/api/v1/private/*` and authentication middleware. Future compatibility aliases may expose the canonical paths from the source specification, but internally the public/private split remains explicit.

## 9. Visual identity and design system

### 9.1 Direction

The identity is a technical editorial atelier rather than a dashboard template, résumé builder, or generic productivity product.

Public pages prioritize composition, whitespace, typography, narrative hierarchy, and selected project imagery. DevOS uses denser operational layouts while retaining the same tokens, icon language, and typography.

### 9.2 Foundation tokens

Initial dark theme values:

```css
--color-bg: #0b0d12;
--color-surface-1: #11141b;
--color-surface-2: #171b24;
--color-surface-3: #202633;
--color-border: #2b3342;
--color-text: #f4f7fb;
--color-muted: #98a2b3;
--color-primary: #7c8cff;
--color-success: #38c793;
--color-warning: #e8b455;
--color-danger: #ef6a72;
--color-info: #52a7ff;
```

Spacing follows a 4 px base. Interactive targets are at least 44 px on compact screens. Status uses icon, text, and color together. Motion respects `prefers-reduced-motion`.

### 9.3 Typography

- Public display typography may use a carefully selected variable font when it can be self-hosted or loaded without compromising performance and privacy.
- Body and operational typography use a highly legible sans-serif.
- Branches, commit identifiers, and code-like values use monospace.
- Tabular numbers are enabled for progress and metrics.

The exact font selection is an implementation decision that must be documented and tested for fallback behavior.

### 9.4 Component families

Foundation primitives:

- button;
- text link;
- icon button;
- input, textarea, select, checkbox;
- badge and status indicator;
- callout;
- card shell;
- section heading;
- divider;
- skeleton;
- empty state;
- error state;
- dialog and confirmation pattern;
- accessible disclosure/accordion.

Public compositions:

- editorial hero;
- featured project panel;
- principle list;
- activity strip;
- publication preview;
- public project header.

DevOS compositions:

- desktop sidebar;
- mobile bottom navigation;
- sync-age indicator;
- metric summary;
- project operational card;
- stage row/card;
- attention item;
- evidence reference;
- project hub header;
- roadmap filters.

### 9.5 Design tooling

Figma organizes tokens, components, states, and principal responsive frames. Supericons is used to select one coherent SVG family. Canva is optional for editorial imagery only. None of these tools becomes a runtime dependency or a source of business rules.

## 10. First-slice behavior

### 10.1 Public home

The home communicates the Semogtw identity, current areas of work, selected public projects, principles, recent public notes, laboratory entry, and contact paths. It must remain useful when no projects or notes have yet been approved for publication.

### 10.2 DevOS overview

The private `/devos` overview includes:

- active project count;
- in-progress stage count;
- unresolved high-impact attention count;
- synchronization age placeholder backed by stored state, not an invented live claim;
- up to two current stages per project;
- compact project cards;
- attention items;
- links to Today, Projects, and Roadmap.

### 10.3 Today

The Today queue sorts in-progress stages by project priority, partial blockage, stage order, and recent activity. It separates:

- execute now;
- next in queue;
- needs owner action;
- external dependencies;
- recent activity.

### 10.4 Projects and project hub

The Projects route separates active projects from the complete repository catalog. The project hub includes executive focus, next gate, repositories, current stages, attention, evidence, and session history. “Copy context for agent” is included only when its output is generated from persisted data and labels its timestamp and confidence.

### 10.5 Roadmap

The first Roadmap supports read-only list and board views, project filters, state filters, area filters, and responsive card conversion on compact screens. Mutation flows are introduced only after the domain transition tests and audit paths are in place.

## 11. Seed and migration policy

The initial implementation may include representative development seed data solely to exercise UI states and invariants. Such records must be marked as seed/demo data and must not be presented as a completed Notion migration or verified GitHub state.

The production migration remains a distinct process:

1. obtain a Notion export or accessible structured snapshot;
2. map stable IDs;
3. import projects, repositories, workstreams, stages, attention, sessions, and evidence in dependency order;
4. verify expected counts;
5. manually sample every active project;
6. revalidate technical facts against GitHub;
7. record origin as `migration`;
8. preserve the source snapshot for rollback and audit.

## 12. Error handling and observability

- External and storage errors are converted to typed application errors.
- Public responses never expose stack traces or internal identifiers.
- Logs are structured and redact secrets, cookies, raw authorization headers, and credentials.
- Correlation IDs are attached to private API requests and audit events.
- Stale data is displayed with an age indicator rather than silently replaced with an empty state.
- A failed refresh preserves the last valid persisted data.
- Authentication errors remain generic to avoid account and password probing.

## 13. Testing strategy

### 13.1 Unit tests

- stage completion invariants;
- blocked-stage requirements;
- Today queue ordering;
- public DTO allowlists;
- visibility transitions;
- publication approval rules;
- session token hashing and expiry;
- authorization decisions;
- audit-event construction.

### 13.2 Integration tests

- SQLite schema and migrations;
- repository implementations;
- local login, session resolution, and revocation;
- public versus private API middleware;
- SSR loaders with anonymous and authenticated requests;
- public serialization snapshots;
- import/export boundaries.

### 13.3 Browser tests

- anonymous public navigation on desktop and 360 × 800 viewport;
- `/devos` redirects to login when anonymous;
- valid login opens the private overview;
- invalid login does not create a session;
- private project and roadmap data do not occur in anonymous HTML or payloads;
- mobile bottom navigation does not obscure content;
- no horizontal overflow at 360 px;
- keyboard navigation and visible focus for primary flows.

### 13.4 Security checks

- secret-pattern scan over built client assets;
- HTML and payload scan for known private fixture markers;
- cookie attribute assertions;
- sanitized rich-text rendering tests;
- denial of unauthenticated private API requests;
- no private records in sitemap, metadata, or robots output.

## 14. Documentation produced during implementation

The implementation keeps these documents current:

- `README.md`;
- `ARCHITECTURE.md`;
- `DATA_MODEL.md`;
- `DESIGN_SYSTEM.md`;
- `PUBLIC_SITE.md`;
- `CONTENT_WORKFLOW.md`;
- `FRONTEND_TOOLING.md`;
- `MCP.md`;
- `GITHUB_SYNC.md`;
- `SECURITY.md`;
- `MIGRATION.md`;
- `DEPLOYMENT.md`;
- `TESTING.md`;
- `CHANGELOG.md`;
- `RUNBOOK.md`.

Documents for later capabilities explicitly distinguish designed contracts from implemented and tested behavior.

## 15. Versioning and deployment safety

No production deployment is part of the foundation unless separately requested and the target host has been verified.

Before any future deployment:

1. preserve the current revision with a commit and version tag or release;
2. export or back up persisted data;
3. run available unit, integration, browser, accessibility, and confidentiality checks;
4. inspect public and private previews on compact and desktop layouts;
5. verify environment secrets and client bundles;
6. test anonymous access to private routes and APIs;
7. document rollback instructions;
8. publish only after explicit owner approval.

## 16. Foundation acceptance criteria

The foundation is accepted only when evidence demonstrates that:

- the monorepo installs and builds with strict TypeScript settings;
- domain tests enforce the stage and publication invariants;
- the public home and listed route structures render with Semogtw identity;
- `/devos` is protected server-side;
- local authentication fails closed without required environment values;
- authenticated overview, Today, Projects, project hub, and Roadmap render from repositories rather than hardcoded component data;
- public loaders and APIs use allowlisted DTOs;
- anonymous HTML, payload, metadata, sitemap, and robots outputs contain no private fixture markers;
- the interface is usable at 360 px without horizontal overflow;
- primary interactions are keyboard accessible with visible focus;
- documentation accurately separates implemented, tested, designed, and blocked capabilities;
- no hosting mode, migration, GitHub synchronization, MCP integration, webhook, or background job is marked complete without direct evidence.

## 17. Deferred slices

The following are intentionally deferred but must use the interfaces established here:

1. Notion snapshot migration and count verification;
2. editable stages, evidence attachment, attention capture, and session recording;
3. GitHub authorization and conservative synchronization;
4. active-branch recommendation and conflict review;
5. remote MCP resources and tools;
6. editorial draft, sanitization, preview, approval, and publication workflow;
7. search, insights, command palette, and operational analytics;
8. scheduled reconciliation and optional webhooks;
9. verified production-host adapter and deployment mode selection.

Deferral is not completion. Every later slice requires its own tests and evidence.

## 18. Principal risks and controls

- **Runtime mismatch:** isolate adapters and avoid Node-only behavior in domain code.
- **Private-data leakage:** separate public queries and DTOs, then scan rendered output.
- **Authentication replacement cost:** depend on `AuthProvider`, not on local-provider details.
- **Premature migration claims:** clearly label seed records and require source count verification.
- **Generic visual result:** maintain separate editorial and operational compositions over shared tokens.
- **Framework concentration:** keep Hono, React Router, and Drizzle at composition boundaries.
- **Unverified hosting claims:** record production capabilities only after direct runtime evidence.
- **Large initial scope:** implement the foundation as independently testable slices with frequent commits and documentation updates.

## 19. Decision record

Approved decisions:

- identity is Semogtw rather than Arthur;
- the repository is `Semogtw/SemogSite`;
- the initial architecture is generic and host-portable;
- React Router, Hono, Zod, Drizzle, SQLite, Vitest, Playwright, and pnpm form the planned foundation stack;
- local authentication is implemented behind a replaceable `AuthProvider`;
- missing authentication configuration fails closed;
- public data is produced through dedicated allowlist DTOs;
- the first functional slice includes the public shell and home plus DevOS overview, Today, Projects, project hub, and Roadmap;
- migration, GitHub sync, MCP, automation, and deployment-mode selection require later evidence.
