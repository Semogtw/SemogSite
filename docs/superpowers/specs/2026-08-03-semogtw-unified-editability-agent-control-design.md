# Semogtw Unified Editability and Agent Control Plane — Design Specification

**Status:** Approved design baseline  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Base:** descendant of `develop/learning-growth-spark-planning` at `fc78cab07eac0b6728b2026526eba61dbd78372f`

## 1. Decision

Semogtw DevOS will adopt **editability parity** as a product invariant:

> Every meaningful state or behavior that the owner can manage in the private UI must have an equivalent, policy-controlled automation path for authorized AI clients; every AI-visible mutation must use the same canonical domain command and remain understandable and controllable in the UI.

“Everything is editable” means the intended canonical state can be changed through a reviewed workflow. It does **not** mean arbitrary table writes, secret disclosure, rewriting immutable history or bypassing derived-state rules.

The system separates three editability planes:

```text
Data and content
  UI + domain commands + MCP command adapters

Appearance and modeled configuration
  UI + configuration commands + MCP command adapters

Code and infrastructure
  UI + MCP control commands
       ↓
  isolated Development Control Plane
       ↓
  branch + executor + gates + review + deploy/rollback
```

All three planes use shared authorization, risk classification, approvals, idempotency, optimistic concurrency, audit and kill switches.

## 2. Approved product principles

1. The owner can easily inspect and edit all modeled private state in DevOS.
2. Authorized AI clients can act on the same modeled state through MCP.
3. UI and MCP never implement separate business rules for the same mutation.
4. Every command has an explicit capability, resource scope, risk level and confirmation policy.
5. The server determines risk; clients cannot downgrade it.
6. Common low-risk edits can execute directly when granted.
7. Medium-risk edits require client confirmation unless covered by a temporary trusted session.
8. High-risk edits use a preview/change-set flow and may require client or DevOS approval according to policy.
9. Critical edits always require final approval in DevOS with recent owner authentication.
10. An AI client cannot grant itself new permissions or weaken its own controls.
11. All MCP writes can be paused independently from reads and from the web application.
12. Code, migrations, deployment and infrastructure use an isolated development workflow rather than ordinary CRUD tools.
13. Provider/model identity is context for audit and policy, not a trusted security assertion by itself.
14. Spark, ChatGPT, Claude, local models and future clients are adapters; none is a domain dependency.

## 3. Alternatives considered

### A. Unrestricted administrator MCP

Expose generic database, filesystem, shell and configuration tools to any broadly authorized AI.

Rejected because it makes least privilege impractical, weakens audit semantics, enables self-escalation paths and turns malformed model output into unrestricted execution.

### B. Content-only MCP

Allow AI clients to edit ordinary projects, goals and documents while keeping configuration, security, code and infrastructure permanently UI-only.

Rejected because it does not satisfy the owner’s intent that the entire product remain operable through AI-assisted workflows.

### C. Unified commands with graduated risk and a separate development executor

Expose every meaningful operation through a canonical command catalog; authorize direct execution, confirmation, approval or denial based on risk and resource scope; route code/infrastructure changes through an isolated executor and software-delivery workflow.

Selected because it provides broad practical control without collapsing all operations into one dangerous privilege.

## 4. Meaning of editability

### 4.1 Directly editable values

Examples:

- project title, description, priority, status and relationships;
- roadmap stages and ordering;
- attention items, workflow configuration and owner-managed policies;
- learning goals, checkpoints, skills, evidence decisions and credentials;
- editorial drafts, metadata, review state and publication requests;
- navigation, dashboard layout, widgets, theme tokens and other modeled presentation settings;
- agent profiles, grants, temporary trust sessions and integration settings;
- development requests, execution policies and deployment approvals.

### 4.2 Indirectly editable derived values

Derived state is changed by editing its canonical inputs, not by overwriting the projection.

Examples:

- learning progress is derived from checkpoint weights and accepted values;
- safe-work recommendations are derived from projects, stages, reservations, gates and capabilities;
- expiration and staleness are derived at read time;
- published projections are derived from approved revisions;
- deployment health is derived from observed checks.

No UI or MCP command directly sets these derived values unless the domain specification explicitly defines a canonical override with audit semantics.

### 4.3 Immutable or replace-only state

Some state remains non-editable by overwriting:

