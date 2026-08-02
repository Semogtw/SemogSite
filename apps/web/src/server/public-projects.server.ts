import type { PublicEditorialDocument } from "@semogtw/contracts";
import type { SqliteDatabase } from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";
import {
  createPublicEditorialReader,
  type PublicEditorialReader,
} from "./public-editorial.server";

export type PublicProjectReader = {
  list(): Promise<readonly PublicEditorialDocument[]>;
  findBySlug(slug: string): Promise<PublicEditorialDocument | null>;
};

export function createPublicProjectReader(
  database: SqliteDatabase,
): PublicProjectReader {
  const editorial: PublicEditorialReader = createPublicEditorialReader(database);
  return {
    list: () => editorial.list({ kind: "project", limit: 100 }),
    findBySlug: (slug) => editorial.findBySlug(slug, "project"),
  };
}

async function getReader(): Promise<PublicProjectReader | null> {
  const database = await getNodeDatabase();
  return database === null ? null : createPublicProjectReader(database);
}

export async function readPublicProjects(): Promise<
  readonly PublicEditorialDocument[]
> {
  const reader = await getReader();
  return reader?.list() ?? [];
}

export async function readPublicProject(
  slug: string,
): Promise<PublicEditorialDocument | null> {
  const reader = await getReader();
  return reader?.findBySlug(slug) ?? null;
}
