import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { databaseMigrationAssetsPlugin } from "./src/build/database-migration-assets";

const publicBuild = process.env.SEMOGTW_PUBLIC_BUILD === "1";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/health": "http://127.0.0.1:3001",
      "/ready": "http://127.0.0.1:3001",
    },
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
  ssr: {
    external: ["better-sqlite3"],
  },
  plugins: [
    tanstackStart({
      router: publicBuild
        ? {
            // Production portfolio builds intentionally exclude the private
            // DevOS route tree. This keeps Node/SQLite-only private server
            // functions out of the Cloudflare public SSR bundle.
            routeFileIgnorePattern: "^devos(?:\\.|$)",
          }
        : undefined,
    }),
    react(),
    databaseMigrationAssetsPlugin(),
  ],
});
