import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/devos")({
  ssr: false,
  component: DevOSBoundary,
});

function DevOSBoundary() {
  return <Outlet />;
}
