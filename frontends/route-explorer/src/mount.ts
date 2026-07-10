import { mount as mountComponent, unmount } from "svelte";
import App from "./App.svelte";

/** Micro-frontend contract (ADR-0004): render into a host element, return the teardown. */
export function mount(el: HTMLElement): () => void {
  const app = mountComponent(App, { target: el });
  return () => void unmount(app);
}
