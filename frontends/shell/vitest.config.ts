// Kept separate from vite.config.ts on purpose: the tests inject fake remote loaders,
// so the federation plugin (which rewrites remote imports at build time) is not needed here.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
