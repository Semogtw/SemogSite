# Semogtw ChatGPT Execution Control Plane Implementation Plan

> **For agentic workers:** implement this plan only after the Semogtw platform foundation has established private authentication, database repositories, the private API partition, audit conventions, and a verified remote MCP deployment surface. Use checkbox (`- [ ]`) syntax for tracking and commit/push after every independently testable task.

**Goal:** Add a cooperative execution-control layer to Semogtw DevOS so ChatGPT development conversations can register work, publish checkpoints, expose completion/blockage state, receive queued user instructions, attach evidence, and notify the owner without requiring paid OpenAI API usage.

**Core limitation:** this subsystem does **not** provide administrative access to the user's normal ChatGPT conversations. It cannot list arbitrary chats, read their messages, inspect hidden reasoning, observe token streaming, press Stop/Continue, or inject an immediate message into an existing conversation. State exists only when a participating chat or agent explicitly calls the approved MCP tools.

**Architecture:** Participating ChatGPT conversations call a remote Semogtw MCP surface. MCP handlers delegate to host-independent application services, which persist runs, events, commands, evidence, and audit records. The private DevOS UI subscribes to persisted updates through a host-compatible realtime adapter, with polling as the required fallback. Sites remains a candidate UI/application host; the MCP endpoint may be deployed separately if Sites cannot expose a stable remote MCP transport.

**No paid OpenAI API dependency:** the control plane must work through ChatGPT's connected MCP/app capability and the Semogtw backend. Do not implement an embedded assistant, Responses API orchestration, Chat Completions proxy, or token-stream mirror as part of this plan.

---

## Dependency and sequencing

This is a post-foundation plan. Agents must not implement it before these capabilities exist or have accepted replacements:

1. domain and contract package boundaries;
2. database migrations and repository ports;
3. revocable owner authentication;
4. protected `/devos` shell;
5. private Hono/API partition;
6. audit-event conventions and confidentiality preflight;
7. remote MCP compatibility gate;
8. one authenticated realtime delivery mechanism or polling fallback.

Recommended sequence relative to the foundation roadmap:

```text
Foundation plan
  -> operational writes, evidence, audit and backup
  -> MCP resources/read tools/safe writes
  -> ChatGPT Execution Control Plane (this plan)
  -> scheduled reconciliation, webhooks and insights
```

When the MCP plan and this plan are executed together, finish read-only project/context tools first, then add execution-write tools in the order defined here.

---

## Product boundary

### Supported

- register a run when a participating chat begins work;
- associate a run with a project, repository, branch, goal, agent/model label, and optional ChatGPT conversation URL supplied by the owner or agent;
- show current stage, structured progress, last checkpoint, latest commit/test evidence, and data age;
- record a chronological event stream;
- mark runs as waiting for the owner, blocked, validating, completed, partially completed, failed, stale, or cancelled;
- queue an instruction in DevOS for the chat to retrieve at its next command poll;
- acknowledge that a queued instruction was received and optionally applied;
- notify the owner when a run completes, fails, becomes stale, or requests input;
- resume or supersede an interrupted run while preserving history;
- expose run state through private APIs and owner-authenticated UI;
- maintain audit records for every write.

### Explicitly unsupported

- automatic discovery of all ChatGPT chats in the account;
- reading arbitrary conversation messages from ChatGPT;
- exact model-thinking status;
- chain-of-thought collection;
- real-time token or response streaming from normal ChatGPT conversations;
- instant push of a user message into a normal ChatGPT conversation;
- claiming that a silent chat is still working;
- estimating percentage from intuition alone;
- storing OpenAI session cookies or automating the ChatGPT web interface;
- browser scraping, unofficial reverse-engineered ChatGPT endpoints, or account automation.

UI copy and documentation must preserve this distinction. Use terms such as **reported checkpoint**, **last agent update**, and **possibly inactive**, not **live model telemetry** or **currently thinking**.

---

## Canonical status model

```ts
export type AgentRunStatus =
  | "preparing"
  | "running"
  | "waiting_user"
  | "blocked"
  | "validating"
  | "completed"
  | "completed_partial"
  | "failed"
  | "stale"
  | "cancelled";

export type RunProgress = {
  completedSteps: number;
  totalSteps: number | null;
  currentStep: string | null;
  progressLabel: string | null;
};
```

Rules:

- prefer `completedSteps / totalSteps` over a free-form percentage;
- percentage may be derived only when `totalSteps` is known and greater than zero;
- `completed` requires at least one valid evidence item and a final summary;
- `completed_partial` requires a final summary, remaining-work description, and resume hint;
- `waiting_user` requires an explicit question or requested action;
- `blocked` requires a blocker and unlock action;
- `failed` requires a sanitized failure reason and preservation/resume status;
- `stale` is assigned by the backend from last activity, never claimed by the agent itself as proof of termination;
- `cancelled` is an owner/admin transition and does not delete history.

