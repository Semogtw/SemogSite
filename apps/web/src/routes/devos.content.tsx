import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireOwner } from "../server/require-owner";

export const Route = createFileRoute("/devos/content")({
  beforeLoad: async ({ location }) => ({
    owner: await requireOwner(location.href),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }],
  }),
  component: EditorialContentLayout,
});

function EditorialContentLayout() {
  return <Outlet />;
}
