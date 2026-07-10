import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../../services/gateway/schema.graphql",
  // GraphQL documents live in .ts data modules (not .svelte files), so the pure data
  // layer stays testable without a component render.
  documents: ["src/**/*.ts"],
  generates: {
    "src/gql/": { preset: "client", config: { useTypeImports: true } },
  },
};

export default config;
