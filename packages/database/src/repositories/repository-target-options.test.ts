import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetOptions } from "./repository-target-options";

describe("SqliteRepositoryTargetOptions", () => {
  it("lists persisted projects in deterministic display order", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const options = new SqliteRepositoryTargetOptions(database);

    const projects = await options.listProjects();

    expect(projects.length).toBeGreaterThan(0);
    expect(projects).toContainEqual(
      expect.objectContaining({ id: "demo-project-platform" }),
    );
    expect(projects).toEqual(
      [...projects].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      ),
    );
    database.$client.close();
  });
});