- audit and domain-event history;
- accepted external observations such as an exact GitHub SHA;
- recovery snapshot content/hash;
- historical publication events;
- IDs, content hashes and created timestamps;
- secret values after initial creation.

Correction uses append-only supersede, revoke, compensate, annotate, re-import or rotate commands. Secrets can be replaced, rotated or revoked but are never returned to an AI after one-time issuance.

## 5. Unified command architecture

```text
DevOS UI ───────────────┐
Private API ────────────┤
MCP tool adapter ───────┤
Scheduled/internal job ─┘
                        ↓
                 Command Gateway
                        ↓
       authorization + risk + approval policy
                        ↓
               canonical domain command
                        ↓
        transaction + event + audit + projection
```

The UI and MCP adapters validate transport-level shape, then call the same command gateway and command handlers.

### 5.1 Command definition

A framework-free command catalog exposes definitions equivalent to:

```ts
export type CommandRisk =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type CommandDisposition =
  | "allow"
  | "confirm_in_client"
  | "prepare_approval"
  | "approve_in_devos"
  | "deny";

export type CommandDefinition<Input, Output> = {
  id: string;
  domain: string;
  capability: string;
  resourceKind: string;
  staticRiskFloor: CommandRisk;
  inputSchema: unknown;
  outputSchema: unknown;
  batchable: boolean;
  supportsCompensation: boolean;
  classifyRisk(input: Input, currentState: unknown): CommandRisk;
  resolveResource(input: Input): CommandResource;
  execute(context: CommandContext, input: Input): Promise<Output>;
};
```

The exact implementation type may evolve, but the following invariants do not:

- command IDs are stable and versioned when semantics break;
- every command has strict bounded input and output schemas;
- resource resolution happens before authorization;
- dynamic risk can only increase the static floor;
- authorization happens before private domain reads not needed to resolve identity/resource;
- command execution receives a normalized principal, idempotency key, expected versions, reason and correlation ID;
- output never contains raw secrets or unrestricted internal rows.

### 5.2 Example command IDs

```text
projects.create
projects.update
projects.archive
projects.restore
roadmap.stages.create
roadmap.stages.reorder
workflow.reservations.acquire
workflow.verification.record_result
growth.goals.create
growth.checkpoints.update
growth.evidence.accept
growth.credentials.verify
editorial.documents.update
editorial.revisions.submit_review
editorial.publication.publish
appearance.dashboard.update_layout
integrations.agents.update_grant
development.requests.create
development.deployments.approve
backup.restore
security.auth.rotate_owner_credentials
```

MCP tool names may use a `devos_` prefix, but every tool maps to exactly one registered command or one registered change-set operation.

## 6. Editability manifest and completeness gate

Every feature must publish an editability manifest:

```ts
export type EditabilityManifest = {
  featureId: string;
  reads: readonly string[];
  commands: readonly string[];
  uiRoutes: readonly string[];
  mcpExposure: "direct" | "change_set_only" | "control_plane";
  riskSummary: Readonly<Record<string, CommandRisk>>;
  undoStrategy: "compensating_command" | "new_revision" | "not_reversible";
  conflictStrategy: "expected_version" | "exact_sha" | "immutable";
  auditEvents: readonly string[];
};
```

A feature is not complete when:

- the UI can mutate it but no AI automation strategy exists;
- an MCP command exists but the owner cannot inspect or perform the equivalent operation in DevOS;
- the risk or approval behavior is undocumented;
- a mutation bypasses the command gateway;
- a command has no concurrency, idempotency or audit behavior;
- a critical action lacks a DevOS approval path.

Static and runtime tests will compare registered commands, UI manifests and MCP exposure declarations.

## 7. Risk model

### 7.1 Read

Private reads require authentication and capability/resource authorization but no confirmation.

### 7.2 Low risk

Default disposition: `allow` for an authorized client.

Examples:

- edit a project description;
- add a draft note;
- update a non-sensitive label;
- rearrange a personal dashboard widget;
- create an informational evidence proposal.

Controls still include validation, version checks, idempotency, rate limits and audit.

### 7.3 Medium risk

Default disposition: `confirm_in_client`.

Examples:

- create or materially restructure a learning checkpoint;
- archive a normal project;
- reorder several roadmap stages;
- accept ordinary evidence under a permissive owner policy;
- create a development branch/session.

