import { PublicHeader } from "@semogtw/ui";
import type { ReactNode } from "react";

const items = [
  { href: "/projects", label: "Projetos" },
  { href: "/stack", label: "Habilidades" },
  { href: "/credentials", label: "Certificados" },
  { href: "/about", label: "Sobre" },
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
        <span>Projetos, habilidades e aprendizado demonstrados por trabalho real.</span>
      </footer>
    </div>
  );
}
