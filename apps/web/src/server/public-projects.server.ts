import {
  toPublicProjectDto,
  type PublicProjectDto,
} from "@semogtw/contracts";
import {
  SqlitePublicProjectSource,
  type SqliteDatabase,
} from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

export type PublicProjectReader = {
  list(): Promise<readonly PublicProjectDto[]>;
  findBySlug(slug: string): Promise<PublicProjectDto | null>;
};

export function createPublicProjectReader(
  database: SqliteDatabase,
): PublicProjectReader {
  const source = new SqlitePublicProjectSource(database);
  return {
    list: async () => (await source.listListed()).map(toPublicProjectDto),
    findBySlug: async (slug) => {
      const project = await source.findPublishableBySlug(slug);
      return project === null ? null : toPublicProjectDto(project);
    },
  };
}

async function getReader(): Promise<PublicProjectReader | null> {
  const database = await getNodeDatabase();
  return database === null ? null : createPublicProjectReader(database);
}

export async function readPublicProjects(): Promise<readonly PublicProjectDto[]> {
  const reader = await getReader();
  return reader?.list() ?? [];
}

export async function readPublicProjectBySlug(
  slug: string,
): Promise<PublicProjectDto | null> {
  const reader = await getReader();
  return reader?.findBySlug(slug) ?? null;
}