Default stale classification:

```text
0–15 minutes since last activity: active as last reported
15–40 minutes: possibly inactive
more than 40 minutes: stale
```

The thresholds must be owner-configurable. The UI must display the absolute last-update timestamp and data age.

---

## Data model

Create new migrations rather than changing historical foundation migrations.

### `agent_runs`

```text
id
project_id nullable
repository_id nullable
parent_run_id nullable
superseded_by_run_id nullable
external_conversation_url nullable
agent_label
model_label nullable
goal
status
current_step nullable
completed_steps
planned_steps nullable
progress_label nullable
branch_name nullable
base_commit_sha nullable
latest_commit_sha nullable
started_at
last_activity_at
completed_at nullable
stale_at nullable
cancelled_at nullable
final_summary nullable
remaining_work nullable
resume_hint nullable
created_by
updated_at
version
```

Constraints:

- URLs are optional and owner-private;
- repository and branch fields are private;
- `completed_steps >= 0`;
- `planned_steps` is null or greater than zero;
- `completed_steps <= planned_steps` when planned steps exist;
- optimistic concurrency uses `version`;
- final states do not accept ordinary progress writes unless explicitly reopened or superseded.

### `agent_run_events`

```text
id
run_id
event_type
severity
summary
details_json nullable
idempotency_key
occurred_at
recorded_at
actor_type
actor_id nullable
```

Approved event types initially:

```text
run_started
checkpoint
step_started
step_completed
commit_recorded
test_recorded
evidence_attached
input_requested
status_changed
command_received
command_acknowledged
command_applied
run_completed
run_failed
run_marked_stale
run_resumed
run_superseded
run_cancelled
```

### `agent_run_commands`

```text
id
run_id
body
priority
status
created_at
available_after nullable
expires_at nullable
received_at nullable
acknowledged_at nullable
applied_at nullable
rejected_at nullable
rejection_reason nullable
created_by_owner_id
```

Command status:

```text
pending
received
acknowledged
applied
rejected
expired
cancelled
```

A command queue is cooperative pull, not instant ChatGPT messaging.

### `agent_run_evidence`

Use the canonical evidence table when possible. Add a relation table only when the existing evidence model cannot link one evidence item to multiple runs/stages. Supported evidence categories include commit, pull request, test result, build, deployment, document, screenshot, and external URL.

### Audit

Every MCP write, API write, owner command, status transition, stale transition, and notification attempt must create a sanitized audit event with correlation ID and actor type.

---

## Application services

Create host-independent services in the domain/application layer. MCP, API, UI, scheduler, and Sites adapters may not duplicate transition rules.

```ts
export interface AgentRunService {
  start(input: StartAgentRunInput, context: ActorContext): Promise<AgentRunSnapshot>;
  checkpoint(input: RecordCheckpointInput, context: ActorContext): Promise<AgentRunSnapshot>;
  transition(input: TransitionAgentRunInput, context: ActorContext): Promise<AgentRunSnapshot>;
  complete(input: CompleteAgentRunInput, context: ActorContext): Promise<AgentRunSnapshot>;
  fail(input: FailAgentRunInput, context: ActorContext): Promise<AgentRunSnapshot>;
  listForOwner(query: AgentRunQuery): Promise<AgentRunPage>;
  getForOwner(id: string): Promise<AgentRunDetail | null>;
  classifyStale(now: string): Promise<readonly AgentRunSnapshot[]>;
}

export interface RunCommandService {
  create(input: CreateRunCommandInput, owner: AuthenticatedOwner): Promise<RunCommand>;
  poll(input: PollRunCommandsInput, context: ActorContext): Promise<readonly RunCommand[]>;
  acknowledge(input: AcknowledgeRunCommandInput, context: ActorContext): Promise<RunCommand>;
  markApplied(input: ApplyRunCommandInput, context: ActorContext): Promise<RunCommand>;
}
```

All mutation methods require:

- actor authentication;
- run-level authorization;
- idempotency key;
- correlation ID;
- expected record version for conflicting updates where applicable;
- sanitized audit entry;
- validation through Zod at the transport boundary and domain invariants internally.

---

## MCP tools

Tool names may use a `semogtw_` prefix if required to avoid collisions. Descriptions must say that tools report cooperative run state, not ChatGPT account state.

### `start_run`

Purpose: create or resume a run before meaningful work begins.

Required input:

