import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSqliteDatabase, migrate } from "@semogtw/database";
import { describe, expect, it } from "vitest";
import { createSqliteSemogtwMcpServer } from "./sqlite-server";

describe("createSqliteSemogtwMcpServer", () => {
  it("serves canonical SQLite reads through the MCP protocol without opening a listener", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const server = createSqliteSemogtwMcpServer(database);
    const client = new Client({ name: "sqlite-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      const overview = await client.callTool({
        name: "devos_get_overview",
        arguments: {},
      });
      expect(overview.isError).not.toBe(true);
      expect(overview.structuredContent).toMatchObject({
        overview: {
          activeProjectCount: 1,
          inProgressStageCount: 1,
        },
      });

      const project = await client.callTool({
        name: "devos_get_project",
        arguments: { slug: "semogtw-platform-demo" },
      });
      expect(project.isError).not.toBe(true);
      expect(project.structuredContent).toMatchObject({
        project: {
          project: {
            id: "demo-project-platform",
            slug: "semogtw-platform-demo",
          },
          currentStages: [{ id: "demo-stage-database" }],
        },
      });

      const roadmap = await client.readResource({
        uri: "semogtw://devos/roadmap",
      });
      const content = roadmap.contents[0];
      if (content === undefined || !("text" in content)) {
        throw new Error("EXPECTED_TEXT_RESOURCE");
      }
      expect(JSON.parse(content.text)).toMatchObject({
        ok: true,
        data: {
          items: [{ id: "demo-stage-database" }],
        },
      });
    } finally {
      await client.close();
      await server.close();
      database.$client.close();
    }
  });
});
