export type SafeReturnRoute =
  | "/devos"
  | "/devos/today"
  | "/devos/projects"
  | "/devos/roadmap"
  | "/devos/operations"
  | "/devos/insights"
  | "/devos/capture"
  | "/devos/search"
  | "/devos/content"
  | "/devos/settings"
  | "/devos/more";

const safeReturnRoutes = new Set<SafeReturnRoute>([
  "/devos",
  "/devos/today",
  "/devos/projects",
  "/devos/roadmap",
  "/devos/operations",
  "/devos/insights",
  "/devos/capture",
  "/devos/search",
  "/devos/content",
  "/devos/settings",
  "/devos/more",
]);

export function safeReturnTo(value: string | undefined): SafeReturnRoute {
  return value !== undefined && safeReturnRoutes.has(value as SafeReturnRoute)
    ? (value as SafeReturnRoute)
    : "/devos";
}
