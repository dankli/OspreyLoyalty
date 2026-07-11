import { mount as mountComponent, unmount } from "svelte";
import App from "./App.svelte";

/** Micro-frontend contract (ADR-0004): render into a host element, return the teardown. */
export function mount(el: HTMLElement): () => void {
  let app = mountComponent(App, { target: el });

  // Strings resolve against the locale current at access time (strings.ts), so a remount
  // renders the whole app in the new language. The shell broadcasts the change (ADR-0023);
  // map view and search state survive via their own persistence, same as a tab reload.
  const onLocaleChanged = () => {
    void unmount(app);
    app = mountComponent(App, { target: el });
  };
  window.addEventListener("osprey:locale-changed", onLocaleChanged);

  return () => {
    window.removeEventListener("osprey:locale-changed", onLocaleChanged);
    void unmount(app);
  };
}
