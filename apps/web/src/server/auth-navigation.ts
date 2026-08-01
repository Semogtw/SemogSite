const safeReturnRoutes = new Set<SafeReturnRoute>([
  "/devos",
  "/devos/today",
  "/devos/projects",
  "/devos/roadmap",
  "/devos/operations",
  "/devos/settings",
]);

export type SafeReturnRoute =
  | "/devos"
  | "/devos/today"
  | "/devos/projects"
  | "/devos/roadmap"
  | "/devos/operations"
  | "/devos/settings";

export function safeReturnTo(value: string | undefined): SafeReturnRoute {
  return value !== undefined && safeReturnRoutes.has(value as SafeReturnRoute)
    ? (value as SafeReturnRoute)
    : "/devos";
}
