# Semogtw Learning, Growth, Evidence and Credentials — Design Specification

**Status:** Approved planning baseline  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Base:** descendant of `develop/remote-mcp-spark-planning` at `9da8fb45f73ea1f675d2e0cded1a2c7303811a91`

## 1. Decision

Semogtw DevOS will gain a private, provider-neutral **Growth** domain for learning goals, measurable checkpoints, skills, evidence and credentials.

The DevOS database is the canonical source of truth. Gemini Spark, another MCP client, GitHub, Gmail and future providers are adapters that may read, propose or submit bounded mutations; none owns canonical progress or may infer completion without accepted evidence.

The product flow is:

```text
Owner intent / Spark request
          │
          ▼
Learning goal + checkpoints in DevOS
          │
          ├── manual study/activity
          ├── GitHub observations
          ├── certificates/credentials
          ├── assessments/projects
          └── external evidence candidates
                    │
                    ▼
          proposal and review pipeline
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
       rejected            accepted
                               │
                               ▼
                 checkpoint/skill projection
                               │
                               ▼
                  derived goal progress
```

Spark is a useful coordinator and acceptance target, not a dependency. The same domain and UI must remain fully useful without Spark, Google AI Pro, Gmail, a remote MCP endpoint or a paid model API.

## 2. Alternatives considered

### A. Spark-centric state

Store goals and progress mainly in Spark tasks/prompts and use the site as a display.

Rejected because provider state is not a durable domain model, cannot guarantee complete audit/backup, makes migration difficult and ties progress semantics to one external product.

### B. Direct AI-controlled percentage updates

Let an AI inspect GitHub/email and directly set a goal to a percentage or completed state.

Rejected because model confidence is not evidence, code presence does not prove learning, email text is untrusted, and arbitrary percentages are difficult to audit or reproduce.

### C. Canonical DevOS domain with evidence proposals

Persist goals/checkpoints/skills in DevOS, stage external findings as proposals, accept evidence through explicit rules or owner review, and derive progress from accepted checkpoint state.

Selected because it is provider-neutral, testable, explainable, reversible and compatible with supervised MCP writes and deterministic server-side automation.

## 3. Product goals

The Growth domain must let the owner:

1. create a learning goal manually or from a supervised external-agent request;
2. define ordered checkpoints with weights and measurable completion rules;
3. connect one goal/checkpoint to one or more skills;
4. see what evidence supports each checkpoint and skill claim;
5. collect GitHub, credential, course, assessment and manual evidence;
6. review proposed evidence before it affects canonical progress by default;
7. configure narrow deterministic auto-accept rules for trusted sources;
8. derive progress rather than accepting an unexplained percentage;
9. import certificate metadata from a Gmail/Spark workflow without exposing Gmail credentials to DevOS;
10. obtain periodic briefings and recommendations through Spark or another client;
11. export or back up all canonical learning history independently of providers.

## 4. Non-goals

The first complete product does not:

- claim that a commit proves comprehension;
- calculate employability, intelligence or universal mastery scores;
- scrape course portals or provider UIs;
- store Gmail cookies, Google access tokens or entire mailbox contents;
- execute arbitrary repository code to determine competence;
- automatically complete a goal solely from file extensions, commit messages or LLM classification;
- publish private learning state on the public site;
- add a generic unrestricted MCP mutation tool;
- make Spark schedules canonical or safety-critical;
- require a vector database or embedding service;
- implement social comparison, leaderboards or gamification in the initial slice.

## 5. Domain boundaries

### 5.1 `packages/domain` — Growth

A new framework-free domain module owns:

- goal/checkpoint lifecycle;
- skill identity and aliases;
- checkpoint progress semantics;
- evidence candidate and review state;
- evidence-to-checkpoint/skill claims;
- credential validation rules;
- deterministic progress derivation;
- source policy evaluation;
- idempotency and optimistic-concurrency contracts;
- stable domain error codes.

It imports no React, TanStack, Hono, Drizzle, SQLite, MCP SDK, GitHub SDK or Google SDK.

### 5.2 `packages/database`

Adds additive migrations and SQLite repositories/read models. Entity changes, append-only domain events and global audit rows share one immediate transaction where applicable.

### 5.3 `apps/web`

