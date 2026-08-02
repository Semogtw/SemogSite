import { afterEach, describe, expect, it } from "vitest";
import {
  getNodeDatabase,
  resetNodeDatabaseForTests,
} from "./node-database.server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetNodeDatabaseForTests();
});

describe("node database composition", () => {
  it("opens and migrates SQLite without auth secrets", async () => {
    delete process.env.SEMOGTW_SESSION_SECRET;
    delete process.env.SEMOGTW_OWNER_PASSWORD_HASH;
    process.env.SEMOGTW_DATABASE_URL = ":memory:";

    const database = await getNodeDatabase();
    expect(database).not.toBeNull();
    expect(
      database?.$client
        .prepare("SELECT COUNT(*) AS count FROM projects")
        .get(),
    ).toMatchObject({ count: 1 });
  });
});
