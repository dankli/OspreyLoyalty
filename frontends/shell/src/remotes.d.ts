// Type declarations for the federated remotes (ADR-0004 mount contract).
// The real modules are resolved at runtime from the remotes' remoteEntry.js.

declare module "memberPortal/mount" {
  export function mount(el: HTMLElement): () => void;
}

declare module "adminPortal/mount" {
  export function mount(el: HTMLElement): () => void;
}