A scoped temporary trust session may pre-authorize exact medium-risk commands.

### 7.4 High risk

Default disposition: `prepare_approval`.

Examples:

- apply a multi-entity change set;
- publish ordinary reviewed editorial content;
- verify a credential manually;
- waive an important checkpoint or verification gate;
- merge a development branch;
- change an agent’s resource scope without privilege elevation.

Policy may allow final confirmation in the AI client or require DevOS approval. The server selects the disposition from owner policy, command risk and current state.

### 7.5 Critical risk

Disposition: `approve_in_devos` with recent owner authentication.

Examples:

- change authentication or authorization policy;
- broaden an AI client’s capabilities materially;
- create/reveal/rotate/revoke sensitive credentials;
- restore a backup;
- permanently delete private canonical data;
- alter security controls, trusted proxy/origin policy or remote-write kill switches;
- approve a production deployment involving migrations or auth changes;
- execute destructive rollback;
- grant an executor access to new repositories, paths, secrets or infrastructure;
- change the rules that classify or approve critical actions.

Client confirmation alone never satisfies a critical action.

### 7.6 Denied operations

The gateway denies:

- client self-escalation;
- authorization-policy changes requested with the same grant being modified;
- direct secret retrieval after issuance;
- generic raw SQL, arbitrary database row mutation or unrestricted shell from ordinary clients;
- rewriting immutable history;
- bypassing required tests/approvals by selecting a lower-level command;
- executing a stale approved payload against changed target state.

## 8. Principals, profiles and resource scopes

### 8.1 Principals

Normalized principals include:

```ts
export type CommandPrincipal = {
  ownerId: string;
  kind: "owner_browser" | "mcp_client" | "internal_job" | "development_executor";
  sessionId: string | null;
  clientId: string | null;
  declaredProvider: string | null;
  declaredModel: string | null;
  grantIds: readonly string[];
};
```

Provider/model values are bounded audit metadata. Authorization is based on authenticated client/grant identity, not a model name supplied in the request.

### 8.2 Reusable profiles

Initial profiles:

```text
Read only
Personal assistant
Project agent
Editorial agent
Growth and learning agent
Development agent
Supervised administrator
Custom
```

Profiles are templates. Effective permission is the intersection of:

- OAuth scope;
- client status;
- assigned capabilities;
- resource filters;
- command policy;
- temporary trust grants;
- global and per-client kill switches;
- current system state.

### 8.3 Resource scoping

Examples:

```text
projects.update
  allowed projects: SemogSite, GoAnime

editorial.documents.update
  allowed kinds: note, project
  allowed lifecycle: draft only

growth.*
  allowed goals: all

workflows.*
  allowed repositories: Semogtw/SemogSite
  allowed branches: develop/*
```

Resource selectors are canonical IDs/patterns validated by the server. Client-supplied display names never expand authorization.

### 8.4 No self-escalation

A principal cannot:

- grant capabilities to its own client;
- create a broader profile than its own effective grant;
- extend its own expiry or resource filters;
- disable logging, approvals, rate limits or kill switches governing itself;
- create another client as an indirect privilege escalation.

Such changes require an independently authenticated owner action in DevOS.

## 9. Temporary trust sessions

The owner may create a bounded temporary grant, for example:

> Permit this agent to edit the SemogSite roadmap for two hours without per-command confirmation.

A temporary trust session records:

- client and owner identity;
- exact capabilities and resource selectors;
- risk ceiling, never `critical`;
- start/expiry timestamps;
- maximum operation count and optional change-volume limits;
- reason and approval evidence;
- revocation timestamp;
- correlation and audit IDs.

Rules:

- default expiry is short and bounded;
- no “remember forever” default;
- all operations remain audited;
- critical commands are excluded;
- a global or client write pause overrides the trust session;
- material target-state changes may force reconfirmation;
- the session cannot create or extend another trust session.

## 10. Confirmation and approval protocol

### 10.1 Client confirmation

For `confirm_in_client`, the MCP server returns a structured preview and confirmation challenge bound to:

- client;
- command ID/version;
- canonical input hash;
- resolved resources and expected versions;
- calculated risk;
- expiration;
- one-time nonce.

The client repeats the command with the challenge response. Replaying or modifying the payload fails.

### 10.2 DevOS approval request

High or critical commands may create an immutable approval request:

