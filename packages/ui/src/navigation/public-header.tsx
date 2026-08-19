import { Menu, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export type PublicNavItem = { href: string; label: string };

export function PublicHeader({
  items,
  brand = "Semogtw",
  trailing,
  activeHref,
}: {
  items: readonly PublicNavItem[];
  brand?: string;
  trailing?: ReactNode;
  activeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const MenuIcon = open ? X : Menu;

  return (
    <header className="sem-public-header">
      <a className="sem-wordmark" href="/" aria-label="Semogtw — início">
        {brand}
      </a>
      <nav
        id={navigationId}
        aria-label="Navegação pública"
        data-open={String(open)}
      >
        <ul className="sem-public-nav">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={activeHref === item.href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {trailing}
      <button
        className="sem-menu-button"
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon aria-hidden="true" size={20} />
      </button>
    </header>
  );
}
