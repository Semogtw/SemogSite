import type { ProjectRepository, ProjectSnapshot } from "@semogtw/domain";
import { asc, eq, sql } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { projects } from "../schema/projects";

const priorityOrder = sql<number>`CASE ${projects.priority}
  WHEN 'critical' THEN 0
  WHEN 'high' THEN 1
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 3
  ELSE 4
END`;

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async insert(project: ProjectSnapshot): Promise<void> {
    this.database.insert(projects).values(project).run();
  }

  async listActive(): Promise<readonly ProjectSnapshot[]> {
    return this.database
      .select()
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(priorityOrder, asc(projects.name))
      .all();
  }

  async findBySlug(slug: string): Promise<ProjectSnapshot | null> {
    return (
      this.database
        .select()
        .from(projects)
        .where(eq(projects.slug, slug))
        .get() ?? null
    );
  }
}
