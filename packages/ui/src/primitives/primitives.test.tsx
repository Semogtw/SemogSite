import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Status } from "./status";

describe("Status", () => {
  it("exposes status through text and icon semantics, not color alone", () => {
    render(<Status tone="warning">Atenção</Status>);

    expect(screen.getByText("Atenção")).toBeVisible();
    expect(screen.getByRole("img", { name: "Status de atenção" })).toBeVisible();
  });
});