```ts
{
  goal: string;
  projectSlug?: string;
  repositoryFullName?: string;
  branchName?: string;
  agentLabel: string;
  modelLabel?: string;
  plannedSteps?: number;
  externalConversationUrl?: string;
  idempotencyKey: string;
}
```

Returns the run ID, current status, next required reporting action, and safe instructions.

### `update_run`

Purpose: update status, current step, structured progress, branch/commit metadata, or a concise checkpoint.

Do not accept arbitrary database patches. Use an allowlisted command schema.

### `append_run_event`

Purpose: append a concise timeline event without changing the run status.

Reject source-code dumps, secrets, raw logs above configured size, or hidden reasoning.

### `heartbeat_run`

Purpose: record that the participating agent is active without inventing progress.

A heartbeat changes `last_activity_at` only and may include a short public-safe activity label. It cannot transition a final run.

### `request_user_input`

Purpose: transition to `waiting_user` with one precise question, impact, and allowed response options when applicable.

### `attach_run_evidence`

Purpose: link an existing evidence record or create a validated lightweight evidence record. Binary uploads remain a separate authorized upload flow.

### `poll_run_commands`

Purpose: retrieve pending owner commands for one authorized run.

Default maximum is five commands. Polling must atomically mark returned commands as `received` or use a lease to prevent duplicate concurrent delivery.

### `acknowledge_run_command`

Purpose: mark a received command as understood, applied, or rejected with a concise reason.

The agent must not acknowledge `applied` before actually incorporating the instruction.

### `complete_run`

Required:

```ts
{
  runId: string;
  finalSummary: string;
  completedSteps: number;
  evidenceIds: string[];
  latestCommitSha?: string;
  nextSuggestedAction?: string;
  idempotencyKey: string;
}
```

Completion fails if evidence is absent or invalid.

### `complete_run_partially`

Requires final summary, remaining work, resume hint, and preserved evidence.

### `fail_run`

Requires sanitized failure reason, whether work was preserved, latest safe checkpoint, and resume hint.

### Read tools

Provide owner-authenticated tools for:

```text
list_agent_runs
get_agent_run
get_run_timeline
list_pending_run_commands
```

Do not expose private run data through anonymous/public MCP resources.

---

## Agent participation protocol

Create `docs/AGENT_RUN_PROTOCOL.md` during implementation. It must contain a concise prompt fragment for development agents:

```text
Before substantial work, create or resume a Semogtw run.
After each meaningful gate, record a checkpoint with concrete evidence.
Use step counts when a plan exists; never invent progress percentages.
Poll pending commands before beginning a new major step and before finalizing.
When blocked on the owner, request one precise input and mark the run waiting_user.
Before ending, mark completed, completed_partial, or failed and attach evidence.
Do not send source-code dumps, secrets, hidden reasoning, or raw credentials to run events.
```

The protocol must also define a fallback when MCP is unavailable:

1. continue safe repository work;
2. preserve progress through frequent commits and pushes;
3. add the run/checkpoint information to the repository handoff document;
4. reconcile the missed events when MCP becomes available;
5. never treat telemetry failure as permission to stop productive work.

---

## Private DevOS UI

Add a private route group:

```text
/devos/runs
/devos/runs/:runId
/devos/runs/:runId/commands
```

### Runs overview

The overview must show:

- status and textual status label;
- project and repository, when authorized;
- goal;
- current step;
- structured step progress;
- last reported activity and data age;
- latest evidence indicators;
- whether owner input is required;
- stale classification;
- link to the associated ChatGPT conversation only when explicitly stored.

Default groups:

```text
Needs your attention
Reported active
Validating
Recently completed
Possibly inactive / stale
Failed or partial
```

Never display a green “live” indicator based only on a timer. Use **reported active N minutes ago**.

### Run detail

Show:

- immutable identity and goal;
- status history;
- event timeline;
- checkpoint summaries;
- commits/tests/evidence;
- pending and historical commands;
- input request;
- final summary or failure state;
- resume/supersede controls;
- audit metadata appropriate for the owner.

### Command composer

The owner can queue a command with:

- concise body;
- priority;
- optional expiry;
- optional “must acknowledge” flag.

UI copy must state: **The agent receives this when it next polls Semogtw DevOS; this is not an instant message sent into ChatGPT.**

### Mobile

At 360 px:

- use cards rather than wide tables;
- keep status, current step, last update, and attention state above the fold;
- command composer remains reachable without horizontal scrolling;
- timelines collapse details but preserve timestamps;
- touch targets remain at least 44 px.

---

## Realtime and delivery adapters

Define a portable interface:

