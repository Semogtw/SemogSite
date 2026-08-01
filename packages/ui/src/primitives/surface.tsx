import type { HTMLAttributes, ReactNode } from "react";

export function Surface({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`sem-surface ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
