import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { readRoadmap } from "./devos-roadmap.server";

export const getRoadmapFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const owner = await resolveCurrentOwner();
    if (owner === null) throw redirect({ to: "/devos/login" });

    const roadmap = await readRoadmap();
    if (roadmap === null) throw redirect({ to: "/devos/login" });
    return roadmap;
  },
);
