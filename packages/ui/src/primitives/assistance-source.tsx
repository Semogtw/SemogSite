import type { AssistanceOrigin } from "@semogtw/contracts";

export type AssistanceSourceProps = {
  origin: AssistanceOrigin;
  className?: string;
};

const LABELS: Record<AssistanceOrigin["kind"], string> = {
  manual: "Inserido manualmente",
  deterministic_rule: "Calculado automaticamente",
  template: "Estrutura de modelo",
  external_ai_client: "Proposta de IA conectada",
  internal_model_provider: "Proposta de IA configurada",
};

export function AssistanceSource({
  origin,
  className,
}: AssistanceSourceProps): React.JSX.Element {
  return (
    <span className={className} data-assistance-origin={origin.kind}>
      {LABELS[origin.kind]}
    </span>
  );
}