Adds owner-only DevOS pages and server functions under `/devos/growth`. Every mutation re-resolves the owner, validates CSRF, bounded input, confirmation where sensitive, expected version and idempotency.

### 5.4 `packages/github`

Remains GET-only. Existing normalized GitHub observations may be referenced as evidence sources. A future webhook/synchronization adapter persists normalized observations, not instructions from commit messages.

### 5.5 `packages/mcp`

Adds only strict provider-neutral read/proposal tool contracts after their dependent domain slices exist. It remains transport/auth/database-free.

### 5.6 Spark and Gmail

Spark may combine its Gmail/GitHub access with the Semogtw MCP endpoint. The SemogSite endpoint receives only bounded normalized arguments. Google credentials and raw mailbox access stay outside the SemogSite runtime.

## 6. Core model

### 6.1 Learning goal

```ts
export type LearningGoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type LearningGoal = {
  id: string;
  slug: string;
  title: string;
  description: string;
  motivation: string | null;
  status: LearningGoalStatus;
  priority: "low" | "medium" | "high" | "critical";
  targetDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

Rules:

- slugs are lowercase canonical private identifiers;
- `completed` requires every required checkpoint completed or explicitly waived by an owner action;
- cancellation/archive never deletes evidence/history;
- a draft can be created by a supervised external proposal, but activation is an explicit owner or authorized audited action;
- target dates are planning data, not proof of overdue failure.

The first version supports learning goals only. Generic habits, health, finance and unrelated personal goals require separate domain extensions rather than overloading this aggregate.

### 6.2 Checkpoint

```ts
export type LearningCheckpointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "waived"
  | "cancelled";

export type CheckpointCompletionMode =
  | { kind: "binary" }
  | { kind: "numeric"; unit: string; target: number };

export type LearningCheckpoint = {
  id: string;
  goalId: string;
  sequence: number;
  title: string;
  description: string;
  status: LearningCheckpointStatus;
  required: boolean;
  weight: number;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  version: number;
};
```

Rules:

- sequence is contiguous within a goal;
- weight is a positive integer from 1 to 100;
- numeric target is positive and bounded;
- accepted values come from owner actions or accepted evidence claims, never from unreviewed model output;
- binary completion requires an accepted completion action/claim;
- waiver requires owner confirmation, reason and audit;
- cancelled checkpoints do not count in the active progress denominator.

### 6.3 Skill catalog

```ts
export type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "merged" | "archived";
  canonicalSkillId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type SkillStage =
  | "introduced"
  | "practicing"
  | "applied"
  | "demonstrated";
```

Skills are private owner-controlled taxonomy. Aliases such as `js` → `javascript` may be merged without deleting historical links.

A skill stage is an evidence-backed projection, not a universal proficiency score. `demonstrated` means the configured evidence requirements were met in this system; it does not claim professional certification or comprehensive mastery.

### 6.4 Goal/checkpoint skill links

A goal may target several skills. Each checkpoint may target a subset with a desired stage. Link rows are versioned/audited when changed.

## 7. Progress semantics

Goal progress is derived:

```text
sum(effective checkpoint weight × checkpoint completion ratio)
──────────────────────────────────────────────────────────────
             sum(effective checkpoint weights)
```

Completion ratio:

- binary pending/in-progress: `0`;
- binary completed/waived: `1`;
- numeric: `clamp(acceptedValue / target, 0, 1)`;
- cancelled: excluded from denominator.

Rules:

- no API or MCP tool accepts a direct goal percentage;
- the UI always shows the underlying checkpoint basis;
- completing a goal is a separate guarded transition after derived progress reaches 100%;
- changing checkpoint weights/targets after accepted evidence requires expected version and audit;
- historical progress can be reconstructed from append-only events.

## 8. Evidence model

### 8.1 Evidence candidate

An evidence candidate is an untrusted proposed observation.

```ts
export type EvidenceSourceKind =
  | "manual"
  | "github_commit"
  | "github_pull_request"
  | "github_workflow"
  | "certificate"
  | "course"
  | "assessment"
  | "project"
  | "external_agent";

