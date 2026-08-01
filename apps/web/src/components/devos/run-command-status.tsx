import { Status } from "@semogtw/ui";
import type { StatusTone } from "@semogtw/ui";

const statusLabels = {
  queued: "na fila",
  acknowledged: "reconhecido",
  completed: "aplicado",
  rejected: "rejeitado",
  expired: "expirado",
} as const;

type CommandStatus = keyof typeof statusLabels;
type QueueAvailability =
  | "available"
  | "expired"
  | "not_applicable"
  | "invalid_expiration";

function statusTone(status: CommandStatus): StatusTone {
  if (status === "completed") return "success";
  if (status === "rejected" || status === "expired") return "danger";
  if (status === "acknowledged") return "info";
  return "warning";
}

export function RunCommandStatus({
  status,
  queueAvailability,
}: {
  status: CommandStatus;
  queueAvailability: QueueAvailability;
}) {
  return (
    <div className="run-card__statuses">
      <Status tone={statusTone(status)}>{statusLabels[status]}</Status>
      {status === "queued" && queueAvailability === "expired" ? (
        <Status tone="danger">expirado para consumo</Status>
      ) : null}
      {status === "queued" && queueAvailability === "invalid_expiration" ? (
        <Status tone="danger">expiração inválida</Status>
      ) : null}
    </div>
  );
}
