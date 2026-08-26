import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicHeader } from "./public-header";

const items = [
  { href: "/projects", label: "Projetos" },
  { href: "/notes", label: "Notas" },
] as const;

afterEach(() => cleanup());

describe("PublicHeader", () => {
  it("opens the mobile navigation and moves focus into the first destination", () => {
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
    expect(screen.getByRole("link", { name: "Projetos" })).toHaveFocus();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveAttribute("data-open", "false");
  });

  it("closes with Escape and returns focus to the menu button", () => {
    render(<PublicHeader items={items} />);

    const button = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Fechar menu");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(button).toHaveAccessibleName("Abrir menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes when a pointer interaction happens outside the header", () => {
    render(
      <div>
        <PublicHeader items={items} />
        <button type="button">Conteúdo externo</button>
      </div>,
    );

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Conteúdo externo" }));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveAccessibleName("Abrir menu");
  });

  it("closes an open mobile menu after switching to a desktop viewport", () => {
    render(<PublicHeader items={items} />);

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    fireEvent(window, new Event("resize"));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the active public route changes", () => {
    const { rerender } = render(
      <PublicHeader items={items} activeHref="/projects" />,
    );

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    rerender(<PublicHeader items={items} activeHref="/notes" />);

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("delegates ordinary internal clicks to client-side navigation", () => {
    const onNavigate = vi.fn();
    render(<PublicHeader items={items} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Projetos" }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/projects");
  });

  it("does not intercept modified clicks", () => {
    const onNavigate = vi.fn();
    render(<PublicHeader items={items} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Projetos" }), {
      ctrlKey: true,
    });

    expect(onNavigate).not.toHaveBeenCalled();
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
