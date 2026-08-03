# Semogtw Session Inactivity and Continuation — Design Specification

**Status:** Proposed for owner review  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Branch:** `develop/session-inactivity-continuation`  
**Stacked on:** `develop/workflow-control-core`

## 1. Purpose

Add a conservative private workflow to Semogtw DevOS that identifies repositories whose tracked branch has remained unchanged long enough that the responsible AI session **may have stopped**, then lets the owner copy a deterministic continuation prompt and open the exact configured ChatGPT Project/chat or another approved HTTPS destination.

The feature must reduce manual checking without claiming access to hidden provider telemetry. No commit activity can prove that an AI session ended, and a fresh commit is not proof that a session remains alive.

## 2. Product language

Approved language:

- `atividade recente`;
- `branch silenciosa`;
- `sessão possivelmente encerrada`;
- `observação desatualizada`;
- `evidência insuficiente`;
- `copiar prompt e abrir projeto`.

Forbidden language:

- `a IA terminou`;
- `a sessão encerrou`;
- `o agente está offline`;
- `execução concluída` based only on commit silence;
- any claim of provider heartbeat, quota, hidden reasoning or browser state not actually observed.

The UI always exposes the latest observed SHA, commit time, observation time, elapsed values and confidence reason.

## 3. Current evidence available in the repository

The existing GitHub observation model already stores:

- `github_branch_observations.head_sha`;
- `github_branch_observations.committed_at`;
- `github_branch_observations.observed_at`;
- repository `active_branch`, falling back to `default_branch`;
- active/expired scope reservations;
- exact-SHA verification obligations;
- immutable recovery snapshots and their continuation prompts.

The design uses both branch times:

- `committed_at` measures how long the head has remained unchanged;
- `observed_at` measures whether the evidence is fresh enough to support an inference.

An old commit with an old observation is **stale**, not `likely_ended`.

## 4. Alternatives considered

### Approach A — add ChatGPT fields directly to `repositories`

Add threshold and `chatgpt_url` columns to the existing repository row, then derive a badge in the current read model.

Advantages:

- few files and one simple join;
- minimal initial migration.

Disadvantages:

- couples the canonical repository entity to one provider;
- mixes external-destination configuration with GitHub identity/lifecycle;
- makes future versioning, disabling and audit history awkward;
- encourages unrelated repository updates for continuation policy changes.

**Decision:** rejected.

### Approach B — separate continuation profile plus read-time evaluator

Create a private, versioned continuation profile associated with one repository. A host-independent domain evaluator combines the profile with the latest accepted-branch observation and current coordination state. The web generates a deterministic prompt and performs the clipboard/open action only on an explicit owner click.

Advantages:

- provider-neutral core;
- no scheduler requirement;
- thresholds and destination are independently versioned/audited;
- stale evidence fails conservatively;
- future webhook and agent adapters can reuse the same state machine;
- no change to GitHub write permissions.

Disadvantages:

- one additional table/event stream and read model;
- initial state depends on manual/current GitHub synchronization.

**Decision:** recommended for phase 1.

### Approach C — external watcher or automatic agent trigger as the primary system

Use a scheduled worker, webhook service, browser extension or provider-agent API to detect silence and start work automatically.

Advantages:

- potentially fewer owner clicks;
- near-realtime state with webhooks;
- can create a new provider conversation when a supported authenticated API exists.

Disadvantages:

- introduces hosting, secrets, availability and provider coupling;
- cannot safely paste/submit into an ordinary ChatGPT web page from the site because of browser-origin isolation;
- may create duplicate sessions while a reservation or uncommitted local work still exists;
- ordinary Project URLs do not establish a portable programmatic execution contract;
- harder to use on Android and more fragile under provider UI changes.

**Decision:** optional later adapter only. It cannot be a prerequisite for phase 1.

## 5. Phase 1 scope

Phase 1 provides:

1. owner-only continuation-profile configuration;
2. deterministic read-time activity classification;
3. current evidence and reasons in `/devos/workflows`;
4. a versioned continuation prompt generated from private persisted state;
5. `Copiar prompt e abrir projeto` on an explicit owner click;
6. selectable prompt and direct-link fallbacks;
7. domain, migration, persistence, confidentiality, build and browser tests.

