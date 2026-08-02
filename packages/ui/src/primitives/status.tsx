import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Info,
} from "lucide-react";
import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneLabels: Record<StatusTone, string> = {
  neutral: "Status neutro",
  info: "Status informativo",
  success: "Status de sucesso",
  warning: "Status de atenção",
  danger: "Status de bloqueio",
};

const icons = {
  neutral: CircleDashed,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  danger: Ban,
} satisfies Record<StatusTone, typeof CircleAlert>;

export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <span className={`sem-status sem-status--${tone}`}>
      <Icon aria-label={toneLabels[tone]} role="img" size={16} strokeWidth={2} />
      <span>{children}</span>
    </span>
  );
}
