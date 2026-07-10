# Airline route dataset

`airline_routes.json.gz` is a gzipped snapshot of
[Jonty/airline-route-data](https://github.com/Jonty/airline-route-data)
(`airline_routes.json`), an open dataset of worldwide airline routes compiled
from Wikipedia and OurAirports data.

- **Snapshot date:** 2026-07-10
- **Size:** 22.8 MB raw → 1.3 MB gzipped (committed compressed so a clone works offline; see [ADR-0021](../../../docs/decisions/0021-neo4j-route-graph.md))
- **Shape:** one top-level object keyed by IATA code; each airport carries
  metadata (name, city, country, coordinates, timezone) and a `routes` array of
  `{iata, km, min, carriers: [{iata, name}]}` edges
- **Contents:** 3,908 airports, 58,669 directed route edges (524 of them with
  no listed carrier)

The routes service seeds Neo4j from this file at startup, gated by a
`(:SeedMeta)` marker node keyed to the dataset version constant — bump that
constant when replacing this snapshot.
