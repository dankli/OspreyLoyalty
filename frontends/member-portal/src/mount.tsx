import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./i18n";
import "./index.css";

/** Micro-frontend contract (ADR-0004): render into a host element, return the teardown. */
export function mount(el: HTMLElement): () => void {
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
  return () => root.unmount();
}
