import { SqliteSafeWorkSource } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

const EvaluateSafeWorkSchema = z.object({
  capabilities: z
    .array(z.string().trim().min(1).max(100))
    .max(100),
  defaultEstimatedMinutes: z.number().int().min(1).max(8 * 60),
});

export const evaluateSafeWorkFn = createServerFn({ method: "POST" })
  .validator(EvaluateSafeWorkSchema)
  .handler(async ({ data }) => {
    const owner = await resolveCurrentOwner();
    if (owner === null) {
      return {
        ok: false as const,
        code: "OWNER_REQUIRED" as const,
        message: "A sessão privada expirou. Entre novamente antes de avaliar o runtime.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento privado está indisponível.",
      };
    }

    try {
      const evaluation = await new SqliteSafeWorkSource(database).evaluate({
        observedAt: new Date().toISOString(),
        availableCapabilities: data.capabilities,
        defaultEstimatedMinutes: data.defaultEstimatedMinutes,
      });
      return { ok: true as const, evaluation };
    } catch {
      return {
        ok: false as const,
        code: "SAFE_WORK_EVALUATION_FAILED" as const,
        message: "A avaliação falhou sem alterar o estado persistido.",
      };
    }
  });
