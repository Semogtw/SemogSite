import type { SqliteDatabase } from "../adapters/sqlite";

export type RepositoryTargetProjectOption = {
  id: string;
  name: string;
  slug: string;
};

export class SqliteRepositoryTargetOptions {
  constructor(private readonly database: SqliteDatabase) {}

  async listProjects(): Promise<readonly RepositoryTargetProjectOption[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT id, name, slug
         FROM projects
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .all() as RepositoryTargetProjectOption[];

    return rows;
  }
}
