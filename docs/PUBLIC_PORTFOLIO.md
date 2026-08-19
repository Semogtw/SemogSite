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

`/lab`, `/notes` and `/journey` remain valid secondary editorial surfaces, but they are not primary navigation in Portfolio V1.

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
- evidence-led skill groups covering frontend/product, backend/APIs, data/persistence and software-engineering automation;
- typed public credential content model with explicit in-progress/completed states, related skills and optional verification metadata;
- dedicated formation/credentials page that separates active study from completed certificates;
- project index copy reframed around case studies rather than repository listing;
- project detail layout reframed as a case study with public metadata, technical themes, reading context and portfolio cross-links;
- reusable case-study authoring template for problem, role, solution, decisions, trade-offs, verification, result and public links;
- About placeholder replaced by a concise professional profile and working approach;
- Contact placeholder replaced by an allowlisted public GitHub channel;
- responsive portfolio-specific layout styles and updated root metadata;
- Playwright coverage for primary portfolio navigation, anonymous page reachability and a 360 px viewport.

No private DevOS data is used as public portfolio content.

## Publication boundary

The existing editorial boundary remains authoritative for project/note publication:

- unpublished drafts remain private;
- public project content comes only from the approved/published projection;
- operational repository status, branches, blockers, runs, reviewer notes and owner-only workflow state remain private;
- a portfolio redesign does not weaken confidentiality guardrails.

Static professional/profile copy may be committed directly when it is deliberately public and contains no inferred private integration data. Dynamic project content continues to use the editorial publication path.

## Completed implementation slices

### Project case-study anatomy

Portfolio V1 now provides a stable public case-study shell without expanding the public DTO. The semantic depth lives in the reviewed Markdown body, using `docs/editorial/PROJECT_CASE_STUDY_TEMPLATE.md` as the authoring convention.

This keeps problem/context, role, solution, architecture decisions, technologies, trade-offs, verification, result and public links expressible without coupling the route to private DevOS state.

### Credential content model

Public credentials now use a small typed content module supporting:

- title;
- issuer;
- kind;
- completion/status;
- completion date when relevant;
- verification URL when available;
- related skills.

Course enrollment is never promoted automatically to a completed credential.

## Next implementation slices

### 1. Portfolio visual refinement

After the information hierarchy is stable, perform a dedicated public-only polish pass:

- desktop and 360 px review;
- typography and section rhythm;
- hover/focus/keyboard states;
- project media treatment;
- reduced-motion behavior;
- empty states that still look intentional;
- no visual regressions in private DevOS surfaces.

### 2. Real public content

Prepare and publish the first reviewed project case studies through the existing editorial flow. Do not bypass publication review merely to avoid an empty project list.

Populate completed credentials only from exact, deliberately public information with issuer/date/verification metadata when available.

### 3. Discovery and sharing

Add after content stabilizes:

- canonical/public metadata review;
- Open Graph/social preview assets;
- sitemap/robots policy suitable for the chosen deployment visibility;
- structured data where it is accurate and useful.

## Verification

Use the public `Semogtw/Offline-Toolchains` CI hub for private SemogSite checkout and expensive gates. Portfolio changes are not considered fully verified merely because the source compiles visually by inspection.

Expected gate class:

```text
frozen install
boundary/confidentiality checks
focused tests/typechecks
full pnpm check
production web build
isolated Playwright privacy/mobile navigation
```

Portfolio-specific Playwright coverage now also checks the five primary public destinations and a 360 px path through Home, Credentials and Contact.

If a runner or external dependency blocks a gate, record the limitation and continue with code tasks that can still be resolved.
