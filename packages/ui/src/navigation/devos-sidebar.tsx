import {
  Activity,
  CalendarCheck2,
  FolderKanban,
  Gauge,
  ListChecks,
  ScrollText,
  Settings,
  Workflow,
} from "lucide-react";

const items = [
  { href: "/devos", label: "Início", icon: Gauge },
  { href: "/devos/today", label: "Hoje", icon: CalendarCheck2 },
  { href: "/devos/projects", label: "Projetos", icon: FolderKanban },
  { href: "/devos/roadmap", label: "Roadmap", icon: ListChecks },
  { href: "/devos/operations", label: "Operação", icon: Workflow },
  { href: "/devos/runs", label: "Execuções", icon: Activity },
  { href: "/devos/audit", label: "Auditoria", icon: ScrollText },
  { href: "/devos/settings", label: "Configurações", icon: Settings },
] as const;

export function DevOSSidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="sem-devos-sidebar" aria-label="Semogtw DevOS">
      <a className="sem-wordmark" href="/devos">Semogtw DevOS</a>
      <nav aria-label="Navegação do DevOS">
        <ul>
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <a href={href} aria-current={activePath === href ? "page" : undefined}>
                <Icon aria-hidden="true" size={18} />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
