import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/devos")({
  component: DevOSBoundary,
});

function DevOSBoundary() {
  return <Outlet />;
}
