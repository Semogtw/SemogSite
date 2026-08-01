import { EmptyState } from "@semogtw/ui";
import type { ReactNode } from "react";
import { PublicShell } from "./public-shell";

export function EditorialEmptyPage({
  eyebrow,
  title,
  introduction,
  emptyTitle,
  emptyDescription,
  children,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  emptyTitle: string;
  emptyDescription: string;
  children?: ReactNode;
}) {
  return (
    <PublicShell>
      <header className="editorial-page-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{introduction}</p>
      </header>
      {children}
      <EmptyState title={emptyTitle} description={emptyDescription} />
    </PublicShell>
  );
}
