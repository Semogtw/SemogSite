import { z } from "zod";

const recordSchema = z.record(z.unknown());
const recordListSchema = z.array(recordSchema);
const nullableTimestampSchema = z.string().datetime().nullable();
const nullableTextSchema = z.string().nullable();
const dataSourceSchema = z.enum([
  "manual",
  "github",
  "mcp",
  "migration",
  "seed_demo",
]);

export const devosOverviewOutputSchema = z
  .object({
    activeProjectCount: z.number().int().nonnegative(),
    inProgressStageCount: z.number().int().nonnegative(),
    highImpactAttentionCount: z.number().int().nonnegative(),
    projects: recordListSchema,
    currentStages: recordListSchema,
    attention: recordListSchema,
    lastSyncedAt: nullableTimestampSchema,
  })
  .passthrough();

export const devosTodayOutputSchema = z
  .object({
    executeNow: recordListSchema,
    nextInQueue: recordListSchema,
    needsOwner: recordListSchema,
    externalDependencies: recordListSchema,
    recentActivity: recordListSchema,
  })
  .passthrough();

export const devosProjectsOutputSchema = z
  .object({
    activeProjects: recordListSchema,
    activeRepositories: recordListSchema,
    repositoryCatalog: recordListSchema,
  })
  .passthrough();

export const devosProjectOutputSchema = z
  .object({
    project: recordSchema,
    repositories: recordListSchema,
    currentStages: recordListSchema,
    attention: recordListSchema,
    evidence: recordListSchema,
    recentSessions: recordListSchema,
    nextGate: nullableTextSchema,
    safetyConstraint: nullableTextSchema,
    dataSource: dataSourceSchema,
    updatedAt: z.string().datetime(),
  })
  .passthrough();

export const devosRoadmapOutputSchema = z
  .object({
    items: recordListSchema,
    board: z
      .object({
        backlog: recordListSchema,
        next: recordListSchema,
        in_progress: recordListSchema,
        blocked: recordListSchema,
        completed: recordListSchema,
      })
      .passthrough(),
  })
  .passthrough();