Phase 1 does not provide:

- background polling;
- GitHub webhooks;
- automatic notifications;
- automatic prompt paste or submit;
- automatic creation of a ChatGPT conversation;
- external-agent triggers;
- provider cookies/tokens;
- inference from browser tabs, ChatGPT UI state or hidden telemetry.

## 6. Persistence design

Add migration `0014_repository_continuation_profiles.sql`.

### `repository_continuation_profiles`

One current profile per repository:

```text
id
repository_id                 UNIQUE, FK repositories
state                         enabled | disabled
warning_after_minutes         5..1440
likely_ended_after_minutes    > warning, <=10080
max_observation_age_minutes   1..1440
destination_kind              chatgpt_project | chatgpt_chat | generic_https
destination_label             bounded owner-facing text
destination_url               bounded HTTPS URL
additional_instructions       bounded private text, nullable
template_id                   repository-continuation
template_version              1
created_by
created_at
updated_at
version
```

Defaults for a newly configured profile:

```text
warning_after_minutes = 30
likely_ended_after_minutes = 60
max_observation_age_minutes = 30
template_id = repository-continuation
template_version = 1
```

Rules:

- repository must exist and remain private to the owner surface;
- effective tracked branch is `active_branch ?? default_branch`; phase 1 does not duplicate branch configuration;
- `likely_ended_after_minutes` must be greater than the warning threshold;
- destination URLs must use HTTPS, contain no credentials and pass a destination policy;
- ChatGPT kinds accept only verified ChatGPT hosts; generic HTTPS remains disabled unless the server configuration explicitly allows the host;
- prompts, URLs and instructions never enter public DTOs;
- updates use expected version, idempotency and global audit;
- disabling preserves configuration/history and stops evaluation/launch suggestions.

### `repository_continuation_profile_events`

Append-only events:

```text
repository_continuation_profile.create
repository_continuation_profile.update
repository_continuation_profile.enable
repository_continuation_profile.disable
```

Each event stores sequence, before/after, actor, reason, occurrence time, idempotency key and correlation ID. Profile, event and audit writes share one immediate transaction.

## 7. Domain state machine

Create a host-independent `SessionInactivityService` (name may be refined during planning) with no database, React or provider imports.

Input:

```text
now
profile thresholds/state
repository identity/effective branch
latest branch head SHA
branch committedAt
branch observedAt
active non-expired reservations for repository + branch
optional unresolved verification summary
```

Output:

```text
state
confidence
repository/branch/SHA
commitAgeMinutes
observationAgeMinutes
reasonCodes
launchAllowed
coordinationFlags
```

States:

```text
unconfigured
unknown
stale
active
quiet
likely_ended
coordinated
```

Precedence:

1. missing/disabled profile → `unconfigured`;
2. no valid matching branch observation → `unknown`;
3. invalid/future timestamps, invalid full SHA or observation older than the configured maximum → `stale` or `unknown`;
4. active non-expired reservation on the same repository/branch → `coordinated`;
5. fresh commit age below warning → `active`;
6. fresh commit age from warning up to likely-ended threshold → `quiet`;
7. fresh commit age at or above likely-ended threshold and no active reservation → `likely_ended`.

`coordinated` deliberately suppresses `likely_ended`: a renewed reservation is evidence that work may be occurring without a commit. Expired reservations remain history and do not suppress the inference.

Verification obligations are displayed as flags and prompt context. A blocked gate does not itself prove whether a session remains active.

Confidence:

- `high`: fresh observation, valid full SHA, no active reservation and observation age within half the configured freshness window;
- `medium`: valid fresh observation in the latter half of the window;
- `low`: unknown/stale/coordinated or other ambiguity.

`launchAllowed` means only that the configured destination and generated prompt are valid. It does not authorize external execution.

## 8. Read model

Add `SqliteRepositoryContinuationReadModel` rather than expanding the canonical repository entity.

For each enabled profile it resolves:

