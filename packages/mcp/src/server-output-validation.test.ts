import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  createSemogtwMcpServer,
  type SemogtwMcpReadService,
} from "./server";

function malformedService(): SemogtwMcpReadService {
  return {
    async getOverview() {
      return { activeProjectCount: "private-value" } as never;
    },
    async getToday() {
      return { executeNow: "not-an-array" } as never;
    },
    async listProjects() {
      return { activeProjects: null } as never;
    },
    async getProject() {
      return { ok: true, data: { project: null } } as never;
    },
    async queryRoadmap() {
      return { ok: true, data: { items: [], board: null } } as never;
    },
  };
}

const stableFailure = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        ok: false,
        error: { code: "DEVOS_READ_FAILED" },
      }),
    },
  ],
  isError: true,
};

describe("Semogtw MCP output validation", () => {
  it("turns malformed service results into stable tool errors", async () => {
    const server = createSemogtwMcpServer(malformedService());
    const client = new Client({ name: "output-validation", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      for (const request of [
        { name: "devos_get_overview", arguments: {} },
        { name: "devos_get_today", arguments: {} },
        { name: "devos_list_projects", arguments: {} },
        {
          name: "devos_get_project",
          arguments: { slug: "semog-site" },
        },
        {
          name: "devos_query_roadmap",
          arguments: {},
        },
      ]) {
        await expect(client.callTool(request)).resolves.toEqual(stableFailure);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("uses the same validation for static resources", async () => {
    const server = createSemogtwMcpServer(malformedService());
    const client = new Client({ name: "resource-validation", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);

      for (const uri of [
        "semogtw://devos/overview",
        "semogtw://devos/today",
        "semogtw://devos/projects",
        "semogtw://devos/roadmap",
      ]) {
        const result = await client.readResource({ uri });
        const content = result.contents[0];
        if (content === undefined || !("text" in content)) {
          throw new Error("EXPECTED_TEXT_RESOURCE");
        }
        expect(JSON.parse(content.text)).toEqual({
          ok: false,
          error: { code: "DEVOS_READ_FAILED" },
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
