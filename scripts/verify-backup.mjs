import { resolve } from "node:path";
import {
  readMigrationState,
  verifyBackupFile,
} from "./lib/sqlite-backup.mjs";

const [backupArgument, sourceArgument] = process.argv.slice(2);

if (!backupArgument) {
  console.error(
    "Uso: node scripts/verify-backup.mjs <backup.sqlite> [banco-origem.sqlite]",
  );
  process.exitCode = 2;
} else {
  const backup = resolve(backupArgument);

  try {
    const expectedMigrations = sourceArgument
      ? readMigrationState(resolve(sourceArgument))
      : undefined;
    const result = verifyBackupFile(backup, expectedMigrations);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "BACKUP_UNKNOWN_FAILURE",
    );
    process.exitCode = 1;
  }
}
