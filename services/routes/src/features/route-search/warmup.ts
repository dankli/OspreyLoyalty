import type { Driver } from "neo4j-driver";
import type pino from "pino";
import { readQuery } from "../../neo4j.js";
import { ASTAR_KM_QUERY, DIJKSTRA_QUERY, HOP_SHORTEST_QUERY } from "./cypher.js";

const WARM_TIMEOUT_MS = 30_000; // startup path — generous, but still bounded
const WARM_PAIR = { from: "LHR", to: "SYD" }; // two hubs in the snapshot; a future dataset without them still compiles the plans

/**
 * Execute each search query shape once so /ready implies warm. Measured on the full
 * dataset: the FIRST execution of a traversal query costs 1–4 s (plan compilation +
 * pipeline JIT + page faults); every later execution — with any parameters — runs in
 * tens to hundreds of ms. The 2 s request bound only holds warm, so the warmup cost
 * belongs to readiness, not to the first unlucky caller after a deploy.
 */
export async function warmRouteGraph(driver: Driver, log: pino.Logger): Promise<void> {
  const startedAt = Date.now();
  await readQuery(driver, HOP_SHORTEST_QUERY, WARM_PAIR, WARM_TIMEOUT_MS);
  await readQuery(driver, ASTAR_KM_QUERY, WARM_PAIR, WARM_TIMEOUT_MS);
  await readQuery(driver, DIJKSTRA_QUERY, { ...WARM_PAIR, weight: "min" }, WARM_TIMEOUT_MS);
  log.info({ durationMs: Date.now() - startedAt }, "route graph warmed");
}
