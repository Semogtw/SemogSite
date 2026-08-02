import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const database = resolve(repositoryRoot, "data/semogtw-e2e.sqlite");

await Promise.all(
  [database, `${database}-shm`, `${database}-wal`].map((path) =>
    rm(path, { force: true }),
  ),
);
