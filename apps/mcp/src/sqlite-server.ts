import {
  createSqliteDevOSReadService,
  type SqliteDatabase,
} from "@semogtw/database";
import { createSemogtwMcpServer } from "@semogtw/mcp";

export function createSqliteSemogtwMcpServer(database: SqliteDatabase) {
  return createSemogtwMcpServer(createSqliteDevOSReadService(database));
}
