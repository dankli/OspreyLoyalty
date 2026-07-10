import { Registry, Histogram, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration by method, route and status.",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry],
});