1. active repository and associated project;
2. effective branch;
3. latest branch observation by repository, branch and repository-observation time;
4. active non-expired reservations for that branch;
5. unresolved verification obligations;
6. latest immutable recovery snapshot for the same repository/branch when available;
7. evaluator output.

The read model must avoid N+1 reads for the dashboard. Initial implementation may use bounded SQL queries plus in-memory grouping, capped at 100 profiles.

No state row is updated when time passes. Refreshing the private route recalculates the classification from `now`.

## 9. Continuation prompt

Create a deterministic `ContinuationPromptService` with template:

```text
repository-continuation@1
```

The prompt includes only persisted/private allowlisted data:

- project and repository identity;
- effective branch;
- latest observed full SHA;
- commit and observation timestamps;
- commit silence and observation age;
- explicit note that silence is not proof of completion;
- active/expired coordination summary;
- unresolved verification obligations and classifications;
- latest recovery snapshot hash and exact next action when available;
- project next action when no snapshot provides one;
- bounded owner `additional_instructions`;
- standard continuation rules:
  - inspect the latest development branch and documentation first;
  - continue pending work rather than restarting;
  - commit and push frequently;
  - execute available gates;
  - document unavailable environment gates and continue safe code work;
  - never claim tests passed without observed output;
  - avoid treating commit silence as proof of prior-session completion.

The service rejects credential-shaped content, unsafe URLs, oversized output and malformed timestamps. It stores no hidden reasoning, provider cookie, browser state or raw log.

The generated prompt is a read-time projection. It is not automatically persisted as a new recovery snapshot. A later explicit action may create a snapshot using the same context.

## 10. Private web surfaces

### Dashboard section

Add `Continuidade de sessões` to `/devos/workflows`.

Each configured repository card shows:

- project/repository;
- effective branch and abbreviated SHA;
- status badge and confidence;
- last commit and last observation times;
- commit silence and observation age;
- active reservation/gate flags;
- destination label;
- `Copiar prompt e abrir projeto` when launch is valid;
- `Configurar`, `Atualizar observação` or `Resolver reserva ativa` guidance when inference is unavailable/suppressed.

Cards are ordered:

1. `likely_ended`;
2. `quiet`;
3. `stale`/`unknown`;
4. `coordinated`;
5. `active`;
6. `unconfigured` is shown only in the configuration workspace.

### Configuration route

Add sibling private route:

```text
/devos/workflows/continuation
```

It provides create/update/enable/disable forms for repository profiles. All mutations require owner session, CSRF, explicit confirmation, expected version, reason, idempotency and audit.

### Clipboard/open interaction

On one owner click:

1. synchronously call `window.open(destinationUrl, "_blank", "noopener,noreferrer")` so popup blockers can associate it with the gesture;
2. attempt `navigator.clipboard.writeText(prompt)` from the same click flow;
3. report whether the destination opened and the prompt copied;
4. when the popup is blocked, retain a visible direct link;
5. when clipboard permission is denied, render the prompt in a read-only selectable textarea;
6. never append the private prompt to the destination URL;
7. never attempt cross-origin paste or automatic submit.

Opening a stored Project/chat URL is navigation only. The system makes no claim that the destination accepts a prefilled prompt or that a new session started.

## 11. Security and privacy

- every profile, status, prompt and destination is owner-private;
- public serializers, sitemap, metadata and anonymous loaders contain no continuation data;
- URL validation occurs server-side and again before rendering a launch control;
- no open redirects from public or unauthenticated input;
- destination values never appear in normal logs;
- additional instructions and prompts are bounded and credential-scanned;
- GitHub remains read-only;
- no provider token/cookie/session identifier is stored;
- no external request is made when merely evaluating status;
- owner actions are audited without storing secrets in audit snapshots;
- CSP/host behavior is verified before production launch controls are enabled.

## 12. Degraded operation

- no fresh GitHub observation → `stale`/`unknown`, with manual synchronization guidance;
- no destination → configuration required, no launcher;
- no clipboard → selectable prompt remains available;
- popup blocked → direct link remains available;
- no recovery snapshot → prompt uses repository/project/gate context;
- active reservation → `coordinated`, no `likely_ended` claim;
- no scheduler → route refresh recalculates time-based state correctly;
- no webhook → owner/manual sync updates evidence;
- no ChatGPT availability → prompt can be copied and used elsewhere.

