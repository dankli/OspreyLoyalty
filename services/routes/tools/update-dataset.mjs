#!/usr/bin/env node
// Refreshes data/airline_routes.json.gz from the upstream Jonty snapshot and prints
// a diff against the committed one, so a dataset bump is a reviewed decision:
//
//   node tools/update-dataset.mjs            # fetch upstream, diff, write the new .gz
//   node tools/update-dataset.mjs local.json # use a downloaded file instead
//
// After running: review the diff, bump DATASET_VERSION in src/features/seed/seedRoutes.ts
// (the SeedMeta marker keys off it — without the bump no pod re-seeds), and update the
// stats in data/README.md.
import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM =
  "https://raw.githubusercontent.com/Jonty/airline-route-data/main/airline_routes.json";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "../data/airline_routes.json.gz");

function stats(raw) {
  const airports = Object.keys(raw);
  let edges = 0;
  for (const airport of Object.values(raw)) edges += airport.routes?.length ?? 0;
  return { airports: new Set(airports), edges };
}

const localFile = process.argv[2];
let nextJson;
if (localFile) {
  nextJson = readFileSync(localFile, "utf8");
} else {
  console.log(`fetching ${UPSTREAM}…`);
  const response = await fetch(UPSTREAM);
  if (!response.ok) throw new Error(`upstream responded ${response.status}`);
  nextJson = await response.text();
}
const next = JSON.parse(nextJson);
const nextStats = stats(next);

if (existsSync(target)) {
  const current = JSON.parse(gunzipSync(readFileSync(target)).toString("utf8"));
  const currentStats = stats(current);
  const added = [...nextStats.airports].filter((iata) => !currentStats.airports.has(iata));
  const removed = [...currentStats.airports].filter((iata) => !nextStats.airports.has(iata));
  console.log(`airports: ${currentStats.airports.size} -> ${nextStats.airports.size}`);
  console.log(`edges:    ${currentStats.edges} -> ${nextStats.edges}`);
  console.log(`added:    ${added.length}${added.length ? ` (${added.slice(0, 20).join(", ")}${added.length > 20 ? ", …" : ""})` : ""}`);
  console.log(`removed:  ${removed.length}${removed.length ? ` (${removed.slice(0, 20).join(", ")}${removed.length > 20 ? ", …" : ""})` : ""}`);
} else {
  console.log(`no current snapshot at ${target}`);
  console.log(`airports: ${nextStats.airports.size}, edges: ${nextStats.edges}`);
}

writeFileSync(target, gzipSync(nextJson, { level: 9 }));
console.log(`\nwrote ${target}`);
console.log("next steps: review the diff, bump DATASET_VERSION in src/features/seed/seedRoutes.ts,");
console.log("and update the snapshot date + stats in data/README.md.");
