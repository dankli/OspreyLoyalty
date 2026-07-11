// Lint-only shim. This package builds with TypeScript 7 (native compiler),
// whose npm entry point is a version stub without the classic compiler API
// that @typescript-eslint/typescript-estree needs. The "lint" script loads
// this file via `node -r` so that, inside the ESLint process only,
// require("typescript") resolves to the "typescript5" alias
// (npm:typescript@5.9.x). The build/runtime toolchain (tsc 7) is untouched.
"use strict";
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "typescript") {
    request = "typescript5";
  } else if (request.startsWith("typescript/")) {
    request = "typescript5/" + request.slice("typescript/".length);
  }
  return originalResolveFilename.call(this, request, ...args);
};