```ts
export type ApprovalRequest = {
  id: string;
  commandId: string;
  commandVersion: number;
  principalId: string;
  clientId: string | null;
  risk: "high" | "critical";
  payloadHash: string;
  resourceSnapshot: readonly ApprovalResourceSnapshot[];
  summary: string;
  beforePreview: unknown;
  afterPreview: unknown;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "stale" | "executed" | "failed";
  expiresAt: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};
```

The MCP response includes:

```json
{
  "status": "approval_required",
  "approvalId": "apr_...",
  "reviewPath": "/devos/approvals/apr_..."
}
```

The approval stores no bearer token or secret value.

### 10.3 Staleness

Approval is invalidated when:

- any expected entity version changes;
- an exact branch/SHA/resource binding changes;
- the command definition/version changes;
- the client/grant is revoked or narrowed;
- the approval expires;
- a policy change increases required risk.

Stale approvals must be recalculated; they never execute silently against new state.

### 10.4 Recent authentication

Critical approval requires a recent owner authentication ceremony independent of the original page session age. The implementation plan must define the exact maximum age and reauthentication mechanism before code is written.

## 11. Change sets

For related edits, an AI or the owner may prepare a change set:

```text
devos_prepare_change_set
devos_validate_change_set
devos_apply_change_set
devos_get_change_set
devos_cancel_change_set
```

A change set contains only registered command IDs with schema-valid inputs. It is not a generic patch or SQL payload.

States:

```text
draft
validating
invalid
ready
confirmation_required
approval_required
approved
applying
applied
stale
rejected
failed
compensating
compensated
```

Rules:

- risk is at least the maximum risk of contained commands and may be escalated for aggregate impact;
- all commands are authorized against their resolved resources;
- database-local changes execute atomically when the same transaction boundary can cover them;
- cross-system changes are explicitly non-atomic and use a saga/compensation record;
- partial external success is never reported as fully applied;
- previews show before/after values and derived effects;
- expected versions and payload hash bind the approval;
- applying the same idempotency key returns the original result.

Example:

```text
- checkpoint APIs weight: 25 → 15
- checkpoint Tests weight: 15 → 25
- add checkpoint CLI
- add checkpoint File automation
```

The owner confirms one coherent change set rather than four unrelated prompts.

## 12. Undo and correction

Undo is command-specific:

- normal mutable entities use a compensating command with current expected version;
- editorial content creates a new revision or rollback publication event;
- archived entities may use restore;
- external observations are superseded/annotated, not rewritten;
- secrets are rotated/revoked, not restored from logs;
- deployments use an explicit rollback request tied to a known artifact/state;
- immutable audit/event rows are never deleted by an undo.

The UI shows whether an action is reversible before confirmation. MCP command metadata exposes the same property.

## 13. Owner UI

### 13.1 Entity editing

Private pages provide:

- inline editing for simple low-risk fields;
- full forms for structural changes;
- before/after preview for high-impact edits;
- derived-field explanation instead of direct editing;
- version-conflict reload and comparison;
- history and available compensation actions;
- “Copy MCP reference” for canonical entity IDs;
- “AI actions available” generated from the command catalog;
- recent AI changes and client identity.

### 13.2 Agent control center

Route family:

```text
/devos/integrations/agents
/devos/integrations/agents/$clientId
/devos/approvals
/devos/approvals/$approvalId
/devos/change-sets
/devos/change-sets/$changeSetId
/devos/security/remote-access
```

It shows:

- connected clients and status;
- OAuth scopes, command capabilities and resource filters;
- current temporary trust sessions;
- pending approvals and stale requests;
- recent commands and failures;
- token/grant revocation controls;
- per-client write pause;
- global MCP-write kill switch;
- command/risk explanations;
- last activity without exposing request bodies or secrets.

### 13.3 Appearance and modeled configuration

Theme, navigation, dashboards, widgets and supported layout settings are stored as validated modeled configuration.

Rules:

- no arbitrary HTML/JavaScript/CSS injection;
- schemas define permitted tokens, components and bounds;
- UI and MCP share configuration commands;
- invalid layouts fail closed and retain the last valid configuration;
- owner can reset a subsection to a known default;
- public-facing configuration changes receive higher risk where they alter published output.

## 14. MCP ergonomics

### 14.1 Specific commands, not unrestricted mutation

