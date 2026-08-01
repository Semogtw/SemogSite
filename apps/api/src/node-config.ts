export function parseApiPort(value: string | undefined): number {
  const port = Number(value ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("INVALID_API_PORT");
  }
  return port;
}
