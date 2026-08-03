import type { SqliteDatabase } from "../adapters/sqlite";

export type RepositoryTargetProjectOption = {
  id: string;
  name: string;
  slug: string;
};

export type WorkflowRepositoryOption = {
  id: string;
  projectId: string | null;
  fullName: string;
  branch: string;
};

export class SqliteRepositoryTargetOptions {
  constructor(private readonly database: SqliteDatabase) {}

  async listProjects(): Promise<readonly RepositoryTargetProjectOption[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT id, name, slug
         FROM projects
         WHERE status <> 'archived'
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .all() as RepositoryTargetProjectOption[];

    return rows;
  }

  async listWorkflowRepositories(): Promise<
    readonly WorkflowRepositoryOption[]
  > {
    const rows = this.database.$client
      .prepare(
        `SELECT id,
                project_id AS projectId,
                full_name AS fullName,
                COALESCE(active_branch, default_branch) AS branch
         FROM repositories
         WHERE status = 'active'
         ORDER BY full_name COLLATE NOCASE ASC, id ASC`,
      )
      .all() as WorkflowRepositoryOption[];

    return rows;
  }
}
