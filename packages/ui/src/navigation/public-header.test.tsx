import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicHeader } from "./public-header";

const items = [
  { href: "/projects", label: "Projetos" },
  { href: "/notes", label: "Notas" },
] as const;

describe("PublicHeader", () => {
  it("opens and closes the mobile navigation with accessible state", () => {
    render(<PublicHeader items={items} />);

    const button = screen.getByRole("button", { name: "Abrir menu" });
    const navigation = screen.getByRole("navigation", {
      name: "Navegação pública",
    });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveAttribute("data-open", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("Fechar menu");
    expect(navigation).toHaveAttribute("data-open", "true");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveAttribute("data-open", "false");
  });

  it("marks the active public destination semantically", () => {
    render(<PublicHeader items={items} activeHref="/projects" />);

    expect(screen.getByRole("link", { name: "Projetos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Notas" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
