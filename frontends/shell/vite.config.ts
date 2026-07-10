import { defineConfig } from "vite";
import federation from "@originjs/vite-plugin-federation";

// NOTE on remote URLs (ADR-0004): @originjs federation resolves remote URLs at BUILD time,
// not at runtime. The URLs below are fetched by the *browser*, and docker-compose publishes
// member-portal on localhost:5173 and admin-portal on localhost:5174, so baked localhost
// defaults are acceptable for the demo. For any other topology, override at build time with
// MEMBER_PORTAL_URL / ADMIN_PORTAL_URL (full URLs to remoteEntry.js).
export default defineConfig({
  plugins: [
    federation({
      name: "shell",
      remotes: {
        memberPortal:
          process.env.MEMBER_PORTAL_URL ?? "http://localhost:5173/assets/remoteEntry.js",
        adminPortal:
          process.env.ADMIN_PORTAL_URL ?? "http://localhost:5174/assets/remoteEntry.js",
        routeExplorer:
          process.env.ROUTE_EXPLORER_URL ?? "http://localhost:5175/assets/remoteEntry.js",
      },
      // No `shared` here on purpose: the shell is framework-less, so each remote falls back
      // to the copy of React/Vue it bundled itself. ADR-0004 accepts the missing dedup.
    }),
  ],
  build: {
    target: "esnext",
  },
});
