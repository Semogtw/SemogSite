import type { OwnerEntityAction } from "@semogtw/database/commands";
import { useState, type SyntheticEvent } from "react";
import { getOwnerEntityActionsFn } from "../../server/devos-entity-actions";

const riskLabels: Readonly<Record<OwnerEntityAction["risk"], string>> = {
  read: "Somente leitura",
  low: "Risco baixo",
  medium: "Risco médio",
  high: "Risco alto",
  critical: "Risco crítico",
};

const availabilityLabels: Readonly<
  Record<OwnerEntityAction["availability"], string>
> = {
  available: "Disponível",
  confirmation_required: "Exige confirmação",
  approval_required: "Exige aprovação",
  planned: "Planejado",
};

function actionKey(action: OwnerEntityAction, index: number): string {
  return [
    action.labelPtBr,
    action.risk,
    action.availability,
    action.reversible ? "reversible" : "irreversible",
    String(index),
  ].join(":");
}

export function OwnerEntityActionsDisclosure({
  resourceType,
  resourceId,
}: {
  resourceType: string;
  resourceId: string;
}) {
  const [actions, setActions] = useState<readonly OwnerEntityAction[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadActions() {
    if (actions !== null || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setActions(
        await getOwnerEntityActionsFn({
          data: { resourceType, resourceId },
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) void loadActions();
  }

  return (
    <details className="entity-actions-disclosure" onToggle={handleToggle}>
      <summary>Ações disponíveis</summary>
      {loading ? <p>Carregando ações…</p> : null}
      {failed ? <p>Não foi possível consultar as ações.</p> : null}
      {actions !== null && actions.length === 0 ? (
        <p>Nenhuma ação disponível.</p>
      ) : null}
      {actions !== null && actions.length > 0 ? (
        <ul>
          {actions.map((action, index) => (
            <li key={actionKey(action, index)}>
              <strong>{action.labelPtBr}</strong>
              <span>{riskLabels[action.risk]}</span>
              <span>{availabilityLabels[action.availability]}</span>
              <span>
                {action.reversible
                  ? "Possui ação compensatória"
                  : "Não possui reversão automática"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
