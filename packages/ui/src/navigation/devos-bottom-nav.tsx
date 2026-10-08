import { FileText, Globe, House, ScrollText, Settings } from "lucide-react";

const items = [
  { href: "/devos", label: "Início", icon: House },
  { href: "/devos/content", label: "Conteúdo", icon: FileText },
  { href: "/devos/audit", label: "Auditoria", icon: ScrollText },
  { href: "/devos/settings", label: "Ajustes", icon: Settings },
  { href: "/", label: "Site", icon: Globe },
] as const;

export function DevOSBottomNav({ activePath }: { activePath: string }) {
  return (
    <nav className="sem-devos-bottom-nav" aria-label="Navegação móvel administrativa">
      {items.map(({ href, label, icon: Icon }) => (
        <a key={href} href={href} aria-current={activePath === href ? "page" : undefined}>
          <Icon aria-hidden="true" size={19} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
