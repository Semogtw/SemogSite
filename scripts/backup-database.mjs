import { resolve } from "node:path";
import { createBackupFile } from "./lib/sqlite-backup.mjs";

const [sourceArgument, destinationArgument] = process.argv.slice(2);

if (!sourceArgument || !destinationArgument) {
  console.error(
    "Uso: node scripts/backup-database.mjs <banco-origem.sqlite> <backup-destino.sqlite>",
  );
  process.exitCode = 2;
} else {
  const source = resolve(sourceArgument);
  const destination = resolve(destinationArgument);

  try {
    const result = await createBackupFile(source, destination);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "BACKUP_UNKNOWN_FAILURE",
    );
    process.exitCode = 1;
  }
}
