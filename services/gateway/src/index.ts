import "./otel.js"; // must be first — starts tracing before anything else loads
import { createServer } from "node:http";
import pino from "pino";
import { z } from "zod";
import { buildYoga } from "./server.js";
import { env } from "./env.js";
import { fetchMember } from "./features/member/membersClient.js";
import { handleTravelAgentStream } from "./features/travel-agent/stream.js";
import { CORRELATION_HEADER, resolveCorrelationId } from "./correlation.js";
import { httpRequestDuration, metricsRegistry } from "./metrics.js";

const logger = pino();
const yoga = buildYoga();

// Shape guard for the browser telemetry sink (/client-logs): untrusted JSON from the frontends,
// so parse (don't cast) — a malformed or hostile body is dropped, not logged as an unchecked value.
const ClientLogSchema = z.object({
  level: z.string().optional(),
  message: z.string().optional(),
  context: z.unknown().optional(),
  app: z.string().optional(),
});

/** Low-cardinality route label: known paths as-is, the proxy with the id stripped, anything else lumped. */
function routeLabel(url: string | undefined): string {
  const pathname = (url ?? "").split("?")[0] ?? "";
  if (pathname === "/graphql" || pathname === "/health" || pathname === "/metrics") return pathname;
  if (pathname === "/travel-agent/stream") return pathname;
  if (/^\/api\/member\/[^/]+$/.test(pathname)) return "/api/member/:id";
  return "other";
}

const server = createServer((req, res) => {
  const rawHeader = req.headers[CORRELATION_HEADER];
  const incoming = new Headers();
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (headerValue) incoming.set(CORRELATION_HEADER, headerValue);
  const correlationId = resolveCorrelationId(incoming);
  // Inject so yoga's context (and every resolver) sees the id even when we generated it.
  req.headers[CORRELATION_HEADER] = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    httpRequestDuration.observe(
      { method: req.method ?? "UNKNOWN", route: routeLabel(req.url), status: String(res.statusCode) },
      durationMs / 1000,
    );
    logger.info(
      { method: req.method, url: req.url, status: res.statusCode, durationMs, correlationId },
      "request",
    );
  });

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/metrics") {
    void (async () => {
      res.writeHead(200, { "content-type": metricsRegistry.contentType });
      res.end(await metricsRegistry.metrics());
    })();
    return;
  }

  // Browser telemetry sink: frontends POST structured events here; we emit them as
  // server logs (carrying the correlation id) so Promtail ships them to Loki. Bounded
  // to 4 KB so a chatty or hostile client can't flood the pipe.
  if (req.url === "/client-logs") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-correlation-id");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method === "POST") {
      let body = "";
      let tooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) {
          tooLarge = true;
          req.destroy();
        }
      });
      req.on("end", () => {
        if (tooLarge) {
          res.writeHead(413).end();
          return;
        }
        try {
          const entry = ClientLogSchema.parse(JSON.parse(body));
          logger.info(
            { source: "frontend", app: entry.app, clientLevel: entry.level, clientMessage: entry.message, context: entry.context, correlationId },
            "client-log",
          );
        } catch {
          // ignore malformed client payloads (bad JSON or unexpected shape) — telemetry must never break the request
        }
        res.writeHead(204).end();
      });
      return;
    }
    res.writeHead(405).end();
    return;
  }

  if (req.url?.startsWith("/travel-agent/stream")) {
    // Mirror the /client-logs CORS handling: browsers preflight a GET that carries Authorization.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization, x-correlation-id");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "GET") {
      // GET-only SSE endpoint — reject other verbs like the /client-logs handler rejects non-POST.
      res.writeHead(405).end();
      return;
    }
    void handleTravelAgentStream(req, res, { fetchMember, membersUrl: env.MEMBERS_URL });
    return;
  }

  const memberMatch = req.url?.match(/^\/api\/member\/([^/]+)$/);
  if (memberMatch) {
    void (async () => {
      try {
        const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
        const member = await fetchMember(env.MEMBERS_URL, decodeURIComponent(memberMatch[1]!), correlationId, authorization);
        res.writeHead(member ? 200 : 404, { "content-type": "application/json" });
        res.end(JSON.stringify(member ?? { error: "not found" }));
      } catch {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "members service unavailable" }));
      }
    })();
    return;
  }

  yoga(req, res);
});

server.listen(env.PORT, () => logger.info({ port: env.PORT }, "gateway listening"));
