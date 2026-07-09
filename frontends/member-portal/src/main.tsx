import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { installGlobalErrorLogging } from "./logger";
import { ensureAuthenticated } from "./auth";
import "./i18n";
import "./index.css";

installGlobalErrorLogging();

const queryClient = new QueryClient();

// Standalone: gate the app on a valid session (no-op when auth is disabled). In the shell the
// remote is mounted via mount.tsx after the shell has already established the shared session.
void ensureAuthenticated().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
