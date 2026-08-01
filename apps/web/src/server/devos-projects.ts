import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCurrentOwner } from "./current-owner.server";
import {
  readOperationalPortfolio,
  readProjectHub,
} from "./devos-projects.server";

async function requireDataOwner() {
  const owner = await resolveCurrentOwner();
  if (owner === null) throw redirect({ to: "/devos/login" });
  return owner;
}

export const getOperationalPortfolioFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireDataOwner();
  const portfolio = await readOperationalPortfolio();
  if (portfolio === null) throw redirect({ to: "/devos/login" });
  return portfolio;
});

export const getProjectHubFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    await requireDataOwner();
    return readProjectHub(data.slug);
  });
