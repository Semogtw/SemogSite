import { DevOSBottomNav, DevOSSidebar } from "@semogtw/ui";
import type { ReactNode } from "react";

export function DevOSShell({
  activePath,
  children,
}: {
  activePath: string;
  children: ReactNode;
}) {
  return (
    <div className="devos-layout">
      <a className="skip-link" href="#devos-content">Pular para o conteúdo</a>
      <DevOSSidebar activePath={activePath} />
      <main id="devos-content" className="devos-main">
        {children}
      </main>
      <DevOSBottomNav activePath={activePath} />
    </div>
  );
}
