import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../../services/gateway/schema.graphql",
  // GraphQL documents live in .ts data modules (not .svelte files), so the pure data
  // layer stays testable without a component render. The wasm-pack output and the
  // generated gql/ are excluded — their .d.ts files choke the document plucker.
  documents: ["src/**/*.ts", "!src/wasm/**", "!src/gql/**"],
  generates: {
    "src/gql/": { preset: "client", config: { useTypeImports: true } },
  },
};

export default config;
