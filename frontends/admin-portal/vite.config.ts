import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
// The plugin ships CJS-flavoured type declarations but Vite loads its ESM build, where the
// default export IS the plugin function. Under `module: nodenext` tsc types the default import
// as the CJS exports object, so reconcile type and runtime with a cast.
import federationImport from "@originjs/vite-plugin-federation";
const federation = federationImport as unknown as typeof federationImport.default;

// Vite 8's Rolldown/oxc minifier emits template-literal strings, which the federation plugin's
// generateBundle replacement (regex over '/" quotes, AST fallback over string Literals) cannot
// match. That leaves a raw `__v__css__<module id>` marker in remoteEntry.js, and the remote's
// dynamicLoadingCss then crashes calling .forEach on a string. Finish the plugin's own job here:
// swap the marker for the emitted CSS asset list, exactly what the plugin substitutes itself
// when the quotes match (single-CSS-bundle apps, which both portals are).
function federationCssMarkerFix() {
  return {
    name: "federation-css-marker-fix",
    enforce: "post" as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string }>) {
      const cssFiles = Object.keys(bundle)
        .filter((file) => file.endsWith(".css"))
        .map((file) => file.split("/").pop());
      const replacement = JSON.stringify(cssFiles);
      for (const chunk of Object.values(bundle) as Array<{ type: string; code?: string }>) {
        if (chunk.type === "chunk" && chunk.code?.includes("__v__css__")) {
          chunk.code = chunk.code.replace(/([`'"])__v__css__.*?\1/g, replacement);
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // ADR-0004: expose the mount contract for the shell. Additive — standalone dev/build keep working.
    federation({
      name: "adminPortal",
      filename: "remoteEntry.js",
      exposes: {
        "./mount": "./src/mount.ts",
      },
      shared: ["vue"],
    }),
    federationCssMarkerFix(),
  ],
  build: {
    target: "esnext",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
