import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.js";

export default tseslint.config(
  // src/gql is graphql-codegen output and src/wasm/pkg is wasm-pack output —
  // never lint generated code; wasm-map is the Rust crate (cargo territory).
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      "src/gql",
      "src/wasm/pkg",
      "wasm-map",
      "eslint.typescript-shim.cjs",
    ],
  },
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    // svelte-eslint-parser handles the component; the TS parser handles <script lang="ts">.
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
