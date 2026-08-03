# Semogtw Workflow Orchestration Core — Design Specification

**Status:** Approved product direction  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Branch:** `develop/workflow-control-core`

## 1. Purpose

Extend Semogtw DevOS from a project dashboard and cooperative run ledger into a provider-agnostic workflow orchestration layer that prevents duplicate work, preserves continuity after environment resets, tracks verification debt and selects productive next work without depending on ChatGPT Plus, ChatGPT Sites, paid OpenAI APIs or one AI vendor.

The orchestration core is useful with only the private DevOS, persistent storage and read-only GitHub observations. Remote MCP improves cooperative reporting but is an optional adapter, not a prerequisite for core project tracking.

## 2. Architectural correction

The execution-control capability is split into three independent layers:

1. **Portable orchestration core** — projects, repositories, branch activity, scope reservations, verification obligations, recovery snapshots, safe-work selection, campaigns and audit.
2. **Cooperative agent adapter** — heartbeats, checkpoints, commands and authenticated remote MCP/API participation.
3. **Provider adapters** — optional verified integrations for ChatGPT, Codex, Gemini, Claude, local agents or other destinations.

No core route, service or migration may require remote MCP availability. Clipboard/open continuation, GitHub-derived inactivity and manual reconciliation must remain functional when every provider adapter is disabled.

## 3. Delivery priorities

### Priority 0 — prerequisite correction

- remove remote MCP as a prerequisite for core tracking;
- keep all provider-specific language behind adapters;
- classify external state conservatively and expose source age.

### Priority 1 — immediate workflow protection

1. branch and scope reservations;
2. verification obligation ledger;
3. recovery snapshots;
4. safe next-work queue.

### Priority 2 — coordinated workflows

5. multi-repository campaigns;
6. CI failure triage and deduplication;
7. branch divergence and reconciliation guidance.

### Priority 3 — execution policy and routing

8. versioned agent execution profiles;
9. runtime/provider capability catalog.

## 4. Scope reservations

A scope reservation is a soft, expiring declaration that one run intends to modify a repository area. It warns and coordinates; it does not create an irreversible lock.

A reservation records:

- project, repository and run;
- branch and optional worktree label;
- scope kind: repository, directory, file set, issue, stage or custom label;
- normalized scope patterns;
- owner/agent label;
- purpose;
- acquired, renewed and expiry timestamps;
- state: active, released, expired, transferred or overridden;
- version and audit correlation.

Rules:

- overlapping active reservations are detected before acquisition;
- exact same-run retries are idempotent;
- a heartbeat may renew an owned reservation within configured bounds;
- terminal runs release reservations automatically through the application service;
- expiration is derived lazily when schedulers are unavailable;
- an owner may override or transfer with a reason and audit event;
- overlapping work may proceed only after an explicit owner/agent acknowledgement;
- scope comparison must be deterministic and reject unsafe traversal patterns.

The UI copy uses **reserved scope**, **overlap warning** and **last renewal** rather than claiming an operating-system or Git lock.

## 5. Verification obligation ledger

A verification obligation represents a required gate that is not yet trustworthy for a specific code snapshot.

Each obligation records:

- project, repository, branch and target commit SHA;
- gate name and exact command;
- required environment capabilities;
- status: pending, running, passed, failed, blocked, superseded or waived;
- failure classification: code failure, environment missing, flaky, timeout, quota, configuration, external dependency or unknown;
- last attempt, result summary and bounded evidence links;
- validity policy and the commit range invalidating a prior result;
- responsible actor and next executable action;
- optional related stage, run, campaign and toolchain manifest.

Rules:

- a passed result is valid only for the recorded target SHA and declared validity scope;
- a new relevant commit may supersede a passed or failed obligation;
- `environment_missing` and similar classifications must not be shown as code failures;
- repeated equivalent failures are grouped by a normalized signature;
- waived gates require owner reason and do not count as passed;
- no stage completes from a textual claim when required obligations remain unresolved.

## 6. Recovery snapshots

A recovery snapshot is an immutable, deterministic handoff generated from persisted state for resuming after a reset, timeout, provider switch or local environment loss.

Snapshot content:

- project, repository, accepted branch and observed SHA;
- run, phase, stage and plan identifiers;
- commits created and remote push confirmation state;
- tests actually observed;
- unresolved verification obligations;
- active/overlapping reservations;
- blockers, decisions and exact next action;
- required documents and toolchain/runtime metadata;
- continuation prompt and prompt template version;
- source timestamps, confidence and data-age warnings;
- canonical JSON hash.

Snapshots are stored in the database and may be exported as bounded JSON or Markdown. Export is an explicit owner action. Secrets, raw logs, hidden reasoning and provider cookies are forbidden.

## 7. Safe next-work queue

