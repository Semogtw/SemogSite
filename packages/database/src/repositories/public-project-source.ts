import type { PublishableProjectSource } from "@semogtw/contracts";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { projects } from "../schema/projects";

export class SqlitePublicProjectSource {
  constructor(private readonly database: SqliteDatabase) {}

  async listListed(): Promise<readonly PublishableProjectSource[]> {
    const rows = this.database
      .select()
      .from(projects)
      .where(
        and(eq(projects.visibility, "public"), isNotNull(projects.publicSummary)),
      )
      .orderBy(asc(projects.name))
      .all();
    return rows.map((row) => this.toSource(row));
  }

  async findPublishableBySlug(
    slug: string,
  ): Promise<PublishableProjectSource | null> {
    const row = this.database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.slug, slug),
          inArray(projects.visibility, ["public", "unlisted"]),
          isNotNull(projects.publicSummary),
        ),
      )
      .get();
    return row === undefined ? null : this.toSource(row);
  }

  private toSource(
    row: typeof projects.$inferSelect,
  ): PublishableProjectSource {
    return {
      slug: row.slug,
      name: row.name,
      visibility: row.visibility,
      publicSummary: row.publicSummary,
      publicProgress: row.publicProgress,
      featured: row.featured,
      liveUrl: row.liveUrl,
      documentationUrl: row.documentationUrl,
      lastPublicActivityAt: null,
      privateSummary: row.privateSummary,
      branchSummary: row.branchSummary,
      repositoryFullNames: [],
      blockers: [],
      evidenceUrls: [],
      sessionDetails: [],
      auditEventIds: [],
    };
  }
}
