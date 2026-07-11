// Best-effort client telemetry, mirroring the member portal's logger: POST structured
// events to the gateway's /client-logs sink, which logs them server-side so Promtail
// ships them to Loki. Never throws — telemetry must never break the app.
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4000/graphql";
const CLIENT_LOGS_URL = GATEWAY_URL.replace(/\/graphql$/, "") + "/client-logs";

type Level = "info" | "warn" | "error";

export function logClient(level: Level, message: string, context?: unknown): void {
  if (import.meta.env.MODE === "test") return; // no network noise from vitest
  try {
    void fetch(CLIENT_LOGS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "route-explorer", level, message, context }),
      keepalive: true,
    }).catch(() => {
      /* swallow — telemetry is best-effort */
    });
  } catch {
    /* swallow */
  }
}
