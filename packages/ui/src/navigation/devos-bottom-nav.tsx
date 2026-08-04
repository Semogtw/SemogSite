import {
  CalendarCheck2,
  Ellipsis,
  FolderKanban,
  GraduationCap,
  Workflow,
} from "lucide-react";

const items = [
  { href: "/devos/today", label: "Hoje", icon: CalendarCheck2 },
  { href: "/devos/projects", label: "Projetos", icon: FolderKanban },
  { href: "/devos/growth", label: "Growth", icon: GraduationCap },
  { href: "/devos/operations", label: "Operação", icon: Workflow },
  { href: "/devos/more", label: "Mais", icon: Ellipsis },
] as const;

export function DevOSBottomNav({ activePath }: { activePath: string }) {
  return (
    <nav className="sem-devos-bottom-nav" aria-label="Navegação móvel do DevOS">
      {items.map(({ href, label, icon: Icon }) => (
        <a key={href} href={href} aria-current={activePath === href ? "page" : undefined}>
          <Icon aria-hidden="true" size={19} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
