import { defineConfig } from "vitest/config";

// Unit tests only — the pure middle plus handler-level tests with fake query layers.
// Integration tests (Testcontainers + a real Neo4j) run via vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**"],
  },
});
