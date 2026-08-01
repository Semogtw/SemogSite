import { createHash, randomUUID } from "node:crypto";
import { SqliteGitHubSyncStore, type SqliteDatabase } from "@semogtw/database";
import {
  GitHubSyncService,
  type SyncIdentityFactory,
} from "@semogtw/domain";
import {
  GitHubRepositoryObservationSource,
  GitHubRestClient,
} from "@semogtw/github";
import { getNodeDatabase } from "./node-database.server";

function identityFactory(): SyncIdentityFactory {
  return {
    nextId(prefix) {
      return `${prefix}-${randomUUID()}`;
    },
    hash(value) {
      return createHash("sha256").update(value, "utf8").digest("hex");
    },
  };
}

export function createNodeGitHubSyncService(
  database: SqliteDatabase,
  token: string,
): GitHubSyncService {
  const client = new GitHubRestClient({ token });
  const source = new GitHubRepositoryObservationSource(client);
  const store = new SqliteGitHubSyncStore(database);
  return new GitHubSyncService(store, source, identityFactory());
}

export async function getNodeGitHubSyncService(): Promise<GitHubSyncService | null> {
  const token = process.env.SEMOGTW_GITHUB_TOKEN?.trim();
  if (!token) return null;

  const database = await getNodeDatabase();
  if (database === null) return null;
  return createNodeGitHubSyncService(database, token);
}
