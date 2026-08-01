import { SessionHandoffService } from "@semogtw/domain";
import { SqliteSessionHandoffRepository } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const SessionHandoffSchema = z.object({
  csrfToken: z.string().min(1),
  projectId: z.string().max(200).nullable(),
  title: z.string().max(1_000),
  branch: z.string().max(1_000).nullable(),
  commits: z.array(z.string().max(100)).max(100),
  completedSummary: z.string().max(10_000),
  testsStatus: z.enum(["not_run", "partial", "passed", "failed", "blocked"]),
  testsSummary: z.string().max(5_000),
  blockers: z.string().max(5_000),
  nextStep: z.string().max(2_000),
  result: z.enum([
    "significant",
    "partial",
    "maintenance",
    "no_change",
    "failed",
  ]),
  reason: z.string().max(2_000),
  confirmed: z.literal(true),
});

export const recordSessionHandoffFn = createServerFn({ method: "POST" })
  .validator(SessionHandoffSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar esta alteração.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "Não foi possível salvar esta alteração.",
      };
    }

    const now = new Date().toISOString();
    const service = new SessionHandoffService(
      new SqliteSessionHandoffRepository(database),
    );
    const result = await service.record(
      {
        projectId: data.projectId,
        title: data.title,
        sessionDate: now,
        branch: data.branch,
        commits: data.commits,
        completedSummary: data.completedSummary,
        testsStatus: data.testsStatus,
        testsSummary: data.testsSummary,
        blockers: data.blockers,
        nextStep: data.nextStep,
        result: data.result,
        reason: data.reason,
        confirmed: data.confirmed,
      },
      {
        actorId: owner.id,
        sessionId: crypto.randomUUID(),
        auditId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        now,
      },
    );

    if (!result.ok) {
      return {
        ok: false as const,
        code: "VALIDATION_FAILED" as const,
        message: "Revise os campos do handoff antes de salvar.",
        errors: result.errors,
      };
    }

    return {
      ok: true as const,
      sessionId: result.session.id,
      message: "Handoff registrado e auditado.",
    };
  });