```ts
export interface OwnerRunUpdatePublisher {
  publish(update: OwnerRunUpdate): Promise<void>;
}
```

Preferred delivery order:

1. host-supported WebSocket or realtime channel;
2. Server-Sent Events;
3. short authenticated polling with ETag/`updatedSince`;
4. manual refresh as a final fallback.

The product must remain correct with polling only. Realtime transport failure must not lose persisted events.

For ChatGPT Sites:

- test long-lived connection behavior before selecting WebSocket/SSE;
- do not assume background workers for stale classification;
- if scheduled jobs are unavailable, classify staleness lazily on reads and through an external scheduler when added;
- if Sites cannot host remote MCP, deploy only the MCP gateway externally while retaining the same domain/application contracts.

---

## Notifications

Notification channels are independent from OpenAI API usage.

Foundation implementation must support an in-app notification record. Optional adapters may later add:

- Web Push/PWA notification;
- email;
- Telegram/Discord webhook;
- other owner-approved channels.

Notify on:

```text
waiting_user
completed
completed_partial
failed
stale
high-priority command acknowledged or rejected
```

Add deduplication, quiet hours, channel opt-in, and retry limits. Never include private repository names, branches, secrets, or full summaries in lock-screen notification bodies unless the owner explicitly enables detailed previews.

---

## Security requirements

- MCP authorization must map the caller to an owner-approved agent/client identity and scopes.
- Separate read and write scopes.
- Restrict run-write credentials to the minimum required project/run when supported.
- Do not expose general SQL, filesystem, arbitrary HTTP, shell, GitHub mutation, or secret-reading tools through this MCP surface.
- Reject prompt-injected requests that attempt to enumerate unrelated runs, reveal tokens, change authorization, or bypass owner confirmation.
- Apply rate limits per identity and per run.
- Limit event and command sizes.
- Store token digests, not raw tokens.
- Redact logs and audit metadata.
- Escape/encode all agent-provided strings in the UI.
- Treat evidence URLs and conversation URLs as untrusted external links.
- Use idempotency for every write tool.
- Maintain immutable event history; corrections append superseding events rather than rewriting history silently.
- Owner cancellation, command creation, credential rotation, and destructive cleanup require explicit confirmation in UI.

---

## Checkpoint 0: Reserve foundation extension points

This checkpoint may be implemented during the foundation without enabling the feature.

**Files:**

- Modify: `DATA_MODEL.md` or foundation data-model source
- Modify: `MCP.md`
- Modify: `ARCHITECTURE.md`
- Modify: `RUNBOOK.md`
- Create: `docs/AGENT_RUN_PROTOCOL.md` as a draft

- [ ] Record the control-plane boundary and explicit non-goals.
- [ ] Reserve repository ports and event/audit conventions without exposing routes.
- [ ] Document external-MCP fallback if Sites does not pass the transport gate.
- [ ] Add this plan to the plans index and deferred-phase handoff.
- [ ] Do not claim the feature exists.

---

## Checkpoint 1: Domain, contracts, and migrations

**Deliverables:**

- domain types and transition service;
- private API/MCP Zod schemas;
- migrations for runs, events, commands, and relations;
- repositories with optimistic concurrency;
- invariant and repository contract tests.

- [ ] Write failing transition tests.
- [ ] Implement status invariants.
- [ ] Write failing command-lifecycle tests.
- [ ] Implement command state machine.
- [ ] Add migrations and repository adapters.
- [ ] Add audit events and idempotency storage.
- [ ] Run domain/database verification.
- [ ] Commit and push.

---

## Checkpoint 2: Private API and owner UI without MCP

Implement the feature first through authenticated private APIs so behavior can be tested independently from MCP transport.

- [ ] Add private run list/detail APIs.
- [ ] Add owner command create/cancel APIs.
- [ ] Add authenticated `/devos/runs` pages.
- [ ] Add timeline and command composer.
- [ ] Add lazy stale classification.
- [ ] Add polling-based updates.
- [ ] Add mobile, accessibility, and confidentiality tests.
- [ ] Commit and push.

Acceptance gate: the owner can create a fixture run, observe updates, queue a command, transition statuses through test fixtures, and see immutable history without any MCP server running.

---

## Checkpoint 3: Remote MCP transport and execution tools

- [ ] Prove the remote MCP endpoint with an external discovery/invocation client.
- [ ] Document host, URL, authentication, scopes, and transport.
- [ ] Implement read tools first.
- [ ] Implement `start_run`, heartbeat, event, and checkpoint tools.
- [ ] Implement input, completion, partial, and failure tools.
- [ ] Implement command poll/acknowledgement tools.
- [ ] Add idempotency/replay/conflict tests.
- [ ] Add prompt-injection and cross-run authorization tests.
- [ ] Connect one non-production ChatGPT app/client.
- [ ] Commit and push before enabling production credentials.

