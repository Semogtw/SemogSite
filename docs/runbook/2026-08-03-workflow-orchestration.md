# Runbook — Workflow Orchestration Core

## Scope

This runbook covers the private Semogtw DevOS workflow coordination capability:

- scope reservations;
- verification obligations;
- recovery snapshots;
- the owner-only workflow dashboard;
- degraded operation when GitHub, MCP, background jobs or a provider UI is unavailable.

It does not describe remote MCP authentication, provider automation or GitHub mutations.

## Normal operating loop

### Before substantial work

1. Open `/devos/workflows`.
2. Confirm the repository and accepted active branch.
3. Review active and expired reservations.
4. Create a reservation with the smallest useful scope.
5. Record the participant label, purpose and expected validity.
6. When overlap is detected, stop and inspect the conflicting reservation. Acknowledge overlap only when the work is demonstrably independent or intentionally coordinated.

Recommended scope order:

```text
specific files
bounded directory
issue or stage identifier
repository-wide reservation only when necessary
```

### During work

- renew or replace a reservation before its expiry when work continues;
- keep commits and pushes frequent;
- register a verification obligation as soon as a required gate cannot be completed;
- link the gate to the full current commit SHA;
- classify unavailable tooling as `environment_missing`, not `code_failure`;
- preserve an exact next action for every unresolved gate;
- do not use a heartbeat, commit or reservation as proof that a test passed.

### Before ending or changing provider

1. Push the latest preserved commit.
2. Ensure the accepted branch has a fresh persisted GitHub observation.
3. Open `/devos/workflows/recovery`.
4. Select the repository.
5. Record the exact next action and runtime capabilities.
6. Generate a recovery snapshot.
7. Copy the Markdown handoff or retain the immutable snapshot ID and hash.
8. End or override reservations that should no longer block coordination.

## Reservation handling

### Active reservation

An active reservation participates in overlap detection only while:

- persisted state is `active`; and
- `expires_at` is after the observation timestamp.

The UI labels this as `active`.

### Expired reservation

An expired reservation remains persisted and auditable but does not block new work. The UI labels it as `expired`.

Do not delete expired rows. Use owner override only when an explicit historical transition is useful, such as taking over an abandoned session.

### Overriding a reservation

Use owner override when:

- a prior participant is no longer available;
- a session reset left a reservation active;
- the holder cannot release it through the cooperative run;
- the owner intentionally takes responsibility for the conflict.

Required fields:

- current reservation version;
- bounded reason;
- explicit confirmation;
- owner-authenticated CSRF-protected request.

A stale version must be rejected. Refresh the page and reassess before retrying.

## Verification obligations

### Creating a gate

A gate must include:

- active repository ID;
- accepted branch;
- full 40-character commit SHA;
- exact command;
- required runtime capabilities;
- responsible actor;
- exact next action;
- optional toolchain manifest.

Do not create a gate for an abbreviated SHA or for an unverified guessed branch.

### Recording a result

Use `passed` only after observing a successful command result.

For `failed` or `blocked`, choose one explicit classification:

```text
code_failure
environment_missing
flaky
timeout
quota
configuration
external_dependency
unknown
```

Examples:

- missing Android SDK: `environment_missing`;
- compile error produced by the current commit: `code_failure`;
- GitHub runner unavailable before executing code: `external_dependency`;
- time budget exceeded without a deterministic failure: `timeout`;
- repeated nondeterministic test: `flaky`.

Attach HTTPS evidence when available. Do not store credentials in URLs.

### Superseding or waiving

- supersede when a newer commit invalidates the old gate target;
- waive only after an owner accepts the remaining risk;
- never rewrite a historical obligation to point at a newer SHA;
- create a new obligation for the new SHA.

## Recovery snapshots

### Preconditions

Snapshot creation requires:

- an active repository associated with a project;
- an accepted effective branch;
- a persisted GitHub branch observation matching that branch;
- a full observed head SHA;
- a safe continuation prompt and exact next action.

If the branch observation is missing, run the read-only GitHub synchronization or perform an authorized manual refresh. Do not substitute another branch.

### Confidence

Confidence is derived from the age of the persisted branch observation:

```text
up to 1 hour: high
more than 1 hour and up to 24 hours: medium
more than 24 hours: low
```

A low-confidence snapshot remains useful for recovery but should be refreshed before destructive or release work.

### Clipboard failure

When clipboard permission is denied:

1. use the read-only Markdown textarea;
2. select and copy manually;
3. retain the snapshot ID and canonical SHA-256;
4. do not regenerate repeatedly unless source state changed.

### Duplicate snapshot

A repeated request with the same stable intent or canonical hash returns a duplicate result and creates no new row. Use the existing immutable snapshot.

## Degraded operation

### GitHub unavailable or rate-limited

- preserve the latest persisted observation and display its age;
- do not declare a session ended from stale data;
- continue safe code work that does not depend on a new provider read;
- commit and push when connectivity returns;
- generate a snapshot only when the accepted branch has a persisted head.

### MCP unavailable

The workflow core remains available through owner-only web routes and SQLite. Agents must fall back to repository handoffs and reconcile cooperative events later.

### No scheduler or webhook

Reservation freshness is derived lazily during reads. Correctness does not require a background job to mutate expired rows.

### Native SQLite unavailable

Classify the gate as `environment_missing`, preserve the exact command and required toolchain, and continue other independent work. Do not mark database tests as passed.

## Incident recovery

### Conflicting work detected after commits

1. preserve both branch heads;
2. create or update reservations describing each scope;
3. compare commits and changed files;
4. avoid force-pushing either line;
5. create a dedicated reconciliation task;
6. record gates on the merged/rebased SHA rather than reusing old results.

### Snapshot contains unsafe content

The renderer should reject credential-shaped data. If an unsafe snapshot was created through an unforeseen path:

1. revoke affected credentials immediately;
2. restrict access to the private database backup;
3. record an audit incident without copying the secret;
4. add a regression case to the sensitive-content scanner;
5. do not expose the snapshot through notifications or public routes.

### Audit or event insertion failure

Entity mutation and audit/event insertion share one immediate transaction. Treat any thrown failure as no confirmed state change, reload the current record, and retry with the same idempotency identity only when the original intent is unchanged.

## Maintenance

After changing workflow schemas or migrations:

- update migration inventory tests;
- update backup expected migrations;
- run migration idempotency twice;
- verify backup/restore includes new tables;
- run domain and database typechecks;
- run authenticated/anonymous browser privacy gates;
- update `docs/WORKFLOW_ORCHESTRATION.md` and the implementation plan.
