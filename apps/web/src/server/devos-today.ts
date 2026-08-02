import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { readTodayQueue } from "./devos-today.server";

export const getTodayQueueFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const owner = await resolveCurrentOwner();
    if (owner === null) throw redirect({ to: "/devos/login" });

    const queue = await readTodayQueue();
    if (queue === null) throw redirect({ to: "/devos/login" });
    return queue;
  },
);