export type EvidenceCandidateStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "superseded";
```

Candidate fields include:

- source kind and stable source reference;
- observed timestamp and ingestion timestamp;
- bounded neutral title/summary;
- normalized metadata JSON allowlist;
- content hash/deduplication key;
- proposer (`owner`, adapter/client ID or system policy);
- source confidence (`high`, `medium`, `low`, `unknown`);
- status, review reason and version.

Raw provider response bodies, email bodies, authorization headers and secret-bearing URLs are not persisted.

### 8.2 Evidence claim

A candidate may make one or more explicit claims:

```ts
export type EvidenceClaimKind =
  | "checkpoint_progress"
  | "checkpoint_completion"
  | "skill_stage"
  | "goal_context";
```

A claim identifies the exact goal/checkpoint/skill, proposed numeric value or stage, basis text and confidence. A model may propose a claim, but only accepted claims affect projections.

### 8.3 Review

Default policy is `owner_review_required`.

Review actions:

```text
evidence.propose
evidence.accept
evidence.reject
evidence.supersede
```

Acceptance validates target versions and source freshness. Rejection preserves the candidate and reason. A changed candidate cannot reuse an old approval.

### 8.4 Source policies

```ts
export type EvidenceAcceptancePolicy =
  | "informational_only"
  | "owner_review_required"
  | "deterministic_auto_accept";
```

`deterministic_auto_accept` is allowed only for narrowly configured rules whose output is reproducible without an LLM, for example:

- an exact trusted credential issuer + credential ID + verification URL pattern;
- a specific repository workflow passing on the accepted branch/SHA for an explicitly configured checkpoint;
- a numeric assessment result from a reviewed adapter with a fixed threshold.

LLM classification, commit-message keywords, file extensions and email subject text can create proposals but cannot be auto-accept rules.

## 9. GitHub evidence

GitHub evidence must use normalized persisted observations or bounded MCP arguments referencing an exact repository, branch and SHA/PR/workflow run.

Supported initial candidate types:

- commit touches configured paths/languages;
- PR merged with bounded changed-file metadata;
- workflow/test run observed for exact SHA;
- repository/project artifact explicitly linked by the owner.

A GitHub candidate may support statements such as “used Java in a Spring project” but does not by itself prove understanding. Completion rules may require combined accepted evidence, such as code plus tests plus owner review.

Commit messages, README text, issues and PR bodies are untrusted data and are never executed as instructions. The default candidate summary does not copy arbitrary provider text.

Delivery order:

1. existing/manual owner refresh using normalized observations;
2. Spark or another client proposes evidence after reading GitHub;
3. selected-host scheduled reconciliation;
4. signed GitHub webhook adapter.

The domain is correct without scheduled delivery; stale source data is shown as stale/unknown.

## 10. Credentials and certificates

### 10.1 Canonical credential

```ts
export type CredentialStatus =
  | "pending_review"
  | "verified"
  | "unverified"
  | "expired"
  | "revoked"
  | "rejected";

