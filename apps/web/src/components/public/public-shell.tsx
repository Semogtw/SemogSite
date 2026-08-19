import { PublicHeader } from "@semogtw/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

const items = [
  { href: "/projects", label: "Projetos" },
  { href: "/stack", label: "Habilidades" },
  { href: "/credentials", label: "Certificados" },
  { href: "/about", label: "Sobre" },
  { href: "/contact", label: "Contato" },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeHref = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )?.href;

  return (
    <div className="public-shell">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <PublicHeader items={items} activeHref={activeHref} />
      <main id="conteudo" className="public-main">{children}</main>
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
