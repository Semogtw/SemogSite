import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  DevOSOverview,
  DevOSReadResult,
  DevOSRoadmapQueryInput,
  OperationalPortfolio,
  ProjectHub,
  RoadmapResult,
  TodayQueue,
} from "@semogtw/domain";
import { z, type ZodTypeAny } from "zod";
import {
  SEMOGTW_MCP_MAX_JSON_BYTES,
  SEMOGTW_MCP_READ_ANNOTATIONS,
  SEMOGTW_MCP_RESOURCES,
  SEMOGTW_MCP_TOOLS,
} from "./catalog";
import {
  devosOverviewOutputSchema,
  devosProjectOutputSchema,
  devosProjectsOutputSchema,
  devosRoadmapOutputSchema,
  devosTodayOutputSchema,
} from "./output-schemas";

export type SemogtwMcpReadService = {
  getOverview(): Promise<DevOSOverview>;
  getToday(): Promise<TodayQueue>;
  listProjects(): Promise<OperationalPortfolio>;
  getProject(slug: string): Promise<DevOSReadResult<ProjectHub>>;
  queryRoadmap(
    input: DevOSRoadmapQueryInput,
  ): Promise<DevOSReadResult<RoadmapResult>>;
};

const [overviewTool, todayTool, projectsTool, projectTool, roadmapTool] =
  SEMOGTW_MCP_TOOLS;
const [overviewResource, todayResource, projectsResource, roadmapResource] =
  SEMOGTW_MCP_RESOURCES;

const stageStateSchema = z.enum([
  "backlog",
  "next",
  "in_progress",
  "blocked",
  "completed",
]);
const roadmapAreaSchema = z.enum([
  "planning",
  "implementation",
  "integration",
  "validation",
  "release",
  "operation",
]);

type StableErrorCode =
  | "DEVOS_READ_FAILED"
  | "PROJECT_INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "ROADMAP_INVALID_INPUT"
  | "RESULT_TOO_LARGE";

type JsonRecord = Record<string, unknown>;
type ResourceReadResult =
  | { ok: true; data: unknown }
  | { ok: false; code: StableErrorCode };
type SerializationResult =
  | { ok: true; text: string }
  | { ok: false; code: "DEVOS_READ_FAILED" | "RESULT_TOO_LARGE" };
type OutputValidationResult =
  | { ok: true; data: unknown }
  | { ok: false };

function errorPayload(code: StableErrorCode): JsonRecord {
  return { ok: false, error: { code } };
}

function validateOutput(
  schema: ZodTypeAny,
  value: unknown,
): OutputValidationResult {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false };
}

function serializePayload(payload: JsonRecord): SerializationResult {
  try {
    const text = JSON.stringify(payload);
    if (
      new TextEncoder().encode(text).byteLength > SEMOGTW_MCP_MAX_JSON_BYTES
    ) {
      return { ok: false, code: "RESULT_TOO_LARGE" };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, code: "DEVOS_READ_FAILED" };
  }
}

function toolFailure(code: StableErrorCode) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(errorPayload(code)),
      },
    ],
    isError: true,
  };
}

function toolSuccess(
  key: string,
  value: unknown,
  schema: ZodTypeAny,
) {
  const validated = validateOutput(schema, value);
  if (!validated.ok) return toolFailure("DEVOS_READ_FAILED");

  const structuredContent: JsonRecord = { [key]: validated.data };
  const serialized = serializePayload(structuredContent);
  if (!serialized.ok) return toolFailure(serialized.code);

  return {
    content: [{ type: "text" as const, text: serialized.text }],
    structuredContent,
  };
}

async function resourceContents(
  uri: string,
  schema: ZodTypeAny,
  read: () => Promise<ResourceReadResult>,
) {
  let payload: JsonRecord;
  try {
    const result = await read();
    if (!result.ok) {
      payload = errorPayload(result.code);
    } else {
      const validated = validateOutput(schema, result.data);
      payload = validated.ok
        ? { ok: true, data: validated.data }
        : errorPayload("DEVOS_READ_FAILED");
    }
  } catch {
    payload = errorPayload("DEVOS_READ_FAILED");
  }

  const serialized = serializePayload(payload);
  const text = serialized.ok
    ? serialized.text
    : JSON.stringify(errorPayload(serialized.code));

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text,
      },
    ],
  };
}

async function guardedTool(
  read: () => Promise<ReturnType<typeof toolSuccess>>,
) {
  try {
    return await read();
  } catch {
    return toolFailure("DEVOS_READ_FAILED");
  }
}

