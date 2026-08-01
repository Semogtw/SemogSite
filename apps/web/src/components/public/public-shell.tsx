import { PublicHeader } from "@semogtw/ui";
import type { ReactNode } from "react";

const items = [
  { href: "/about", label: "Sobre" },
  { href: "/projects", label: "Projetos" },
  { href: "/journey", label: "Trajetória" },
  { href: "/lab", label: "Laboratório" },
  { href: "/notes", label: "Notas" },
  { href: "/stack", label: "Stack" },
  { href: "/contact", label: "Contato" },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <PublicHeader items={items} />
      <main id="conteudo" className="public-main">{children}</main>
      <footer className="public-footer">
        <span>Semogtw</span>
        <span>Construído com evidência, portabilidade e privacidade.</span>
      </footer>
    </div>
  );
}
