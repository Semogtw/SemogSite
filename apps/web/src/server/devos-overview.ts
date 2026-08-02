import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { readDevOSOverview } from "./devos-overview.server";

export const getDevOSOverviewFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const owner = await resolveCurrentOwner();
    if (owner === null) {
      throw redirect({ to: "/devos/login" });
    }

    const overview = await readDevOSOverview();
    if (overview === null) {
      throw redirect({ to: "/devos/login" });
    }
    return overview;
  },
);