## 13. Phase 2 adapters

### GitHub push webhook

A future server adapter may validate `X-Hub-Signature-256`, filter configured repositories/branches and persist normalized observations. The domain state machine remains unchanged. Webhooks improve evidence freshness but do not mark sessions complete.

### Notifications

A future condition watcher may notify only on transition into `likely_ended`, deduplicated by repository, branch and head SHA. It must not notify repeatedly for the same unchanged head.

### External agent trigger

A separately reviewed adapter may call an authenticated official agent API and persist an external run/conversation URL. It must use server-side secrets, idempotency and explicit owner enablement. It is not the same contract as opening an ordinary personal ChatGPT Project and is out of phase 1.

### Browser extension/userscript

Not recommended as the primary path. It is fragile, provider-UI dependent and weak on Android. It may be explored only as an optional owner-controlled tool.

## 14. Testing strategy

### Domain tests

- exact threshold boundaries;
- future/invalid timestamps;
- stale observation never becomes `likely_ended`;
- active reservation suppresses likely-ended inference;
- expired reservation does not suppress;
- warning/likely threshold validation;
- full-SHA requirement;
- deterministic reason/confidence output.

### Migration/persistence tests

- fresh and upgraded database apply `0014` once;
- profile constraints and repository FK;
- transactional profile/event/audit writes;
- stable idempotent retry and changed-intent conflict;
- expected-version conflict;
- disabled profile preserved but not evaluated;
- destination validation and credential rejection.

### Read model/prompt tests

- effective active/default branch selection;
- latest matching observation only;
- stale observation classification;
- active reservation grouping;
- unresolved gate and latest snapshot context;
- bounded deterministic prompt;
- no private/public projection crossover;
- no N+1 behavior beyond documented bounded queries.

### Browser tests

- anonymous redirect and no public marker leakage;
- owner creates/updates/disables a profile;
- fresh old head renders `sessão possivelmente encerrada`;
- stale observation renders `observação desatualizada` instead;
- active reservation suppresses the likely-ended status;
- launch click invokes the approved URL and clipboard with no prompt in the URL;
- clipboard-denied and popup-blocked fallbacks;
- keyboard and 360 × 800 usability.

## 15. Delivery sequence after approval

1. write an executable implementation plan;
2. add domain state-machine tests, then implementation;
3. add migration `0014`, schema and migration tests;
4. add transactional profile repository/events/audit;
5. add bounded continuation read model and prompt service;
6. add owner-only profile server functions;
7. add dashboard cards and configuration route;
8. add clipboard/open client behavior and fallbacks;
9. add focused and browser gates;
10. reconcile documentation and open a stacked PR targeting `develop/workflow-control-core`.

## 16. Phase 1 acceptance criteria

Phase 1 is accepted when:

- the feature is private, provider-neutral and scheduler-independent;
- every configured repository is evaluated only from its effective branch;
- `likely_ended` requires a fresh matching observation and no active reservation;
- stale/missing evidence never produces a completion-like claim;
- thresholds are bounded, ordered, versioned and audited;
- a deterministic prompt includes branch, SHA, evidence age, gates and next action;
- the owner can copy the prompt and open the exact approved destination in one click;
- popup/clipboard failures have usable fallbacks;
- no prompt is placed in a URL or submitted cross-origin;
- GitHub remains read-only;
- public routes/bundles contain no continuation data;
- domain, migration, repository, typecheck, build and Playwright gates pass on the stacked branch.

## 17. Review decision requested

Approve or revise these phase-1 choices before implementation:

- separate provider-neutral continuation profile;
- default thresholds `30 / 60 / 30` minutes (warning / likely ended / maximum observation age);
- active reservation suppresses `likely_ended`;
- effective branch is `active_branch ?? default_branch`;
- exact owner-provided Project/chat URL is opened, but prompt paste/submit remains manual;
- automatic webhook/notification/agent trigger remains phase 2.