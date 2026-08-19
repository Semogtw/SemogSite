import { PublicHeader } from "@semogtw/ui";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

const items = [
  { href: "/projects", label: "Projetos" },
  { href: "/stack", label: "Habilidades" },
  { href: "/credentials", label: "Certificados" },
  { href: "/about", label: "Sobre" },
  { href: "/contact", label: "Contato" },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeHref = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )?.href;

  function navigatePublic(href: string) {
    switch (href) {
      case "/":
        void navigate({ to: "/" });
        return;
      case "/projects":
        void navigate({ to: "/projects" });
        return;
      case "/stack":
        void navigate({ to: "/stack" });
        return;
      case "/credentials":
        void navigate({ to: "/credentials" });
        return;
      case "/about":
        void navigate({ to: "/about" });
        return;
      case "/contact":
        void navigate({ to: "/contact" });
        return;
      default:
        window.location.assign(href);
    }
  }

  return (
    <div className="public-shell">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <PublicHeader
        items={items}
        activeHref={activeHref}
        onNavigate={navigatePublic}
      />
      <main id="conteudo" className="public-main" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <div className="public-footer__identity">
          <strong>Semogtw</strong>
          <span>Projetos, habilidades e aprendizado demonstrados por trabalho real.</span>
        </div>
        <nav className="public-footer__nav" aria-label="Navegação complementar">
          <Link to="/journey">Trajetória</Link>
        </nav>
      </footer>
    </div>
  );
}