Common operations appear as explicit tools:

```text
devos_update_project
devos_reorder_roadmap_stages
devos_create_learning_goal
devos_update_learning_checkpoint
devos_accept_learning_evidence
devos_update_editorial_document
devos_publish_editorial_revision
devos_update_dashboard_layout
```

The exact catalog may be generated from registered command definitions, but tool input remains specific and strict.

Forbidden generic tools:

```text
devos_update_anything
devos_execute_sql
devos_run_shell
devos_edit_arbitrary_file
```

### 14.2 Discovery tools

To keep a large command surface usable:

```text
devos_list_capabilities
devos_list_commands
devos_get_command_schema
devos_explain_authorization
devos_get_entity_actions
devos_prepare_change_set
```

Discovery output is filtered to the caller’s effective capabilities/resources. It must not reveal hidden entity existence or security configuration.

### 14.3 Standard command result

```ts
export type CommandResult<T> =
  | { status: "executed"; data: T; auditId: string }
  | { status: "confirmation_required"; challenge: ConfirmationChallenge }
  | { status: "approval_required"; approvalId: string; reviewPath: string }
  | { status: "conflict"; code: string; currentVersion?: number }
  | { status: "denied"; code: string }
  | { status: "failed"; code: string };
```

Stable codes do not expose SQL, filesystem paths, tokens, private payloads or raw exceptions.

## 15. Audit and observability

Every command attempt records bounded metadata:

- owner identity;
- authenticated principal kind;
- client ID;
- declared provider/model when supplied;
- command ID/version;
- resolved resource IDs;
- calculated risk and disposition;
- grant/trust-session/approval IDs used;
- reason, confirmation type and idempotency key;
- expected versions/exact SHA bindings;
- sanitized before/after hashes or allowlisted summaries;
- result code, duration and correlation ID;
- compensation/rollback linkage when applicable.

Never log:

- bearer tokens, refresh tokens, client secrets or authorization codes;
- raw MCP payloads;
- secret values before or after rotation;
- complete evidence/credential/email bodies;
- private document bodies by default;
- arbitrary code diffs in normal application logs;
- raw exception strings containing sensitive state.

Detailed private diffs may be stored in dedicated encrypted/authorized records with retention policy, not normal logs.

## 16. Kill switches and containment

Required controls:

- global MCP write disablement while preserving reads;
- per-client write pause;
- per-domain command-family disablement;
- development executor pause;
- production deploy pause;
- immediate client/token/grant revocation;
- approval expiration and invalidation;
- rate/concurrency/volume limits;
- maximum change-set size;
- maximum temporary trust duration/operations;
- emergency rollback runbook.

A client cannot alter a kill switch that governs its own access.

## 17. Development Control Plane

Code and infrastructure edits use a separate control plane.

```text
Owner / AI client
       ↓
Development Change Request
       ↓
policy + approval + repository/scope resolution
       ↓
isolated development executor
       ↓
branch + commits + checkpoints + verification evidence
       ↓
review / merge approval
       ↓
preview / production deployment approval
       ↓
health evidence / rollback
```

### 17.1 Development request

```ts
export type DevelopmentRequestStatus =
  | "draft"
  | "planned"
  | "approved_for_development"
  | "in_progress"
  | "verification_blocked"
  | "ready_for_review"
  | "approved_for_merge"
  | "merged"
  | "deploy_pending"
  | "deployed"
  | "rolled_back"
  | "failed"
  | "cancelled";
```

A request records:

- repository and accepted base branch/SHA;
- requested outcome and non-goals;
- intended file/scope reservation;
- agent/client/executor identity;
- work branch;
- implementation checkpoints;
- commits and current head;
- required verification obligations;
- blocked gates and classifications;
- PR, artifact and deployment linkage;
- approvals and rollback target.

### 17.2 High-level MCP control tools

```text
devos_create_development_request
devos_update_development_plan
devos_start_development_session
devos_get_development_status
devos_submit_change_for_review
devos_approve_merge
devos_prepare_deployment
devos_approve_deployment
devos_request_rollback
```

Ordinary MCP clients do not receive raw shell, unrestricted Git credentials or arbitrary filesystem access.

### 17.3 Isolated executor

A separately authenticated executor may receive an internally signed job with:

- exact repository and base SHA;
- allowed branch prefix;
- path/scope constraints;
- tool/dependency policy;
- secret references, never plaintext returned to the model;
- network policy;
- time/resource limits;
- required checkpoint/report cadence;
- revocation/kill-switch state.

Executor credentials are independent from the human browser session and from ordinary MCP clients.

### 17.4 Branch and concurrency rules

- create a dedicated branch unless continuing an explicitly selected development branch;
- record base SHA and current work SHA;
- acquire cooperative scope reservations;
- detect overlapping paths/migrations;
- require rebase/merge/review when the base diverges materially;
- commits and pushes are frequent and attributable;
- migrations require exclusive numbering reconciliation and high/critical review;
- no hidden direct push to protected production branches.

### 17.5 Verification

Every gate records:

```text
command
exact 40-character commit SHA
environment/toolchain
start/end/duration
status
failure classification
bounded summary
artifact/log reference
```

An AI statement is not verification evidence. Environment, quota and dependency failures remain distinct from code failure.

### 17.6 Merge and deployment

Default policies:

- technical proposal: low;
- branch/session start: medium;
- dependency change: medium/high according to allowlist and impact;
- migration/auth/authorization change: critical review path;
- preview deployment: medium/high;
- merge: high;
- production deployment: critical when policy, migration, security or destructive impact applies;
- destructive rollback/restore: critical.

Deployment records include exact commit/artifact, environment, non-secret configuration fingerprint, migrations, health checks, approval, prior version and rollback procedure.

## 18. Data, configuration and development boundaries

### Domain data/content

Uses canonical domain commands and database transactions.

### Modeled configuration

Uses strict configuration schemas and commands. It cannot introduce executable code.

### Code/infrastructure

Uses development requests and executor jobs. It cannot be disguised as a configuration or generic content command to avoid review.

The command registry defines the plane for each command and rejects cross-plane privilege shortcuts.

## 19. Compatibility with existing specifications

This specification changes the long-term MCP write posture without claiming writes are implemented now.

It preserves:

- remote OAuth/Streamable HTTP read gates;
- provider-neutral domain boundaries;
- exact-SHA workflow verification;
- private/public isolation;
- no browser cookie reuse as MCP bearer authorization;
- no direct arbitrary database/GitHub/shell access;
- deterministic progress and evidence semantics.

It supersedes permanent prohibitions in earlier planning that said certain canonical actions must always remain UI-only. Actions such as evidence acceptance, credential verification, checkpoint waiver, publication, agent administration, merge and deployment may receive MCP command paths under this specification, but only with their assigned risk, capability, confirmation and approval rules.

It does **not** authorize implementing write tools before:

- authenticated remote reads and revocation/rollback pass;
- the command/policy/approval core is implemented and tested;
- each domain command reuses its canonical audited service;
- owner approval exists for the concrete write rollout.

## 20. Security invariants

- deny by default;
- authorize resource before mutation;
- server-calculated risk cannot be lowered by the caller;
- critical actions require recent DevOS owner authentication;
- no self-escalation;
- no secret readback;
- no raw SQL/shell/filesystem tools for ordinary clients;
- all writes have idempotency and conflict semantics;
- entity/event/audit writes are transactionally coupled where one database can cover them;
- cross-system partial failure is explicit;
- approvals are bound to payload hash and target versions/SHA;
- provider text and code content are untrusted data;
- all public output remains allowlisted and independent from private operational state;
- kill switches override grants and sessions;
- disabling logging/audit is not available through the governed channel;
- policy changes cannot retroactively validate an already stale approval.

## 21. Error and degraded behavior

- missing capability: return `denied` without revealing hidden resource details;
- confirmation unsupported by client: return preview/manual DevOS fallback;
- critical action requested from MCP: create approval or deny; never silently downgrade;
- stale expected version/SHA: conflict and require reload/replan;
- duplicate idempotency key with same payload: return original result;
- duplicate key with changed payload: idempotency conflict;
- database-local change-set failure: roll back all contained commands;
- external saga partial failure: record exact completed/failed steps and compensation state;
- executor offline: request remains queued/blocked with `external_dependency` or environment classification;
- provider/Spark unavailable: UI/manual workflows remain complete;
- kill switch active: writes fail closed while allowed reads remain available;
- approval UI unavailable: critical command remains pending; no alternate bypass;
- invalid modeled layout/configuration: preserve last valid state;
- secret rotation failure: retain prior credential until explicit atomic switch succeeds where supported.

