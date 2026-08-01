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
import { z } from "zod";

export type SemogtwMcpReadService = {
  getOverview(): Promise<DevOSOverview>;
  getToday(): Promise<TodayQueue>;
  listProjects(): Promise<OperationalPortfolio>;
  getProject(slug: string): Promise<DevOSReadResult<ProjectHub>>;
  queryRoadmap(
    input: DevOSRoadmapQueryInput,
  ): Promise<DevOSReadResult<RoadmapResult>>;
};

const resourceUris = {
  overview: "semogtw://devos/overview",
  today: "semogtw://devos/today",
  projects: "semogtw://devos/projects",
  roadmap: "semogtw://devos/roadmap",
} as const;

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

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

const maxMcpJsonBytes = 256 * 1024;

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

function errorPayload(code: StableErrorCode): JsonRecord {
  return { ok: false, error: { code } };
}

function serializePayload(payload: JsonRecord): SerializationResult {
  try {
    const text = JSON.stringify(payload);
    if (new TextEncoder().encode(text).byteLength > maxMcpJsonBytes) {
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

function toolSuccess(key: string, value: unknown) {
  const structuredContent: JsonRecord = { [key]: value };
  const serialized = serializePayload(structuredContent);
  if (!serialized.ok) return toolFailure(serialized.code);

  return {
    content: [{ type: "text" as const, text: serialized.text }],
    structuredContent,
  };
}

async function resourceContents(
  uri: string,
  read: () => Promise<ResourceReadResult>,
) {
  let payload: JsonRecord;
  try {
    const result = await read();
    payload = result.ok
      ? { ok: true, data: result.data }
      : errorPayload(result.code);
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
    "devos_get_overview",
    {
      title: "Read DevOS overview",
      description:
        "Read the private Semogtw DevOS overview without changing operational state.",
      outputSchema: { overview: z.unknown() },
      annotations: readOnlyAnnotations,
    },
    async () =>
      guardedTool(async () => toolSuccess("overview", await service.getOverview())),
  );

  server.registerTool(
    "devos_get_today",
    {
      title: "Read today's DevOS queue",
      description:
        "Read current work, owner attention, external dependencies and recent activity.",
      outputSchema: { today: z.unknown() },
      annotations: readOnlyAnnotations,
    },
    async () =>
      guardedTool(async () => toolSuccess("today", await service.getToday())),
  );

  server.registerTool(
    "devos_list_projects",
    {
      title: "List operational projects",
      description:
        "Read the private operational project and repository catalog.",
      outputSchema: { projects: z.unknown() },
      annotations: readOnlyAnnotations,
    },
    async () =>
      guardedTool(async () =>
        toolSuccess("projects", await service.listProjects()),
      ),
  );

  server.registerTool(
    "devos_get_project",
    {
      title: "Read a project hub",
      description:
        "Read one private project hub by its canonical DevOS slug.",
      inputSchema: {
        slug: z.string().trim().min(1).max(120),
      },
      outputSchema: { project: z.unknown() },
      annotations: readOnlyAnnotations,
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
        return toolSuccess("project", result.data);
      } catch {
        return toolFailure("DEVOS_READ_FAILED");
      }
    },
  );

  server.registerTool(
    "devos_query_roadmap",
    {
      title: "Query the operational roadmap",
      description:
        "Read roadmap items using bounded project, state and area filters.",
      inputSchema: {
        projectIds: z
          .array(z.string().trim().min(1).max(200))
          .max(50)
          .optional(),
        states: z.array(stageStateSchema).max(5).optional(),
        areas: z.array(roadmapAreaSchema).max(6).optional(),
        includeCompleted: z.boolean().optional(),
      },
      outputSchema: { roadmap: z.unknown() },
      annotations: readOnlyAnnotations,
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
        return toolSuccess("roadmap", result.data);
      } catch {
        return toolFailure("DEVOS_READ_FAILED");
      }
    },
  );

  server.registerResource(
    "devos-overview",
    resourceUris.overview,
    {
      title: "Semogtw DevOS overview",
      description: "Current private operational overview.",
      mimeType: "application/json",
    },
    async (uri) =>
      resourceContents(uri.toString(), async () => ({
        ok: true,
        data: await service.getOverview(),
      })),
  );

  server.registerResource(
    "devos-today",
    resourceUris.today,
    {
      title: "Semogtw DevOS today queue",
      description: "Current private execution and attention queues.",
      mimeType: "application/json",
    },
    async (uri) =>
      resourceContents(uri.toString(), async () => ({
        ok: true,
        data: await service.getToday(),
      })),
  );

  server.registerResource(
    "devos-projects",
    resourceUris.projects,
    {
      title: "Semogtw DevOS project catalog",
      description: "Private operational project and repository catalog.",
      mimeType: "application/json",
    },
    async (uri) =>
      resourceContents(uri.toString(), async () => ({
        ok: true,
        data: await service.listProjects(),
      })),
  );

  server.registerResource(
    "devos-roadmap",
    resourceUris.roadmap,
    {
      title: "Semogtw DevOS roadmap",
      description: "Private active roadmap without completed items by default.",
      mimeType: "application/json",
    },
    async (uri) =>
      resourceContents(uri.toString(), async () => {
        const result = await service.queryRoadmap({
          projectIds: [],
          states: [],
          areas: [],
          includeCompleted: false,
        });
        return result.ok
          ? { ok: true, data: result.data }
          : { ok: false, code: "ROADMAP_INVALID_INPUT" };
      }),
  );

  return server;
}
