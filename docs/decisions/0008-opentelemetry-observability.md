# ADR-0008: OpenTelemetry tracing with Jaeger, Loki and Grafana

**Status:** accepted

## Context

Through phase 5 observability was metrics (Prometheus + a RED Grafana dashboard) plus structured JSON logs carrying a correlation id. That answers "how many requests, how fast, how many errors" but not "show me this one request as it crossed four services" or "give me every log line for that trace". Phase 6 adds distributed tracing and log aggregation across the four languages (C#, Java, TypeScript, Rust) and the browser, and a place to view all three signals together.

## Decision

**OpenTelemetry for traces, exported OTLP to a collector, forwarded to Jaeger.** members, partners and the gateway auto-instrument via their OTel SDKs; each request becomes a span, and `trace_id`/`span_id` are injected into every log line so a log and its span line up. The user explicitly wanted a dedicated trace UI (Jaeger), so the collector fans traces out to Jaeger; Grafana also gets a Jaeger datasource, giving both a standalone trace explorer and a single Grafana pane.

**Metrics stay on Prometheus scraping native endpoints.** members (prometheus-net), partners (actuator), gateway (prom-client) already expose `/metrics`; this phase added a `/metrics` endpoint to **points-engine**, the one backend that lacked one, so the whole fleet is on the RED dashboard.

**Logs to Loki via Promtail, not per-service OTLP log export.** Promtail reads every compose container's stdout through the Docker daemon and ships it to Loki. This is language-agnostic — all four services already log structured JSON — so it needs no per-service SDK log wiring, and it also captures the browser telemetry the gateway re-emits as server logs (see below). Grafana gets a Loki datasource with a derived field linking a log's `trace_id` back to its Jaeger trace.

**Browser telemetry via a gateway `/client-logs` endpoint.** Frontends POST structured events to the gateway, which emits them as server logs (with the correlation id) that Promtail then ships to Loki. This keeps the collector internal (no browser-facing OTLP/CORS surface) and reuses the existing log pipeline.

## Alternatives considered

**Grafana Tempo instead of Jaeger.** Tempo integrates natively with Grafana, but the user asked specifically for a dedicated trace service; Jaeger delivers that and Grafana still queries it via its Jaeger datasource, so no capability is lost.

**Per-service OTLP log export.** The "pure OTel" path, but log-export maturity varies across the four SDKs (especially Rust), and it would mean four separate wirings. Promtail + Docker service discovery is one robust, uniform mechanism.

**Skip the collector, export straight to Jaeger.** Fewer containers, but the collector is the standard single OTLP sink and decouples services from the trace backend — worth one container for the enterprise pattern.

## Consequences

- Four new containers: `otel-collector`, `jaeger`, `loki`, `promtail`. Grafana gains Jaeger + Loki datasources alongside Prometheus.
- Promtail mounts the Docker socket read-only — acceptable for a local demo, a privilege to revisit for a real cluster.
- points-engine's **OTLP tracing** is deferred (Rust OTel version-coupling is fragile); it has metrics and structured logs today, and sits outside the earn path (ADR-0006), so its traces are the least critical.
- Trace-id log field names differ slightly across stacks (`TraceId` vs `trace_id`); cross-signal linking is best-effort in the demo and would be normalised for production.
