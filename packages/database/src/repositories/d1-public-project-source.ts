import type { PublishableProjectSource } from "@semogtw/contracts";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { SemogtwD1Database } from "../adapters/d1";
import { projects } from "../schema/projects";
import { toPublishableProjectSource } from "./public-project-mapping";

export class D1PublicProjectSource {
  constructor(private readonly database: SemogtwD1Database) {}

  async listListed(): Promise<readonly PublishableProjectSource[]> {
    const rows = await this.database
      .select()
      .from(projects)
      .where(
        and(eq(projects.visibility, "public"), isNotNull(projects.publicSummary)),
      )
      .orderBy(asc(projects.name))
      .all();
    return rows.map(toPublishableProjectSource);
  }

  async findPublishableBySlug(
    slug: string,
  ): Promise<PublishableProjectSource | null> {
    const row = await this.database
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
    return row === undefined ? null : toPublishableProjectSource(row);
  }
}