Acceptance gate: a test ChatGPT conversation creates a run, updates one checkpoint, receives a queued command after polling, acknowledges it, and completes with evidence.

---

## Checkpoint 4: Realtime delivery and notifications

- [ ] Implement the portable update publisher.
- [ ] Select a verified Sites-compatible or external delivery adapter.
- [ ] Retain polling fallback.
- [ ] Add in-app notifications.
- [ ] Add one optional owner-approved external notification adapter.
- [ ] Test deduplication, retries, quiet hours, and redacted previews.
- [ ] Commit and push.

Acceptance gate: the DevOS UI reflects a persisted checkpoint without manual refresh through the selected adapter, and still works correctly when that adapter is disabled.

---

## Checkpoint 5: Agent protocol rollout

- [ ] Finalize `docs/AGENT_RUN_PROTOCOL.md`.
- [ ] Add the protocol to site-development agent instructions and handoff templates.
- [ ] Require run start/checkpoint/finalization for agents with MCP access.
- [ ] Preserve frequent Git commit/push requirements independently of telemetry.
- [ ] Define fallback reconciliation when MCP is unavailable.
- [ ] Run at least three real development sessions and record friction.
- [ ] Adjust tool descriptions and checkpoint cadence from observed behavior.
- [ ] Commit and push.

---

## Checkpoint 6: Production hardening

- [ ] Rotate all non-production MCP credentials.
- [ ] Verify least-privilege scopes.
- [ ] Verify audit/export/backup paths.
- [ ] Verify stale-classification behavior through clock-controlled tests.
- [ ] Verify cancellation, supersession, resume, and conflict behavior.
- [ ] Run confidentiality preflight against HTML, API payloads, logs, notification bodies, and MCP tool responses.
- [ ] Run load/rate-limit tests appropriate to personal use.
- [ ] Document incident recovery and token revocation.
- [ ] Publish only after a saved/reviewed deployment version passes all gates.

---

## Required test matrix

### Unit

- status transitions;
- completion evidence requirement;
- partial/failure requirements;
- progress step validation;
- command lifecycle;
- stale classification;
- notification deduplication;
- event redaction and size limits.

### Integration

- repository transaction consistency;
- optimistic concurrency conflicts;
- idempotent tool replay;
- private API authorization;
- MCP scope enforcement;
- command lease/delivery semantics;
- audit creation for every write;
- realtime adapter fallback.

### E2E

```text
Chat starts run
-> DevOS displays reported active
-> chat records checkpoint
-> owner queues command
-> chat polls and receives command
-> chat acknowledges/applies command
-> chat attaches commit/test evidence
-> chat completes
-> owner receives notification
-> history remains readable
```

Also test:

- chat disappears without completion and becomes stale;
- owner cancels a run;
- a second run supersedes an interrupted run;
- unauthorized MCP identity cannot access another run;
- public pages and APIs contain no run data;
- 360 px UI has no horizontal overflow;
- realtime disabled still works through polling.

---

## Definition of done

This plan is complete only when:

- [ ] the feature has no OpenAI API billing dependency;
- [ ] a participating ChatGPT conversation can report execution state through remote MCP;
- [ ] the owner can see reported progress, data age, evidence, attention state, and final result in DevOS;
- [ ] owner commands are delivered through cooperative polling with visible received/acknowledged/applied state;
- [ ] the UI never claims direct access to ChatGPT account conversations or hidden model state;
- [ ] stale detection is explicit and configurable;
- [ ] completion and partial completion require preserved evidence and summaries;
- [ ] public/private isolation tests pass;
- [ ] audit, idempotency, rate limits, token revocation, backup, and confidentiality gates pass;
- [ ] Sites/external-host deployment choices are documented from observed tests;
- [ ] `AGENT_RUN_PROTOCOL.md`, `MCP.md`, `DATA_MODEL.md`, `ARCHITECTURE.md`, `SECURITY.md`, `RUNBOOK.md`, `TESTING.md`, and `CHANGELOG.md` reflect the implementation;
- [ ] the implementation commit and deployed version are recorded in the handoff.

---

## Handoff template

```text
Control-plane version:
Implementation commit:
Deployment mode:
MCP endpoint host:
MCP transport/auth:
Realtime adapter:
Polling fallback verified:
Notification adapters:
Migrations applied:
Tools enabled:
Tools intentionally disabled:
Security gates executed:
E2E run IDs:
Known limitations:
Next action:
```
