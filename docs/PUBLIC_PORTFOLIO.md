# Public Portfolio V1

## Product priority

The current development priority is the **public professional portfolio**. The private Semogtw DevOS remains part of the platform and keeps its security/privacy boundaries, but new DevOS capabilities are secondary unless they are required to support the public portfolio or fix a regression.

The public surface should answer, in this order:

1. who Semogtw is;
2. what can be built;
3. where those skills are demonstrated;
4. which projects deserve deeper inspection;
5. what formation/certifications support the work;
6. how to continue the conversation.

The site must not read like product documentation for its own infrastructure. DevOS internals are implementation support, not the public value proposition.

## Primary information architecture

The primary public navigation is intentionally compact:

```text
/             portfolio home
/projects     project case studies
/stack        skills, presented by evidence
/credentials  formation and certificates
/about        professional profile and working approach
/contact      explicitly public contact channels
```

`/journey` is a useful complementary surface and is discoverable from the footer. `/lab` and `/notes` remain valid routes, but they are not promoted globally while they do not yet provide meaningful public content.

## Evidence-first presentation

Public claims should prefer inspectable evidence over arbitrary proficiency labels.

Avoid:

- percentage skill bars;
- unsupported `expert` / `advanced` labels;
- logo walls without context;
- fabricated credentials, sample certificates or fake metrics;
- exposing private repository/run/branch metadata merely to prove activity.

Prefer:

- project case studies;
- specific technologies tied to an implemented system;
- architecture/engineering decisions with context;
- test/build/verification evidence;
- completed credentials with exact issuer/status and a verification URL when available;
- explicit `em andamento` status for active formation.

## Current Portfolio V1 implementation

Implemented on `develop/public-portfolio-v1`:

- Home reframed from platform/infrastructure explanation to professional portfolio;
- primary navigation reduced to Projects, Skills, Credentials, About and Contact;
- active navigation semantics with `aria-current="page"` on desktop/mobile;
- mobile navigation closes with Escape and restores focus to its trigger;
- keyboard skip navigation moves focus explicitly to the public main content and is covered by Playwright;
- complementary Journey surface with current context and formation sourced from the same typed credential model;
- unfinished Lab/Notes surfaces removed from global navigation while remaining routable;
- evidence-led skill groups covering frontend/product, backend/APIs, data/persistence and software-engineering automation;
- typed public credential content model with explicit in-progress/completed states, related skills, issue date and optional verification URL;
- dedicated formation/credentials page that separates active study from completed certificates;
- project index copy reframed around case studies rather than repository listing;
- intentional empty project state that offers useful Skills/Journey paths without fabricating sample case studies;
- project detail layout reframed as a case study with public metadata, technical themes, reading context and portfolio cross-links;
- reusable case-study authoring template for problem, role, solution, decisions, trade-offs, verification, result and public links;
- private owner-editor preset that fills the case-study structure without approving or publishing anything;
- deterministic slug suggestion from title, which stops updating after manual slug edits;
- About placeholder replaced by a concise professional profile and working approach;
- Contact placeholder replaced by an allowlisted public GitHub channel;
- responsive portfolio-specific layout styles and updated root metadata;
- provider-neutral canonical links plus Open Graph and Twitter metadata;
- published editorial details advertised as `og:type=article`, while indexes remain `website`;
- minimal factual Home JSON-LD using the public Semogtw identity and GitHub profile, with script-safe serialization;
- dynamic `/robots.txt` backed by a single route rather than a competing static file;
- dynamic `/sitemap.xml` containing static portfolio routes plus only published editorial projections;
- Notes discovery follows real publication state: the empty index is `noindex` and absent from the sitemap, then becomes discoverable when a reviewed note is published;
- Playwright topology that runs the canonical API and web app together under a browser-facing same-origin facade in tests only, with the API upstream restricted to loopback;
- dedicated auth-topology E2E proving anonymous session, same-origin owner login, authenticated session and cross-site mutation rejection;
- Playwright coverage for workflow/privacy, complete editorial publish/replace/rollback/withdraw behavior, primary portfolio navigation, discovery endpoints and a 360 px viewport;
- unit coverage for active public-navigation semantics, canonical slug suggestion, metadata/discovery helpers and structured-data escaping.

No private DevOS data is used as public portfolio content.

## Publication boundary

The existing editorial boundary remains authoritative for project/note publication:

- unpublished drafts remain private;
- public project content comes only from the approved/published projection;
- operational repository status, branches, blockers, runs, reviewer notes and owner-only workflow state remain private;
- a portfolio redesign does not weaken confidentiality guardrails;
- the case-study preset creates only a private draft and does not bypass review/approval/publication.

Static professional/profile copy may be committed directly when it is deliberately public and contains no inferred private integration data. Dynamic project content continues to use the editorial publication path.

## Completed implementation slices

### Project case-study anatomy

Portfolio V1 provides a stable public case-study shell without expanding the public DTO. The semantic depth lives in the reviewed Markdown body, using `docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md` as the authoring convention.

