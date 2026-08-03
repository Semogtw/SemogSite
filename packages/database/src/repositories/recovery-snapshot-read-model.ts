import type { RecoveryConfidence } from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";

export type RecoverySnapshotView = {
  id: string;
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryFullName: string;
  branch: string;
  observedCommitSha: string;
  generatedAt: string;
  sourceObservedAt: string;
  confidence: RecoveryConfidence;
  canonicalHash: string;
  markdown: string;
  templateId: string;
  templateVersion: number;
};

type RecoverySnapshotRow = {
  id: string;
  project_id: string;
  project_name: string;
  repository_id: string;
  repository_full_name: string;
  branch: string;
  observed_commit_sha: string;
  generated_at: string;
  source_observed_at: string;
  confidence: RecoveryConfidence;
  canonical_hash: string;
  markdown: string;
  template_id: string;
  template_version: number;
};

function toView(row: RecoverySnapshotRow): RecoverySnapshotView {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    repositoryId: row.repository_id,
    repositoryFullName: row.repository_full_name,
    branch: row.branch,
    observedCommitSha: row.observed_commit_sha,
    generatedAt: row.generated_at,
    sourceObservedAt: row.source_observed_at,
    confidence: row.confidence,
    canonicalHash: row.canonical_hash,
    markdown: row.markdown,
    templateId: row.template_id,
    templateVersion: row.template_version,
  };
}

export class SqliteRecoverySnapshotReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async listRecent(limit = 20): Promise<readonly RecoverySnapshotView[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("RECOVERY_SNAPSHOT_LIMIT_INVALID");
    }

    const rows = this.database.$client
      .prepare(
        `SELECT rs.id,
                rs.project_id,
                p.name AS project_name,
                rs.repository_id,
                r.full_name AS repository_full_name,
                rs.branch,
                rs.observed_commit_sha,
                rs.generated_at,
                rs.source_observed_at,
                rs.confidence,
                rs.canonical_hash,
                rs.markdown,
                rs.template_id,
                rs.template_version
         FROM recovery_snapshots rs
         JOIN projects p ON p.id = rs.project_id
         JOIN repositories r ON r.id = rs.repository_id
         ORDER BY rs.generated_at DESC, rs.id ASC
         LIMIT ?`,
      )
      .all(limit) as RecoverySnapshotRow[];

    return rows.map(toView);
  }
}