## 22. Testing strategy

### Command catalog

- unique stable command IDs;
- strict schemas and bounded values;
- dynamic risk never below static floor;
- every command has capability/resource/editability manifest;
- no mutation route bypasses the gateway;
- no MCP write tool lacks a canonical command.

### Authorization and policy

- profile and resource intersection;
- deny-by-default behavior;
- self-escalation rejection;
- temporary trust expiry/count/revocation;
- kill-switch precedence;
- risk/disposition matrix;
- client confirmation challenge binding/replay rejection;
- critical recent-auth requirement.

### Approvals and change sets

- payload hash/version/SHA binding;
- stale/expired/revoked behavior;
- before/after preview;
- atomic database application;
- explicit external saga partial failure;
- idempotency and compensation linkage.

### Domain parity

For each feature:

- owner UI performs the canonical command;
- MCP performs the same command with equivalent result;
- derived/immutable values cannot be overwritten;
- optimistic conflicts behave the same;
- audit/events match principal and channel;
- public confidentiality remains intact.

### MCP

- discovery filtered by effective grant;
- exact tool schemas;
- read/write scope separation;
- confirmation/approval standard results;
- revocation, expiry and wrong-resource rejection;
- no sensitive logs/results;
- generic client before provider-specific acceptance.

### Development control plane

- signed constrained jobs;
- repository/path/branch enforcement;
- reservation overlap;
- exact-SHA gate evidence;
- dependency/network/tool policy;
- merge and deploy approval;
- migration/auth critical escalation;
- executor/client kill switches;
- rollback rehearsal and partial failure.

### Browser/E2E

- anonymous access fails before private reads;
- agent management and approval routes are owner-only;
- recent-auth challenge for critical approval;
- 360 px usability;
- accessible previews/diffs/statuses;
- no private command/approval markers in public HTML/client payloads;
- direct UI edits and AI-origin edits are both visible in history.

## 23. Delivery decomposition

This specification is intentionally split into independent implementation plans after owner review.

### Phase A — Command catalog and UI parity foundation

- framework-free command definitions;
- editability manifests;
- browser command gateway;
- migration guardrails from direct mutations;
- UI entity action discovery;
- audit normalization.

### Phase B — Agent authorization and write policy

- client profiles/capabilities/resource grants;
- temporary trust sessions;
- write kill switches;
- MCP write scopes and filtered discovery;
- confirmation challenges.

### Phase C — Approvals and change sets

- immutable approvals;
- recent-auth critical approval;
- change-set validation/application;
- compensation/saga records;
- DevOS approval/change-set UI.

### Phase D — Domain write rollout

Domain-by-domain command exposure:

- projects/roadmap/attention;
- workflow orchestration;
- Growth/evidence/credentials;
- editorial/publication;
- appearance/configuration;
- integrations/agent administration.

Each rollout requires its own inventory and risk review.

### Phase E — Development Control Plane

- development request aggregate;
- isolated executor contract;
- repository/branch/scope enforcement;
- verification/PR/merge lifecycle;
- preview/production deployment and rollback.

### Phase F — Completeness enforcement

- repository-wide editability coverage report;
- CI guardrails for UI/MCP parity;
- documentation generation from command definitions;
- owner dashboard showing remaining unautomated surfaces.

## 24. Acceptance criteria

The unified editability direction is complete only when:

- every private feature is represented in the editability coverage report;
- all modeled editable state has an owner UI path and authorized AI path;
- immutable/derived/secret fields clearly expose their correction/rotation workflow;
- all mutation channels call the same registered command handlers;
- capabilities and resource filters are enforceable and owner-visible;
- low/medium/high/critical behavior matches policy tests;
- critical commands cannot execute without DevOS recent-auth approval;
- client self-escalation and control bypass tests pass;
- global/per-client/domain write pauses work without disabling reads;
- approvals and change sets are hash/version/SHA bound;
- audit identifies actor, client, command, resource, confirmation and result without sensitive payload leakage;
- code/infrastructure changes use an isolated executor with branch, tests, review, deploy and rollback evidence;
- manual UI workflows remain complete when every external AI/provider is unavailable;
- public confidentiality and portability remain unchanged.