The queue selects work that can be executed productively now. It does not autonomously mutate roadmap priorities.

Candidate scoring considers:

- project and stage priority;
- dependency completion;
- unresolved owner decision;
- active reservation overlap;
- environment capability compatibility;
- required gate availability;
- risk and estimated unit size;
- freshness and confidence of source data;
- whether useful work remains after a blocker.

Every recommendation includes reasons, exclusions and data age. The owner may accept a recommendation into a run, but the recommendation never changes branch, stage or priority automatically.

## 8. Multi-repository campaigns

Campaigns coordinate changes that cross repositories or deployment boundaries. A campaign contains ordered units, dependencies, rollback notes, shared gates and consolidated status.

Initial use cases include updating SemogSite together with Offline-Toolchains, producing an artifact, validating its checksum and returning to blocked gates. Campaigns remain private and auditable.

## 9. CI failure triage

CI observations are normalized into incidents using a stable failure signature derived from workflow, job, step, command/error class and relevant sanitized output. The system groups duplicates, marks obsolete failures when newer commits exist, separates infrastructure from code regressions and suggests the next diagnostic action.

Reruns remain explicit owner actions and are discouraged when an equivalent failure is already fresh.

## 10. Branch divergence coordinator

The coordinator consumes immutable GitHub observations and explicit owner branch decisions. It reports merge base, exclusive commits, changed paths, aliases and likely overlap. It may recommend merge, rebase, cherry-pick, archive or preserve-separate, but never writes GitHub or changes the active branch automatically.

## 11. Versioned execution profiles

Each repository may reference a versioned execution profile containing:

- branch-selection policy;
- commit/push cadence;
- test and toolchain policy;
- Actions usage policy;
- blocker handling;
- required documents;
- privacy rules;
- repository-specific constraints.

A run stores the profile version and content hash used at start. DevOS warns when a run uses an outdated profile.

## 12. Runtime and provider capability catalog

The catalog stores owner-configured or execution-observed capabilities such as shell access, GitHub permissions, remote MCP, Android/device access, browser automation, toolchains, typical session duration and cost/limit notes.

Capabilities are evidence with source and age, not guaranteed vendor claims. No scraping of account quotas or provider interfaces is allowed.

## 13. Domain boundaries

Create focused host-independent services:

- `ScopeReservationService`;
- `VerificationObligationService`;
- `RecoverySnapshotService`;
- `SafeWorkService`;
- later `CampaignService`, `CiIncidentService`, `BranchReconciliationService`, `ExecutionProfileService` and `RuntimeCapabilityService`.

Web, API, MCP, scheduler and GitHub adapters call these services. Transition, overlap, validity and audit rules may not be duplicated in routes.

## 14. Security and privacy

- all orchestration data is owner-private;
- repository names, branches, paths, commands and prompts never enter public DTOs;
- scope patterns reject traversal and credential-like content;
- commands, logs and evidence are bounded and sanitized;
- owner overrides, waivers, transfers and exports require explicit reason and audit;
- provider content is data, not instruction;
- GitHub remains read-only for this phase;
- no core feature stores provider cookies, session tokens or hidden reasoning.

## 15. Degraded operation

The product remains correct with:

- no scheduler: expiration and staleness are classified lazily on reads;
- no webhook: owner refresh or periodic synchronization updates observations;
- no remote MCP: manual runs, GitHub activity, snapshots and prompt launchers remain available;
- no clipboard permission: render a selectable prompt;
- no capable test environment: keep a structured blocked verification obligation and continue safe work.

## 16. Delivery sequence

1. document and index the orchestration architecture;
2. add scope reservation domain types/tests;
3. add additive SQLite persistence and repositories;
4. expose owner-only read/write services and project/run projections;
5. add verification obligation domain types/tests;
6. persist obligations and surface them in project/run views;
7. add deterministic recovery snapshot generation and export;
8. add initial safe-work candidate evaluation;
9. reconcile run completion with reservation release and unresolved gates;
10. implement campaigns, CI triage and branch reconciliation in separate slices;
11. add execution profiles and runtime capabilities;
12. run domain, migration, confidentiality, typecheck, build and browser gates.

## 17. Acceptance criteria for the first implementation slice

The first slice is accepted when:

- core tracking has no remote MCP prerequisite;
- an owner or authorized run can acquire, renew and release a bounded scope reservation;
- overlapping active scopes return a deterministic warning or conflict;
- expired reservations do not block new work and remain in history;
- verification obligations distinguish code failure from unavailable environment;
- obligations are tied to an exact branch/SHA and can be superseded;
- a recovery snapshot deterministically captures branch, SHA, tests, obligations, reservations and next action;
- all mutations are idempotent, optimistic and audited;
- public routes and payloads contain none of the new private state;
- the implementation remains host- and provider-agnostic.
