import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeGitHubSyncService } from "./github-sync.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const TriggerGitHubSyncSchema = z.object({
  csrfToken: z.string().min(1),
  confirmed: z.literal(true),
});

export const triggerGitHubSyncFn = createServerFn({ method: "POST" })
  .validator(TriggerGitHubSyncSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar esta sincronização.",
      };
    }

    const service = await getNodeGitHubSyncService();
    if (service === null) {
      return {
        ok: false as const,
        code: "GITHUB_NOT_CONFIGURED" as const,
        message:
          "A integração GitHub ainda não possui token ou armazenamento configurado no servidor.",
      };
    }

    const now = new Date().toISOString();
    try {
      const summary = await service.synchronize({
        runId: `github-sync-${crypto.randomUUID()}`,
        now,
        maxTargets: 25,
        maxBranches: 25,
        stabilityWindowHours: 72,
      });
      return {
        ok: true as const,
        message:
          summary.status === "success"
            ? "Observações do GitHub registradas com sucesso."
            : summary.status === "partial"
              ? "A sincronização terminou parcialmente; as observações válidas foram preservadas."
              : "Nenhum repositório pôde ser observado nesta rodada.",
        summary,
      };
    } catch {
      return {
        ok: false as const,
        code: "GITHUB_SYNC_FAILED" as const,
        message:
          "A sincronização não pôde ser concluída. Nenhuma credencial foi exposta.",
      };
    }
  });
