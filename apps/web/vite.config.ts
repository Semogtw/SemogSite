import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { databaseMigrationAssetsPlugin } from "./src/build/database-migration-assets";

export default defineConfig({
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
  ssr: {
    external: ["better-sqlite3"],
  },
  plugins: [tanstackStart(), react(), databaseMigrationAssetsPlugin()],
});