export function createSemogtwMcpServer(
  service: SemogtwMcpReadService,
): McpServer {
  const server = new McpServer({
    name: "semogtw-devos",
    version: "0.1.0",
  });

  server.registerTool(
    overviewTool.name,
    {
      title: overviewTool.title,
      description: overviewTool.description,
      outputSchema: { overview: devosOverviewOutputSchema },
      annotations: SEMOGTW_MCP_READ_ANNOTATIONS,
    },
    async () =>
      guardedTool(async () =>
        toolSuccess(
          overviewTool.structuredKey,
          await service.getOverview(),
          devosOverviewOutputSchema,
        ),
      ),
  );

  server.registerTool(
    todayTool.name,
    {
      title: todayTool.title,
      description: todayTool.description,
      outputSchema: { today: devosTodayOutputSchema },
      annotations: SEMOGTW_MCP_READ_ANNOTATIONS,
    },
    async () =>
      guardedTool(async () =>
        toolSuccess(
          todayTool.structuredKey,
          await service.getToday(),
          devosTodayOutputSchema,
        ),
      ),
  );

  server.registerTool(
    projectsTool.name,
    {
      title: projectsTool.title,
      description: projectsTool.description,
      outputSchema: { projects: devosProjectsOutputSchema },
      annotations: SEMOGTW_MCP_READ_ANNOTATIONS,
    },
    async () =>
      guardedTool(async () =>
        toolSuccess(
          projectsTool.structuredKey,
          await service.listProjects(),
          devosProjectsOutputSchema,
        ),
      ),
  );

  server.registerTool(
    projectTool.name,
    {
      title: projectTool.title,
      description: projectTool.description,
      inputSchema: {
        slug: z.string().trim().min(1).max(120),
      },
      outputSchema: { project: devosProjectOutputSchema },
      annotations: SEMOGTW_MCP_READ_ANNOTATIONS,
    },
    async ({ slug }) => {
      try {
        const result = await service.getProject(slug);
        if (!result.ok) {
          return toolFailure(
            result.code === "INVALID_INPUT"
              ? "PROJECT_INVALID_INPUT"
              : "PROJECT_NOT_FOUND",
          );
        }
        return toolSuccess(
          projectTool.structuredKey,
          result.data,
          devosProjectOutputSchema,
        );
      } catch {
        return toolFailure("DEVOS_READ_FAILED");
      }
    },
  );

  server.registerTool(
    roadmapTool.name,
    {
      title: roadmapTool.title,
      description: roadmapTool.description,
      inputSchema: {
        projectIds: z
          .array(z.string().trim().min(1).max(200))
          .max(50)
          .optional(),
        states: z.array(stageStateSchema).max(5).optional(),
        areas: z.array(roadmapAreaSchema).max(6).optional(),
        includeCompleted: z.boolean().optional(),
      },
      outputSchema: { roadmap: devosRoadmapOutputSchema },
      annotations: SEMOGTW_MCP_READ_ANNOTATIONS,
    },
    async ({ projectIds, states, areas, includeCompleted }) => {
      try {
        const result = await service.queryRoadmap({
          projectIds: projectIds ?? [],
          states: states ?? [],
          areas: areas ?? [],
          includeCompleted: includeCompleted ?? false,
        });
        if (!result.ok) return toolFailure("ROADMAP_INVALID_INPUT");
        return toolSuccess(
          roadmapTool.structuredKey,
          result.data,
          devosRoadmapOutputSchema,
        );
      } catch {
        return toolFailure("DEVOS_READ_FAILED");
      }
    },
  );

  server.registerResource(
    overviewResource.name,
    overviewResource.uri,
    {
      title: overviewResource.title,
      description: overviewResource.description,
      mimeType: overviewResource.mimeType,
    },
    async (uri) =>
      resourceContents(
        uri.toString(),
        devosOverviewOutputSchema,
        async () => ({
          ok: true,
          data: await service.getOverview(),
        }),
      ),
  );

  server.registerResource(
    todayResource.name,
    todayResource.uri,
    {
      title: todayResource.title,
      description: todayResource.description,
      mimeType: todayResource.mimeType,
    },
    async (uri) =>
      resourceContents(uri.toString(), devosTodayOutputSchema, async () => ({
        ok: true,
        data: await service.getToday(),
      })),
  );

  server.registerResource(
    projectsResource.name,
    projectsResource.uri,
    {
      title: projectsResource.title,
      description: projectsResource.description,
      mimeType: projectsResource.mimeType,
    },
    async (uri) =>
      resourceContents(
        uri.toString(),
        devosProjectsOutputSchema,
        async () => ({
          ok: true,
          data: await service.listProjects(),
        }),
      ),
  );

  server.registerResource(
    roadmapResource.name,
    roadmapResource.uri,
    {
      title: roadmapResource.title,
      description: roadmapResource.description,
      mimeType: roadmapResource.mimeType,
    },
    async (uri) =>
      resourceContents(
        uri.toString(),
        devosRoadmapOutputSchema,
        async () => {
          const result = await service.queryRoadmap({
            projectIds: [],
            states: [],
            areas: [],
            includeCompleted: false,
          });
          return result.ok
            ? { ok: true, data: result.data }
            : { ok: false, code: "ROADMAP_INVALID_INPUT" };
        },
      ),
  );

  return server;
}
