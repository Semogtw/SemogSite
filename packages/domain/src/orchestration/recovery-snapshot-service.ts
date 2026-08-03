import {
  buildRecoverySnapshot,
  type RecoverySnapshot,
  type RecoverySnapshotInput,
  type RecoverySnapshotValidationError,
} from "./recovery-snapshot";

export type RecoverySnapshotRecord = {
  id: string;
  snapshot: RecoverySnapshot;
  canonicalJson: string;
  canonicalHash: string;
  markdown: string;
};

export type RecoverySnapshotAuditEvent = {
  id: string;
  actor: string;
  action: "recovery_snapshot.create";
  entityType: "recovery_snapshot";
  entityId: string;
  before: null;
  after: {
    canonicalHash: string;
    schemaVersion: number;
    projectId: string;
    repositoryId: string;
    branch: string;
    observedCommitSha: string;
    generatedAt: string;
  };
  reason: string;
  occurredAt: string;
  source: "manual" | "agent";
  confirmed: true;
  idempotencyKey: string;
  correlationId: string;
};

export type RecoverySnapshotStoreResult =
  | "created"
  | "duplicate"
  | "project_not_found"
  | "repository_not_found"
  | "run_not_found"
  | "conflict";

export interface RecoverySnapshotRepository {
  store(
    record: RecoverySnapshotRecord,
    audit: RecoverySnapshotAuditEvent,
  ): Promise<RecoverySnapshotStoreResult>;
}

export type RecoverySnapshotHasher = (canonicalJson: string) => string;

export type RecoverySnapshotContext = {
  actorId: string;
  auditId: string;
  idempotencyKey: string;
  correlationId: string;
  source?: "manual" | "agent";
};

export type RecoverySnapshotServiceResult =
  | {
      ok: true;
      record: RecoverySnapshotRecord;
      audit: RecoverySnapshotAuditEvent;
    }
  | {
      ok: false;
      code: "SNAPSHOT_INVALID";
      errors: readonly RecoverySnapshotValidationError[];
    }
  | {
      ok: false;
      code:
        | "CONTEXT_INVALID"
        | "HASH_INVALID"
        | "DUPLICATE"
        | "PROJECT_NOT_FOUND"
        | "REPOSITORY_NOT_FOUND"
        | "RUN_NOT_FOUND"
        | "CONFLICT";
    };

const sha256Pattern = /^[0-9a-f]{64}$/u;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function mapStoreFailure(
  result: RecoverySnapshotStoreResult,
): RecoverySnapshotServiceResult {
  if (result === "duplicate") return { ok: false, code: "DUPLICATE" };
  if (result === "project_not_found") {
    return { ok: false, code: "PROJECT_NOT_FOUND" };
  }
  if (result === "repository_not_found") {
    return { ok: false, code: "REPOSITORY_NOT_FOUND" };
  }
  if (result === "run_not_found") return { ok: false, code: "RUN_NOT_FOUND" };
  return { ok: false, code: "CONFLICT" };
}

export class RecoverySnapshotService {
  constructor(
    private readonly repository: RecoverySnapshotRepository,
    private readonly hash: RecoverySnapshotHasher,
  ) {}

  async create(
    input: RecoverySnapshotInput,
    context: RecoverySnapshotContext,
  ): Promise<RecoverySnapshotServiceResult> {
    const actorId = text(context.actorId);
    const auditId = text(context.auditId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    if (
      actorId.length === 0 ||
      auditId.length === 0 ||
      idempotencyKey.length === 0 ||
      correlationId.length === 0
    ) {
      return { ok: false, code: "CONTEXT_INVALID" };
    }

    const built = buildRecoverySnapshot(input);
    if (!built.ok) {
      return {
        ok: false,
        code: "SNAPSHOT_INVALID",
        errors: built.errors,
      };
    }

    const canonicalHash = text(this.hash(built.canonicalJson)).toLowerCase();
    if (!sha256Pattern.test(canonicalHash)) {
      return { ok: false, code: "HASH_INVALID" };
    }

    const record: RecoverySnapshotRecord = {
      id: built.snapshot.snapshotId,
      snapshot: built.snapshot,
      canonicalJson: built.canonicalJson,
      canonicalHash,
      markdown: built.markdown,
    };
    const audit: RecoverySnapshotAuditEvent = {
      id: auditId,
      actor: actorId,
      action: "recovery_snapshot.create",
      entityType: "recovery_snapshot",
      entityId: record.id,
      before: null,
      after: {
        canonicalHash,
        schemaVersion: built.snapshot.schemaVersion,
        projectId: built.snapshot.project.id,
        repositoryId: built.snapshot.repository.id,
        branch: built.snapshot.repository.branch,
        observedCommitSha: built.snapshot.repository.observedCommitSha,
        generatedAt: built.snapshot.generatedAt,
      },
      reason: "Preserve a deterministic workflow recovery checkpoint.",
      occurredAt: built.snapshot.generatedAt,
      source: context.source ?? "manual",
      confirmed: true,
      idempotencyKey,
      correlationId,
    };

    const stored = await this.repository.store(record, audit);
    if (stored !== "created") return mapStoreFailure(stored);
    return { ok: true, record, audit };
  }
}
