import { FileText, Globe, House, ScrollText, Settings } from "lucide-react";

const items = [
  { href: "/devos", label: "Início", icon: House },
  { href: "/devos/content", label: "Conteúdo", icon: FileText },
  { href: "/devos/audit", label: "Auditoria", icon: ScrollText },
  { href: "/devos/settings", label: "Configurações", icon: Settings },
  { href: "/", label: "Ver site", icon: Globe },
] as const;

export function DevOSSidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="sem-devos-sidebar" aria-label="Administração Semogtw">
      <a className="sem-wordmark" href="/devos">Semogtw Admin</a>
      <nav aria-label="Navegação administrativa">
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
