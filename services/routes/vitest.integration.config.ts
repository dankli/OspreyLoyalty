import { defineConfig } from "vitest/config";

// Integration tests spin up a throwaway Neo4j via Testcontainers — they need Docker
// and generous timeouts (container pull + seed), so they run behind their own script.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.integration.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000, // container pull + full-dataset seed on a cold machine
    fileParallelism: false, // one Neo4j container at a time — parallel ones starve each other
  },
});
