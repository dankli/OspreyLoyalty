# ADR-0021: Neo4j for the airline route graph

**Status:** accepted

## Context

The Route Explorer feature lets members explore the airline network: all direct destinations from an airport, shortest itineraries A→B (by distance, flight time, or number of hops), and a world map of the network. The dataset ([Jonty/airline-route-data](https://github.com/Jonty/airline-route-data), snapshot committed in `services/routes/data/`) holds 3,908 airports and 58,669 directed route edges.

The workload is variable-length graph traversal — `shortestPath`, reachability, path enumeration. That is precisely the query shape MongoDB answers badly: `$graphLookup` has no shortest-path semantics, no per-edge weights, and degrades into unbounded fan-out on a network where hub airports have out-degrees of ~250. The repo principle is "microservices only when they pay for themselves"; the same bar applies to data stores.

## Decision

A new `services/routes` service (Node 22 + TypeScript, the gateway's stack) owns the route graph in **Neo4j 5 Community**:

```
(:Airport {iata, icao, name, city, country, countryCode, continent,
           latitude: Float, longitude: Float, timezone})
  -[:ROUTE {km: Int, min: Int, carrierIatas: [String], carrierNames: [String]}]->
(:Airport)
```

- **Carriers are relationship array properties, not nodes.** Every v1 query traverses `Airport-ROUTE-Airport` and only *displays* carriers; nothing filters or traverses by carrier. Carrier nodes would add 59k×N relationships for zero query benefit. Neo4j relationship properties cannot hold arrays of maps, so carriers are two parallel primitive arrays, zipped back together in the API layer. If a feature ever needs "all routes flown by SK", promote carriers to `(:Carrier)` nodes then.
- **Indexes:** a unique constraint on `Airport.iata` and a full-text index `airport_search` on `[iata, name, city]` for typeahead — both standard Neo4j, no plugins.
- **Weighted shortest path via APOC dijkstra.** Hop-shortest uses the built-in `shortestPath((a)-[:ROUTE*..6]->(b))` (6 hops: no sane itinerary exceeds it, and the bound caps traversal). Km/min-shortest uses `apoc.algo.dijkstra` over directed `ROUTE>` edges with the weight property parameterized.
  *History:* the first implementation avoided the plugin with a window heuristic — find the hop-shortest length `L`, enumerate `L..L+1` paths, keep the minimum `reduce`-sum. Its tripwire (a timing test asserting hub-to-hub search under the 2 s bound) fired on real data: thin pairs 4–5 hops apart (e.g. AAA→AAD) route through the hub belt, and enumerating every 4..5-hop path explodes combinatorially. The documented escape hatch was taken: apoc **core** ships inside the `neo4j:5` image (`labs/`), so `NEO4J_PLUGINS: '["apoc"]'` enables it without any network download, preserving works-offline-after-clone. Dijkstra also removes the heuristic's blind spot (a cheaper path ≥2 hops longer than hop-optimal). Weighted results carry no hop cap; in practice a km/min-optimal itinerary never approaches 6 hops.
  A transaction timeout while *proving absence* of a path (the whole 6-hop neighbourhood must be exhausted) is reported as "no route found" within a 1.2 s budget, so the answer beats the gateway's 2 s abort — the bound is the product promise.
- **/ready implies warm.** The first execution of each traversal query shape costs 1–4 s (plan compilation + pipeline JIT); later executions with any parameters run in tens to hundreds of ms. The service executes each search query shape once at startup, before the readiness probe flips — the warmup cost belongs to deploy time, not to the first caller.
- **Dataset packaging:** the 22.8 MB source JSON is committed gzipped (1.3 MB — lockfile territory) so the repo keeps its works-offline-after-clone property. A download script would break that; the raw file would bloat every clone permanently.
- **Idempotent seeding at service startup** (the members `SeedDemoData` pattern, scaled up): a `(:SeedMeta {id, version})` marker node short-circuits re-seeding; constraints use `IF NOT EXISTS`; airports and edges load in bounded `UNWIND`+`MERGE` batches (500 / 1,000 per explicit write transaction, 30 s transaction timeout). `MERGE` makes a crash-mid-seed re-run safe. The service's `/ready` endpoint reports 200 only after seeding completes, so orchestrators hold traffic until the graph exists.

## Alternatives considered

**MongoDB (the incumbent).** No shortest-path primitive; `$graphLookup` cannot weight edges and explodes on hub fan-out. Emulating Dijkstra in application code over Mongo reads means unbounded round-trips — exactly the query shape ADR-0002/0003's "bounded everything" discipline exists to prevent.

**In-memory graph in the service.** 3,908 nodes / 59k edges fits comfortably in RAM, and Dijkstra is a page of code. Honest at this scale — but it reimplements a solved problem (standards over invention), loses the declarative query surface, and forfeits the demonstration value of a graph store in a repo whose purpose is showcasing fit-for-purpose polyglot persistence. The trade-off is recorded here deliberately: at pure production-minimum scope, in-memory would be defensible.

**PostgreSQL + recursive CTEs.** Workable, but weighted shortest path in recursive SQL is the kind of custom cleverness the repo avoids, and it would add a third relational-ish store solely for this feature.

## Consequences

- One more container (Neo4j Community, memory-bounded to 512 MB heap / 256 MB page cache) and a `routes` service image in compose, k8s, and CI.
- Neo4j runs authless in the demo (`NEO4J_AUTH: none`) — parity with the authless Mongo; production would front it with credentials from a secret store. It is never exposed through the ingress.
- The apoc core plugin becomes part of the Neo4j container contract (compose, k8s, Testcontainers all enable it); a Neo4j upgrade must keep apoc.algo.dijkstra available.
- Carriers-as-arrays means carrier-centric queries require a model migration (re-seed from the marker version bump — cheap, the dataset is static).
