import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Driver } from "neo4j-driver";
import type pino from "pino";
import { chunk, parseDataset, type ParsedDataset } from "./parseDataset.js";
import { readQuery, runSchema, writeQuery } from "../../neo4j.js";

/** Bump when replacing data/airline_routes.json.gz — the marker node keys off this. */
export const DATASET_VERSION = "2026-07-jonty";

const AIRPORT_BATCH = 500; // ~8 batches for the full dataset
const EDGE_BATCH = 1000; // ~59 batches
const WRITE_TIMEOUT_MS = 30_000; // bounded: a cold Neo4j's first writes are slow, not infinite

export function loadDataset(): ParsedDataset {
  const gz = readFileSync(fileURLToPath(new URL("../../../data/airline_routes.json.gz", import.meta.url)));
  return parseDataset(gunzipSync(gz).toString("utf8"));
}

/**
 * Idempotent, marker-gated seeding (the members SeedDemoData pattern, scaled up).
 * MERGE everywhere makes a crash-mid-seed re-run safe; the SeedMeta marker written
 * last makes a completed seed a no-op on the next boot.
 */
export async function seedRoutes(
  driver: Driver,
  dataset: ParsedDataset,
  log: pino.Logger,
): Promise<{ skipped: boolean }> {
  // Startup path, not request path: a cold store's first transaction can exceed the
  // 2 s request-read bound, so the marker check gets the seed write timeout instead.
  const marker = await readQuery(
    driver,
    `MATCH (m:SeedMeta {id: 'airline-routes'}) RETURN m.version AS version`,
    {},
    WRITE_TIMEOUT_MS,
  );
  if (marker[0]?.version === DATASET_VERSION) {
    // Older seeds predate the degree property — backfill idempotently (single
    // bounded write, a no-op when nothing is null) so queries can rely on it.
    await writeQuery(
      driver,
      `MATCH (a:Airport) WHERE a.degree IS NULL SET a.degree = COUNT { (a)-[:ROUTE]->() }`,
      {},
      WRITE_TIMEOUT_MS,
    );
    log.info({ version: DATASET_VERSION }, "route graph already seeded");
    return { skipped: true };
  }

  await runSchema(driver, `CREATE CONSTRAINT airport_iata IF NOT EXISTS FOR (a:Airport) REQUIRE a.iata IS UNIQUE`);
  await runSchema(driver, `CREATE FULLTEXT INDEX airport_search IF NOT EXISTS FOR (a:Airport) ON EACH [a.iata, a.name, a.city]`);

  for (const batch of chunk(dataset.airports, AIRPORT_BATCH)) {
    await writeQuery(
      driver,
      `UNWIND $batch AS row
       MERGE (a:Airport {iata: row.iata})
       SET a += row`,
      { batch },
      WRITE_TIMEOUT_MS,
    );
  }

  for (const batch of chunk(dataset.edges, EDGE_BATCH)) {
    await writeQuery(
      driver,
      `UNWIND $batch AS r
       MATCH (a:Airport {iata: r.from}), (b:Airport {iata: r.to})
       MERGE (a)-[e:ROUTE]->(b)
       SET e.km = r.km, e.min = r.min,
           e.carrierIatas = r.carrierIatas, e.carrierNames = r.carrierNames`,
      { batch },
      WRITE_TIMEOUT_MS,
    );
  }

  // Persist each airport's out-degree: the map payload and the search ordering read
  // it, so no request-path query ever re-counts 59k edges.
  await writeQuery(
    driver,
    `MATCH (a:Airport) SET a.degree = COUNT { (a)-[:ROUTE]->() }`,
    {},
    WRITE_TIMEOUT_MS,
  );

  // The full-text index populates asynchronously; block readiness until it is queryable
  // so the first typeahead after boot doesn't silently return nothing.
  await runSchema(driver, `CALL db.awaitIndexes(300)`);

  await writeQuery(
    driver,
    `MERGE (m:SeedMeta {id: 'airline-routes'})
     SET m.version = $version, m.airports = $airports, m.edges = $edges,
         m.skippedAirports = $skippedAirports, m.skippedEdges = $skippedEdges,
         m.seededAtUtc = datetime()`,
    {
      version: DATASET_VERSION,
      airports: dataset.airports.length,
      edges: dataset.edges.length,
      skippedAirports: dataset.skippedAirports,
      skippedEdges: dataset.skippedEdges,
    },
    WRITE_TIMEOUT_MS,
  );

  log.info(
    {
      version: DATASET_VERSION,
      airports: dataset.airports.length,
      edges: dataset.edges.length,
      skippedAirports: dataset.skippedAirports,
      skippedEdges: dataset.skippedEdges,
    },
    "route graph seeded",
  );
  return { skipped: false };
}

