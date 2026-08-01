import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "primary" | "neutral" | "danger";

export function Button({
  tone = "neutral",
  children,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`sem-button sem-button--${tone} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