The owner editor can preload the same structure into a new private `project` draft. This keeps problem/context, role, solution, architecture decisions, technologies, trade-offs, verification, result and public links expressible without coupling the public route to private DevOS state.

### Credential content model

Public credentials use a small typed content module supporting:

- title;
- issuer;
- kind;
- completion/status;
- issue/completion date when relevant;
- verification URL when available;
- related skills.

Course enrollment is never promoted automatically to a completed credential. The public date field is intentionally named `issuedOn`, avoiding collision with protected private run-lifecycle vocabulary.

### Public navigation and secondary surfaces

The primary header favors recruiter/reviewer tasks. `Journey` is kept as a complementary surface, while empty Lab/Notes routes are not advertised globally. The active primary destination is exposed semantically through `aria-current` and has distinct desktop/mobile states. Keyboard users can skip repeated public navigation directly to an explicitly focusable main region.

### Discovery and sharing foundation

Canonical paths, Open Graph/Twitter metadata, structured data, robots policy and sitemap generation are now part of the V1 implementation rather than future work. Discovery intentionally follows publication state: private or withdrawn editorial content never enters the sitemap, unknown detail routes remain `noindex`, and an empty Notes index is withheld from search discovery until it contains published content.

The deployment-domain decision remains provider-neutral. Canonical metadata uses path-form URLs until the final public origin is deliberately configured rather than hard-coding a preview host.

### Browser/API verification topology

Playwright exercises the same canonical authentication/private API surface used by the application. During E2E only, the web server proxies `/api/*` to the loopback API process so browser cookies and same-origin defenses are exercised without reintroducing the retired Node auth facade. The proxy is disabled outside `NODE_ENV=test` and rejects non-loopback upstreams.

## Next implementation slices

### 1. Real public content

Prepare and publish the first reviewed project case studies through the existing editorial flow. Do not bypass publication review merely to avoid an empty project list.

Populate completed credentials only from exact, deliberately public information with issuer/date/verification metadata when available.

### 2. Portfolio visual refinement

Continue a dedicated public-only polish pass:

- desktop and 360 px review;
- typography and section rhythm;
- hover/focus/keyboard states;
- project media treatment;
- reduced-motion behavior;
- intentional empty states;
- no visual regressions in private DevOS surfaces.

### 3. Sharing assets and deployment-origin finalization

The metadata/discovery plumbing exists. Remaining work after the public origin and stable content are known is limited to assets/configuration that should not be fabricated early:

- a deliberate social preview image treatment;
- absolute public-origin/canonical configuration if required by the selected deployment;
- final crawler policy review against the chosen deployment visibility.

## Verification

Use the public `Semogtw/Offline-Toolchains` CI hub for private SemogSite checkout and expensive gates. Portfolio changes are not considered fully verified merely because the source compiles visually by inspection.

Expected gate class:

```text
frozen install
boundary/confidentiality checks
focused tests/typechecks
full pnpm check
production web build
isolated Playwright auth/privacy/editorial/portfolio flows
```

Observed Portfolio V1 checkpoints:

- `0cfcc1d57875ef4f449555c9fbec60d5ca3260f7`: checkout and several focused checks ran, then `pnpm check` correctly rejected the public credential field name `completedAt` because it collides with protected run-lifecycle vocabulary. The public field was renamed to `issuedOn`; the guardrail was not weakened.
- `7fb9b427d7cd745ed4b43e2a65cd072bef2ab2e8`: the prior confidentiality failure was resolved; the next failure was a TypeScript `exactOptionalPropertyTypes` mismatch on the optional public navigation `activeHref`. The component contract was corrected.
- `4da3f672c0109e2331c6a0f652e6317e96ae1911`: **fully verified V1 checkpoint**. Both public-hub jobs checked out this exact private commit and completed successfully. The shared gate reported 260 test files / 964 passing tests plus build/workflow checks; the specialized run passed auth topology 2/2, workflow privacy 6/6, editorial publication 2/2 and public portfolio 6/6.
- `1d311da7c66c80dd0678b463342858dbb08c6980`: **latest fully verified portfolio checkpoint**. Public-hub run `32260949001`, specialized job `96093847567`, checked out this exact private SHA. Frozen install, native SQLite verification, guardrails/boundaries/confidentiality checks, recursive typecheck, full Vitest workspace (**260 files / 964 tests**), aggregated `pnpm check` and production web build all passed. E2E outcomes were auth topology **2/2**, workflow privacy **6/6**, editorial publication **2/2** and public portfolio **6/6**; all sanitized failure markers remained skipped and the private checkout was removed after verification.

The public CI receipt intentionally omits the private resolved SHA and logs; exact-head attribution is verified from the protected job checkout while the public issue exposes only sanitized outcomes.

Any commit after `1d311da7c66c80dd0678b463342858dbb08c6980` must be treated as newer than that green checkpoint until reverified.

If a runner or external dependency blocks a gate, record the limitation and continue with code tasks that can still be resolved.
