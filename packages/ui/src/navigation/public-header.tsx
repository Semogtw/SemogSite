import { Menu, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

export type PublicNavItem = { href: string; label: string };

export function PublicHeader({
  items,
  brand = "Semogtw",
  trailing,
  activeHref,
  onNavigate,
}: {
  items: readonly PublicNavItem[];
  brand?: string;
  trailing?: ReactNode;
  activeHref?: string | undefined;
  onNavigate?: ((href: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const navigationRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const MenuIcon = open ? X : Menu;

  useEffect(() => {
    if (!open) return;

    navigationRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    setOpen(false);

    if (
      !onNavigate ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onNavigate(href);
  }

  return (
    <header className="sem-public-header">
      <a
        className="sem-wordmark"
        href="/"
        aria-label="Semogtw — início"
        onClick={(event) => handleNavigation(event, "/")}
      >
        {brand}
      </a>
      <nav
        ref={navigationRef}
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
                onClick={(event) => handleNavigation(event, item.href)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {trailing}
      <button
        ref={menuButtonRef}
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
