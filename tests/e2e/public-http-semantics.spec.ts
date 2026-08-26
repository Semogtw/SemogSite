import { expect, test } from "@playwright/test";

test("unknown public editorial detail routes return real HTTP 404 responses", async ({ page }) => {
  const projectResponse = await page.goto("/projects/nao-publicado-e2e");
  expect(projectResponse?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Nenhum case study público corresponde a “nao-publicado-e2e”.",
    }),
  ).toBeVisible();

  const noteResponse = await page.goto("/notes/nao-publicada-e2e");
  expect(noteResponse?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Nenhuma publicação pública corresponde a “nao-publicada-e2e”.",
    }),
  ).toBeVisible();
});
