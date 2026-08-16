import { redirect } from "@tanstack/react-router";
import { getPrivateOwner } from "../lib/private-auth-client";

/**
 * Compatibility guard for the DevOS route tree.
 *
 * The `/devos` parent is client-only (`ssr: false`), so this helper performs a
 * same-origin browser session read against the canonical private API. It has no
 * Node/database dependency despite retaining the legacy import path while route
 * files are migrated incrementally.
 */
export async function requireOwner(locationHref: string) {
  const owner = await getPrivateOwner();
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
