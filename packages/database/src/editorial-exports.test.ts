import { describe, expect, it } from "vitest";
import {
  SqliteEditorialReadModel,
  SqliteEditorialWriteRepository,
  SqlitePublishedEditorialReadModel,
  schema,
} from "./index";

describe("editorial package exports", () => {
  it("exposes private editorial repositories and all schema tables", () => {
    expect(SqliteEditorialReadModel).toBeDefined();
    expect(SqliteEditorialWriteRepository).toBeDefined();
    expect(SqlitePublishedEditorialReadModel).toBeDefined();
    expect(schema.editorialDocuments).toBeDefined();
    expect(schema.editorialRevisions).toBeDefined();
    expect(schema.editorialReviews).toBeDefined();
    expect(schema.editorialEvents).toBeDefined();
  });
});
