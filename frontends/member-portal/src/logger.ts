// Best-effort client telemetry: POST structured events to the gateway, which logs them
// server-side (with the correlation id) so Promtail ships them to Loki. Never throws —
// telemetry must never break the app.
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4000/graphql";
const CLIENT_LOGS_URL = GATEWAY_URL.replace(/\/graphql$/, "") + "/client-logs";

type Level = "info" | "warn" | "error";

export function logClient(level: Level, message: string, context?: unknown): void {
  try {
    void fetch(CLIENT_LOGS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "member-portal", level, message, context }),
      keepalive: true,
    }).catch(() => {
      /* swallow — telemetry is best-effort */
    });
  } catch {
    /* swallow */
  }
}

/** Report uncaught errors and rejections so client-side failures show up in Loki. */
export function installGlobalErrorLogging(): void {
  window.addEventListener("error", (event) =>
    logClient("error", event.message, { filename: event.filename, lineno: event.lineno }),
  );
  window.addEventListener("unhandledrejection", (event) =>
    logClient("error", "unhandledrejection", { reason: String(event.reason) }),
  );
}
