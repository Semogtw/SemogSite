# Public Portfolio V1

> Atualizado em 25 de agosto de 2026. Para o inventário operacional mais detalhado de superfícies, lacunas e sequência de trabalho, consulte [`docs/SITE_STATUS.md`](SITE_STATUS.md).

## Product priority

The current development priority is the **public professional portfolio**.

The private Semogtw DevOS remains part of the platform and keeps its security/privacy boundaries, but new DevOS capabilities are secondary unless they:

- fix a regression;
- protect security/privacy;
- unblock the editorial publication path;
- are strictly required by the public portfolio.

The public surface should answer, in this order:

1. who Semogtw is;
2. what can be built;
3. where those skills are demonstrated;
4. which projects deserve deeper inspection;
5. what formation/certifications support the work;
6. how to continue the conversation.

The site must not read like product documentation for its own infrastructure. DevOS internals are implementation support, not the public value proposition.

## Active development line

The public portfolio is developed on `develop/public-portfolio-v1`.

Before the 25 August documentation refresh, this branch was at `adaa00fd182fea4776f424fc6b42dde152bde891`, **162 commits ahead of `main` and 0 behind**. `main` was still at `42adc1b578d33e272f55dff568acb9597221bae9`.

Until the public line is deliberately merged, `main` must not be treated as the source of truth for the current public-site UX.

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

Complementary navigation in the public footer currently exposes:

```text
/notes        reviewed public technical notes
/journey      professional/learning trajectory
```

`/lab` remains a valid route but is not promoted globally. It is secondary until it has a clear portfolio role.

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

### Public shell and navigation

- public-only header and footer composition;
- primary navigation reduced to Projects, Skills, Credentials, About and Contact;
- complementary footer links for Notes and Journey;
- active navigation semantics with `aria-current="page"` on desktop/mobile;
- mobile navigation closes with Escape and restores focus to its trigger;
- keyboard skip navigation moves focus explicitly to the public main content and is covered by Playwright;
- Lab kept outside global navigation while it remains secondary.

### Home

- Home reframed from platform/infrastructure explanation to professional portfolio;
- hero oriented around projects and demonstrated work;
- evidence-led capability highlights;
- selected-project area backed by the published projection;
- intentional zero-project state with no fake case studies;
- formation/certification preview;
- contact CTA;
- factual JSON-LD and page-specific metadata.

### Projects

- project index copy reframed around case studies rather than repository listing;
- intentional empty state that offers useful Skills/Journey paths without fabricating sample case studies;
- project detail layout reframed as a case study with public metadata, technical themes, reading context and portfolio cross-links;
- reusable case-study authoring template for problem, role, solution, decisions, trade-offs, verification, result and public links;
- private owner-editor preset that fills the case-study structure without approving or publishing anything;
- deterministic slug suggestion from title, which stops updating after manual slug edits;
- public project data comes only from the approved/published projection.

### Skills

- evidence-led skill groups covering frontend/product, backend/APIs, data/persistence and software-engineering automation;
- no arbitrary progress percentages or proficiency labels;
- current evidence anchored mainly in SemogSite and Offline-Toolchains;
- future project publications can deepen those links without changing the page architecture.

### Formation and credentials

- typed public credential content model with explicit in-progress/completed states;
- academic, professional-track, course and certification kinds;
- related skills, optional issue date and optional verification URL;
- dedicated formation/credentials page that separates active study from completed certificates;
- current in-progress public entries for Computer Science at UESB and the Data Analyst track at DataCamp;
- no fabricated completed certificate used as placeholder content.

### About, Contact and Journey

- About placeholder replaced by a concise professional profile and working approach;
- Contact placeholder replaced by allowlisted public contact information;
- Journey surface connects formation and projects using the same typed credential model.

### Notes

- public note index and detail routes;
- publication-state-aware discovery;
- empty Notes index remains `noindex` until reviewed content is published;
- Notes is now reachable from the public footer, so it is a complementary promoted route even when its content inventory is still small or empty.

### Discovery and sharing

- provider-neutral canonical links plus Open Graph and Twitter metadata;
- published editorial details advertised as `og:type=article`, while indexes remain `website`;
- minimal factual Home JSON-LD using the public Semogtw identity and GitHub profile, with script-safe serialization;
- dynamic `/robots.txt` backed by a single route rather than a competing static file;
- dynamic `/sitemap.xml` containing static portfolio routes plus only published editorial projections;
- unknown, withdrawn or unpublished editorial content excluded from discovery.

### Verification and browser topology

- Playwright topology runs the canonical API and web app together under a browser-facing same-origin facade in tests only, with the API upstream restricted to loopback;
- dedicated auth-topology E2E proving anonymous session, same-origin owner login, authenticated session and cross-site mutation rejection;
- Playwright coverage for workflow/privacy, complete editorial publish/replace/rollback/withdraw behavior, primary portfolio navigation, discovery endpoints and a 360 px viewport;
- unit coverage for active public-navigation semantics, canonical slug suggestion, metadata/discovery helpers and structured-data escaping.

