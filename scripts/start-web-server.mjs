import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const clientRoot = resolve(repositoryRoot, "apps/web/dist/client");
const serverEntry = resolve(repositoryRoot, "apps/web/dist/server/server.js");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "4173");
const e2eApiProxyOrigin = parseE2eApiProxyOrigin(
  process.env.SEMOGTW_E2E_API_PROXY_ORIGIN,
  process.env.NODE_ENV,
);

if (!existsSync(serverEntry)) {
  throw new Error(
    `WEB_SERVER_BUNDLE_MISSING: ${serverEntry}. Execute o build antes de iniciar.`,
  );
}

const module = await import(pathToFileURL(serverEntry).href);
const application = module.default;
if (application === null || typeof application?.fetch !== "function") {
  throw new Error("WEB_FETCH_HANDLER_MISSING");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function parseE2eApiProxyOrigin(value, nodeEnv) {
  if (value === undefined || value.trim().length === 0) return null;
  if (nodeEnv !== "test") {
    throw new Error("E2E_API_PROXY_REQUIRES_TEST_ENV");
  }

  const url = new URL(value);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("E2E_API_PROXY_ORIGIN_INVALID");
  }
  return url;
}

function resolveStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidate = resolve(clientRoot, `.${decoded}`);
  if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${sep}`)) {
    return null;
  }
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function copyResponseHeaders(response, outgoing) {
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") outgoing.setHeader(name, value);
  }

  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
}

function proxyApiRequest(request, response, url) {
  return new Promise((resolveProxy, rejectProxy) => {
    const upstream = httpRequest(
      {
        protocol: e2eApiProxyOrigin.protocol,
        hostname: e2eApiProxyOrigin.hostname,
        port: e2eApiProxyOrigin.port,
        method: request.method,
        path: `${url.pathname}${url.search}`,
        headers: {
          ...request.headers,
          host: request.headers.host ?? `${host}:${port}`,
        },
      },
      (upstreamResponse) => {
        response.statusCode = upstreamResponse.statusCode ?? 502;
        response.statusMessage = upstreamResponse.statusMessage ?? "";
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (value !== undefined) response.setHeader(name, value);
        }
        upstreamResponse.on("error", rejectProxy);
        upstreamResponse.on("end", resolveProxy);
        upstreamResponse.pipe(response);
      },
    );

    upstream.on("error", rejectProxy);
    request.on("error", rejectProxy);
    request.pipe(upstream);
  });
}

async function handle(request, response) {
  const origin = `http://${request.headers.host ?? `${host}:${port}`}`;
  const url = new URL(request.url ?? "/", origin);

  if (e2eApiProxyOrigin !== null && url.pathname.startsWith("/api/")) {
    await proxyApiRequest(request, response, url);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const staticFile = resolveStaticFile(url.pathname);
    if (staticFile !== null) {
      response.statusCode = 200;
      response.setHeader(
        "content-type",
        contentTypes.get(extname(staticFile).toLowerCase()) ??
          "application/octet-stream",
      );
      response.setHeader(
        "cache-control",
        url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      );
      if (request.method === "HEAD") {
        response.end();
      } else {
        createReadStream(staticFile).pipe(response);
      }
      return;
    }
  }

  const method = request.method ?? "GET";
  const fetchRequest = new Request(url, {
    method,
    headers: request.headers,
    body:
      method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(request),
    ...(method === "GET" || method === "HEAD" ? {} : { duplex: "half" }),
  });

  const fetchResponse = await application.fetch(fetchRequest);
  response.statusCode = fetchResponse.status;
  response.statusMessage = fetchResponse.statusText;
  copyResponseHeaders(fetchResponse, response);

  if (method === "HEAD" || fetchResponse.body === null) {
    response.end();
    return;
  }

  Readable.fromWeb(fetchResponse.body).pipe(response);
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
    }
    response.end("Internal Server Error");
  });
});

server.listen(port, host, () => {
  console.log(`Semogtw web server listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  });
}
