import type { ProjectRepository, ProjectSnapshot } from "@semogtw/domain";
import { asc, eq } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { projects } from "../schema/projects";

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
      .orderBy(asc(projects.priority), asc(projects.name))
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