No private DevOS data is used as public portfolio content.

## Publication boundary

The existing editorial boundary remains authoritative for project/note publication:

- unpublished drafts remain private;
- public project/note content comes only from the approved/published projection;
- operational repository status, branches, blockers, runs, reviewer notes and owner-only workflow state remain private;
- a portfolio redesign does not weaken confidentiality guardrails;
- the case-study preset creates only a private draft and does not bypass review/approval/publication.

Static professional/profile copy may be committed directly when it is deliberately public and contains no inferred private integration data. Dynamic project/note content continues to use the editorial publication path.

## Component status

| Surface | V1 structure | Real content | Current priority |
| --- | --- | --- | --- |
| Home | done | partial | refine after case studies |
| Projects index/detail | done | needs strong published cases | **P0** |
| Skills | done | usable, can gain stronger project links | P1 |
| Credentials | done | active study present; completed catalog needs enrichment | **P0** |
| About | done | usable | low |
| Contact | done | usable | low |
| Journey | done | usable | low |
| Notes | done | depends on reviewed publications | P2 |
| Lab | route exists | role/content not defined | P2 |
| SEO/discovery | foundation done | final origin/assets pending | P1 |
| DevOS | mature private subsystem | not public value proposition | maintenance only |

## Next implementation slices

### P0. Real public project content

The biggest remaining portfolio gap is content, not infrastructure.

Prepare and publish the first strong project case studies through the existing editorial flow. Each priority case should cover:

- problem/context;
- role/responsibility;
- solution;
- architecture and important decisions;
- technologies and why they were used;
- trade-offs;
- verification/testing;
- outcome;
- lessons learned;
- public demo/code/release/docs links when they actually exist.

Do not bypass publication review merely to avoid an empty project list.

Target the first **3–5 projects** so the Home, Skills and Projects surfaces can be judged with real content instead of placeholders/empty states.

### P0. Real completed credentials

Populate completed credentials only from exact, deliberately public information with issuer/date/verification metadata when available.

Do not infer completion from enrollment or course progress.

### P1. Evidence integration

After the first case studies exist:

- link skill areas to the best supporting projects;
- make Home capability claims point to concrete work;
- surface project-specific verification/result evidence;
- avoid duplicate generic claims across pages.

### P1. Portfolio visual refinement

Continue a dedicated public-only polish pass **after real content is present**:

- desktop and 360 px review;
- intermediate breakpoints;
- typography and section rhythm;
- hover/focus/keyboard states;
- project media treatment;
- reduced-motion behavior;
- intentional empty states;
- consistent visual hierarchy across Home, Projects, Skills and Credentials;
- no visual regressions in private DevOS surfaces.

### P1. Project media and explanation

Use visuals only when they improve understanding:

- screenshots of real UI;
- architecture diagrams;
- selective galleries;
- hero/cover treatment where a project has meaningful media.

Avoid decorative media that adds maintenance without increasing comprehension.

### P1. Sharing assets and deployment-origin finalization

The metadata/discovery plumbing exists. Remaining work after the public origin and stable content are known is limited to assets/configuration that should not be fabricated early:

- deliberate social preview image treatment;
- absolute public-origin/canonical configuration if required by the selected deployment;
- final crawler policy review against the chosen deployment visibility;
- final title/description review using the real published portfolio vocabulary.

### P2. Notes and Lab

Only after the main portfolio reads as complete enough:

- publish technical notes that are worth preserving publicly;
- decide whether `/lab` deserves a clear function or should remain unpromoted;
- do not create filler merely to activate these routes.

### P2. Private DevOS

New private features stay below the public queue unless they are required to publish the portfolio or protect the system.

## Priority rule

Until the public site stops being the product's main gap, choose work in this order:

```text
public content/evidence
> portfolio clarity and UX
> public accessibility/SEO/performance
> infrastructure required to publish
> DevOS maintenance
> new private capabilities
```

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
- `1d311da7c66c80dd0678b463342858dbb08c6980`: **latest fully verified portfolio checkpoint currently documented**. Public-hub run `32260949001`, specialized job `96093847567`, checked out this exact private SHA. Frozen install, native SQLite verification, guardrails/boundaries/confidentiality checks, recursive typecheck, full Vitest workspace (**260 files / 964 tests**), aggregated `pnpm check` and production web build all passed. E2E outcomes were auth topology **2/2**, workflow privacy **6/6**, editorial publication **2/2** and public portfolio **6/6**; all sanitized failure markers remained skipped and the private checkout was removed after verification.

The public CI receipt intentionally omits the private resolved SHA and logs; exact-head attribution is verified from the protected job checkout while the public issue exposes only sanitized outcomes.

Any commit after `1d311da7c66c80dd0678b463342858dbb08c6980` must be treated as newer than that green checkpoint until reverified.

If a runner or external dependency blocks a gate, record the limitation and continue with code tasks that can still be resolved.
