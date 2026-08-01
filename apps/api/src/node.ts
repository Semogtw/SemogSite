import { serve } from "@hono/node-server";
import { createSqliteApiRuntime } from "./composition/sqlite";
import { parseApiPort } from "./node-config";

const port = parseApiPort(process.env.SEMOGTW_API_PORT);
const runtime = createSqliteApiRuntime(process.env);
const server = serve({
  fetch: runtime.app.fetch,
  port,
});

console.log(`Semogtw API listening on http://localhost:${port}`);

let stopping = false;
function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (stopping) return;
  stopping = true;
  server.close((error) => {
    runtime.close();
    if (error) {
      console.error(`Semogtw API shutdown failed after ${signal}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Semogtw API stopped after ${signal}.`);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
