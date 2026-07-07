import "./style.css";
import { createShell, type MountFn } from "./shell";

type MountModule = { mount: MountFn };

// @originjs federation wraps an exposed module that has no default export as
// `{ default: module, __esModule: true }` on the host side, so the mount named
// export lands one level down. Accept both shapes (the raw one also covers tests
// and any future plugin that stops wrapping).
function normalize(imported: unknown): MountModule {
  const mod = imported as Partial<MountModule> & { default?: Partial<MountModule> };
  if (typeof mod.mount === "function") return mod as MountModule;
  if (typeof mod.default?.mount === "function") return mod.default as MountModule;
  throw new Error("Remote module does not expose the mount(el) contract (ADR-0004)");
}

// The federation plugin rewrites these dynamic imports to runtime lookups
// against the remotes configured in vite.config.ts.
createShell(document.getElementById("app")!, {
  memberPortal: () => import("memberPortal/mount").then(normalize),
  adminPortal: () => import("adminPortal/mount").then(normalize),
});
