import {
  createD1Database,
  type D1DatabaseBinding,
} from "@semogtw/database/d1";
import { D1PublicProjectSource } from "@semogtw/database/d1-public-projects";
import { createApiApp } from "../app";

export type D1ApiBindings = {
  readonly DB: D1DatabaseBinding;
};

/**
 * Composes the runtime-neutral Hono API over a Cloudflare D1 binding.
 * Private routes intentionally remain closed until the session store is
 * ported in a separate, auditable change.
 */
export function createD1ApiApp(bindings: D1ApiBindings) {
  const database = createD1Database(bindings.DB);
  const publicProjects = new D1PublicProjectSource(database);

  return createApiApp({
    publicProjects: {
      list: () => publicProjects.listListed(),
      findBySlug: (slug) => publicProjects.findPublishableBySlug(slug),
    },
  });
}
