import type { IncomingMessage, ServerResponse } from "node:http";
import pino from "pino";
import { CORRELATION_HEADER, resolveCorrelationId } from "./correlation.js";
import { httpRequestDuration, metricsRegistry } from "./metrics.js";
import type { Airport, Destination, MapAirport } from "./features/airports/mapRecords.js";
import type { RoutePath } from "./features/route-search/cypher.js";
import type { Optimize } from "./features/route-search/searchRoute.js";
import type { Authorizer } from "./auth.js";

const logger = pino();

// The data-access seam: the pure middle of each feature is tested directly; the app is
// tested against fakes of this surface; only the integration tests bind it to Neo4j.
export type AppDeps = {
  searchAirports(q: string, limit: number): Promise<Airport[]>;
  getAirport(iata: string): Promise<Airport | null>;
  getDestinations(iata: string): Promise<Destination[]>;
  allAirports(): Promise<MapAirport[]>;
  searchRoute(from: string, to: string, optimize: Optimize): Promise<RoutePath | null>;
  isReady(): boolean;
  authorize: Authorizer;
};

const OPTIMIZE_VALUES: readonly Optimize[] = ["km", "min", "hops"];

/** Validation failures throw this at the edge; the catch below maps it to a clean status. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 25; // typeahead never needs more

/** Low-cardinality route label: known paths as-is, iata segments stripped, anything else lumped. */
export function routeLabel(url: string | undefined): string {
  const pathname = (url ?? "").split("?")[0] ?? "";
  if (pathname === "/health" || pathname === "/ready" || pathname === "/metrics") return pathname;
  if (pathname === "/airports" || pathname === "/airports/all") return pathname;
  if (/^\/airports\/[^/]+\/destinations$/.test(pathname)) return "/airports/:iata/destinations";
  if (/^\/airports\/[^/]+$/.test(pathname)) return "/airports/:iata";
  if (pathname === "/routes/search") return pathname;
  return "other";
}

export function createApp(deps: AppDeps): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const rawHeader = req.headers[CORRELATION_HEADER];
    const incoming = new Headers();
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (headerValue) incoming.set(CORRELATION_HEADER, headerValue);
    const correlationId = resolveCorrelationId(incoming);
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

    void dispatch(deps, req, res).catch((error: unknown) => {
      // The single exception edge: validation and not-found throw HttpError on the way
      // up; anything else is a 500. Either way the happy path above stays exception-free.
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "internal error";
      if (status >= 500) logger.error({ err: error, url: req.url, correlationId }, "request failed");
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    });
  };
}

async function dispatch(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const pathname = requestUrl.pathname;

  if (pathname === "/health") return json(res, 200, { status: "ok" });
  if (pathname === "/ready") {
    return deps.isReady()
      ? json(res, 200, { status: "ready" })
      : json(res, 503, { status: "seeding" });
  }
  if (pathname === "/metrics") {
    res.writeHead(200, { "content-type": metricsRegistry.contentType });
    res.end(await metricsRegistry.metrics());
    return;
  }

  if (req.method !== "GET") throw new HttpError(405, "method not allowed");

  const authorization =
    typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
  if (!(await deps.authorize(authorization))) throw new HttpError(401, "unauthorized");

  if (pathname === "/airports") {
    const q = requestUrl.searchParams.get("q");
    if (!q) throw new HttpError(400, "query parameter q is required");
    const rawLimit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), SEARCH_LIMIT_MAX)
      : SEARCH_LIMIT_DEFAULT;
    return json(res, 200, await deps.searchAirports(q, limit));
  }

  if (pathname === "/airports/all") return json(res, 200, await deps.allAirports());

  if (pathname === "/routes/search") {
    const from = requestUrl.searchParams.get("from")?.toUpperCase();
    const to = requestUrl.searchParams.get("to")?.toUpperCase();
    if (!from || !to) throw new HttpError(400, "query parameters from and to are required");
    if (from === to) throw new HttpError(400, "from and to must differ");
    const optimize = (requestUrl.searchParams.get("optimize") ?? "km") as Optimize;
    if (!OPTIMIZE_VALUES.includes(optimize)) {
      throw new HttpError(400, "optimize must be one of km, min, hops");
    }
    const path = await deps.searchRoute(from, to, optimize);
    if (!path) throw new HttpError(404, "no route found");
    return json(res, 200, path);
  }

  const destinationsMatch = pathname.match(/^\/airports\/([^/]+)\/destinations$/);
  if (destinationsMatch) {
    const iata = decodeURIComponent(destinationsMatch[1]!).toUpperCase();
    return json(res, 200, await deps.getDestinations(iata));
  }

  const airportMatch = pathname.match(/^\/airports\/([^/]+)$/);
  if (airportMatch) {
    const iata = decodeURIComponent(airportMatch[1]!).toUpperCase();
    const airport = await deps.getAirport(iata);
    if (!airport) throw new HttpError(404, "airport not found");
    return json(res, 200, airport);
  }

  throw new HttpError(404, "not found");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
