import { Menu } from "lucide-react";
import type { ReactNode } from "react";

export type PublicNavItem = { href: string; label: string };

export function PublicHeader({
  items,
  brand = "Semogtw",
  trailing,
}: {
  items: readonly PublicNavItem[];
  brand?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="sem-public-header">
      <a className="sem-wordmark" href="/" aria-label="Semogtw — início">{brand}</a>
      <nav aria-label="Navegação pública">
        <ul className="sem-public-nav">
          {items.map((item) => (
            <li key={item.href}><a href={item.href}>{item.label}</a></li>
          ))}
        </ul>
      </nav>
      {trailing}
      <button className="sem-menu-button" type="button" aria-label="Abrir menu" aria-expanded="false">
        <Menu aria-hidden="true" size={20} />
      </button>
    </header>
  );
}
