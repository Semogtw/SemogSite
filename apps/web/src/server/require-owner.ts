import { redirect } from "@tanstack/react-router";
import { getCurrentOwnerFn } from "./auth";

export async function requireOwner(locationHref: string) {
  const owner = await getCurrentOwnerFn();
  if (owner === null) {
    throw redirect({
      to: "/devos/login",
      search: {
        returnTo: locationHref.startsWith("/devos") ? locationHref : "/devos",
      },
    });
  }
  return owner;
}
