import type { Driver } from "neo4j-driver";
import { isTransactionTimeout, readQuery } from "../../neo4j.js";
import type { Airport } from "../airports/mapRecords.js";
import {
  DIJKSTRA_QUERY,
  HOP_SHORTEST_QUERY,
  assemblePath,
  type LegProps,
  type RoutePath,
  type Weight,
} from "./cypher.js";

export type Optimize = Weight | "hops";

type PathRow = { airports: Airport[]; legs: LegProps[] };

// Tighter than the 2 s request bound: proving ABSENCE of a path exhausts the whole
// 6-hop neighbourhood, and the answer ("no route") must still reach the gateway before
// its own 2 s abort fires. Within the bound, a search that cannot prove reachability is
// reported as not found — the bound is the product promise, not an accident.
const HOP_TIMEOUT_MS = 1200;

export async function searchRoute(
  driver: Driver,
  from: string,
  to: string,
  optimize: Optimize,
): Promise<RoutePath | null> {
  let rows;
  try {
    rows =
      optimize === "hops"
        ? await readQuery(driver, HOP_SHORTEST_QUERY, { from, to }, HOP_TIMEOUT_MS)
        : await readQuery(driver, DIJKSTRA_QUERY, { from, to, weight: optimize }, HOP_TIMEOUT_MS);
  } catch (error) {
    if (isTransactionTimeout(error)) return null; // absence proof exceeded its budget → not found
    throw error;
  }
  const best = rows[0] as PathRow | undefined;
  if (!best) return null; // unreachable — a value, not an error
  return assemblePath(best.airports, best.legs);
}