export type LearningCredential = {
  id: string;
  title: string;
  issuer: string;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialId: string | null;
  verificationUrl: string | null;
  hours: number | null;
  status: CredentialStatus;
  sourceCandidateId: string | null;
  attachmentRef: string | null;
  attachmentSha256: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

Rules:

- URL schemes are HTTPS only;
- credential IDs and issuer/title/date combinations are deduplicated;
- expiration is derived at read time unless explicit revocation exists;
- “verified” requires a configured deterministic verification result or explicit owner review;
- an email claiming a certificate creates `pending_review`, not `verified`;
- attachments are stored in private host storage, not SQLite blobs, with content-type/size limits and SHA-256;
- storage is optional: normalized metadata remains usable without retaining the file.

### 10.2 Gmail/Spark ingestion

A Gmail monitor or Spark task may extract:

- title;
- issuer;
- issue/expiry date;
- course hours;
- credential ID;
- verification URL;
- Gmail message reference suitable for the owner, when available.

It calls a bounded proposal tool. The SemogSite does not receive Gmail credentials or broad mailbox access. Raw email body and attachment bytes are not required in the first integration.

The owner reviews the candidate in `/devos/growth/credentials`. A future direct Gmail adapter requires a separate threat model and token-storage decision.

## 11. Private UI

Routes:

```text
/devos/growth
/devos/growth/goals
/devos/growth/goals/$goalId
/devos/growth/evidence
/devos/growth/skills
/devos/growth/credentials
/devos/growth/integrations
```

### Growth overview

Shows:

- active goals and derived progress;
- checkpoints due/ready for review;
- evidence candidates awaiting action;
- recently accepted evidence;
- credentials requiring review or expiring;
- skill stages with evidence basis;
- source freshness and automation health.

### Goal detail

Shows:

- purpose, status, dates and priority;
- ordered checkpoints and weights;
- progress derivation;
- linked skills;
- accepted/pending evidence;
- immutable event history;
- owner actions for lifecycle, checkpoint changes and evidence review.

### Mobile behavior

At 360 px:

- title/status/progress and next checkpoint remain above the fold;
- evidence review uses a dedicated page or bottom sheet;
- no horizontal tables;
- actions have explicit confirmation and accessible labels;
- long evidence metadata is collapsed and selectable rather than overflowing.

## 12. MCP catalog

### 12.1 Read tools

After the core and evidence slices exist, add:

```text
devos_list_learning_goals
devos_get_learning_goal
devos_list_due_learning_checkpoints
devos_get_skill_profile
devos_list_learning_evidence
devos_list_credentials
```

Reads are bounded, strict-schema validated, private and idempotent.

### 12.2 Proposal/write tools

These names are reserved but are not authorized by this design alone:

```text
devos_create_learning_goal
devos_add_learning_checkpoint
devos_propose_learning_evidence
devos_propose_goal_progress
devos_propose_credential
devos_link_goal_repository
```

A separate MCP write-authorization design must define scopes, confirmation, idempotency, optimistic versions, audit and transport/client compatibility after the remote read-only endpoint is verified.

Safety posture:

- goal/checkpoint creation may become a supervised canonical write;
- external evidence and credentials enter as proposals;
- no MCP tool directly sets a percentage, completes a goal, accepts evidence, verifies a credential, waives a checkpoint or publishes private data;
- sensitive final actions remain in owner UI unless a later reviewed scope explicitly permits them.

## 13. Spark workflows

### 13.1 Create a learning plan

Owner request:

> Quero aprender Python para automação. Crie uma meta com checkpoints práticos.

Spark generates bounded proposed fields and invokes supervised goal/checkpoint writes. DevOS validates and records the exact actor/client/idempotency context.

### 13.2 Weekly GitHub evidence review

1. read active goals/checkpoints from SemogSite;
2. inspect relevant GitHub repositories with read-only access;
3. identify exact SHA/PR/workflow evidence;
4. create evidence proposals;
5. notify the owner of proposals awaiting review;
6. never mark completion from silence or LLM confidence.

### 13.3 Gmail credential monitor

1. trigger on a likely course/certificate email;
2. extract normalized metadata;
3. call `devos_propose_credential`;
4. owner reviews/accepts in DevOS;
5. duplicate or ambiguous candidates remain visible without silent overwrite.

### 13.4 Growth briefing

Read-only recurring summary combines DevOS goals/evidence with Google Calendar/Gmail/Tasks on the Spark side. SemogSite receives no Workspace credentials.

### 13.5 Inactive goal review

Spark may notify when a goal has no accepted evidence or checkpoint activity for a configured period. The copy must say “sem evidência recente” rather than “você não estudou”.

## 14. Security and privacy

Protected assets include:

- learning goals, motivations, dates and progress;
- skill taxonomy and assessments;
- private repository/branch/SHA evidence;
- certificates, credential IDs, verification URLs and files;
- external message references;
- evidence decisions, reasons and policy configuration;
- MCP proposal payloads and automation history.

Controls:

- owner authentication for every private read/write;
- CSRF, confirmation, expected version, idempotency and audit for browser mutations;
- remote OAuth scopes separate from browser cookies;
- strict allowlisted DTOs and no public fallback;
- prompt-injection defense: provider/email text is data, never instruction;
- bounded strings, lists, metadata depth and file size;
- HTTPS-only external URLs and no embedded credentials;
- secret-shaped-value rejection in summaries/attachments metadata;
- attachment malware/content scanning as a host capability before file retention;
- no normal logs containing evidence metadata, credential IDs, email references, repository paths or MCP payloads;
- retention and deletion actions preserve audit while removing optional attachments through an explicit policy.

## 15. Error and degraded behavior

- missing repository link: evidence remains unlinked and reviewable;
- stale GitHub observation: candidate is marked stale/unknown and cannot satisfy deterministic auto-accept;
- ambiguous checkpoint: proposal requires owner target selection;
- duplicate candidate: return existing candidate without duplicate event;
- duplicate credential: merge proposal is shown; canonical record is not overwritten silently;
- Gmail/Spark unavailable: no canonical state changes; manual entry remains available;
- MCP write confirmation unavailable: generate a preview/manual fallback;
- attachment unavailable: retain normalized credential metadata without claiming file possession;
- external URL verification fails: keep credential unverified and record a bounded failure code;
- concurrent goal/checkpoint change: reject stale proposal acceptance and reload the latest state;
- auto-accept policy failure: revert to owner review rather than dropping the candidate.

## 16. Persistence plan

Implementation order reserves:

```text
0014_mcp_oauth.sql                    remote MCP plan
0015_learning_goals.sql               goals, checkpoints, skills and events
0016_learning_evidence_credentials.sql candidates, claims, policies, credentials and events
```

If repository execution order changes before either migration is implemented, the implementer must first reconcile migration numbering on the newest consolidated branch and update all plans in the same commit. No two plans may introduce the same migration number.

Planned tables:

```text
learning_goals
learning_goal_events
learning_checkpoints
learning_checkpoint_events
skills
skill_alias_events
learning_goal_skills
learning_checkpoint_skills
learning_evidence_candidates
learning_evidence_claims
learning_evidence_reviews
learning_evidence_policies
learning_credentials
learning_credential_events
```

Progress is derived; no `goal_progress_percent` column is canonical.

## 17. Testing strategy

### Domain

- lifecycle transitions and terminal-state guards;
- checkpoint sequence/weight/target validation;
- deterministic progress derivation;
- no direct percent mutation;
- skill alias/merge behavior;
- candidate/claim/review transitions;
- LLM-origin candidate never auto-accepts;
- exact deterministic-policy matching;
- duplicate/idempotency handling;
- credential validation, expiry and duplicate rules.

### Persistence

- migrations apply twice;
- foreign keys/check constraints/indexes;
- entity/event/audit atomicity;
- optimistic concurrency;
- backup/restore through new migrations;
- derived progress from stored checkpoints/evidence;
- absence of raw email/provider bodies and secrets.

### Web

- anonymous routes fail before private reads;
- owner CRUD/lifecycle/review flows;
- CSRF/idempotency/stale-version rejection;
- 360 px layout;
- no Growth markers in public HTML/payloads;
- accessible evidence and credential review.

### MCP

- exact read/proposal catalog;
- strict inputs/outputs and size limits;
- no direct completion/accept/verify tools;
- auth scope and confirmation behavior after write design;
- isolation and sanitization over remote transport.

### External acceptance

- generic MCP client first;
- Spark only when account custom apps are available;
- GitHub read-only evidence proposal;
- Gmail certificate proposal;
- revocation/disablement and manual fallback;
- provider unavailability recorded as external dependency.

## 18. Delivery decomposition

### Phase A — Learning core

Goals, checkpoints, skills, derived progress, private UI and read services. Fully useful without external providers.

### Phase B — Evidence and credentials

Candidate/review pipeline, GitHub references, credential metadata, source policies, owner review and optional private attachment references.

### Phase C — MCP reads

Six strict read-only tools after Phases A–B pass their gates.

### Phase D — Supervised proposals/writes

Separate write-authorization design and implementation after the authenticated remote MCP read endpoint and workflow read catalog are verified.

### Phase E — Spark recipes and evidence

Configure/test goal creation, weekly GitHub review, Gmail credential monitor and recurring briefings. Spark availability remains an external acceptance gate.

## 19. Acceptance criteria

The Growth system is complete when:

- canonical goals/checkpoints/skills survive backup/restore;
- progress is reproducibly derived and never set directly;
- evidence proposals cannot affect progress before accepted policy/review;
- deterministic auto-accept excludes LLM-only classification;
- GitHub evidence references exact normalized observations;
- credentials distinguish pending, verified, unverified, expired, revoked and rejected;
- email ingestion stores normalized metadata without Gmail credentials/raw mailbox content;
- private routes and DTOs leak nothing publicly;
- owner review is auditable and concurrency-safe;
- MCP reads expose only bounded projections;
- proposal/write tools are absent until a separate write design passes;
- Spark workflows are either observed working or explicitly marked blocked by external entitlement/capability;
- all code/documentation/test matrices match the exact verified head.
