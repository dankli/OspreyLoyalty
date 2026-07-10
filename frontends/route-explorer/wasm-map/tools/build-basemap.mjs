#!/usr/bin/env node
// Builds the map island's embedded basemap from Natural Earth (public domain,
// naturalearthdata.com) into two compact little-endian binaries under src/:
//
//   land.bin    ← ne_110m_land: coastline polygons
//                 u32 polygonCount; per polygon: u32 ringCount;
//                 per ring: u32 pointCount, then pointCount × (f32 lon, f32 lat)
//   places.bin  ← ne_50m_populated_places_simple: city labels, sorted by
//                 scalerank ascending (most important first) so the island's
//                 greedy label decluttering can just walk the list
//                 u32 count; per place: f32 lon, f32 lat, u8 scalerank,
//                 u8 nameLen, nameLen bytes of UTF-8 name
//
// Regenerate with:  node tools/build-basemap.mjs
// Source GeoJSON is fetched into tools/ on first run (gitignored); the .bin
// output is committed since the crate include_bytes!:es it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

async function load(name) {
  const file = join(here, name);
  if (!existsSync(file)) {
    console.log(`fetching ${name}…`);
    const res = await fetch(`${NE}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

// ── land ────────────────────────────────────────────────────────────────────
const land = await load("ne_110m_land.geojson");
const polygons = [];
for (const feature of land.features) {
  const geom = feature.geometry;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) polygons.push(rings);
}
let landSize = 4;
for (const rings of polygons) {
  landSize += 4;
  for (const ring of rings) landSize += 4 + ring.length * 8;
}
const landBuf = Buffer.alloc(landSize);
let o = landBuf.writeUInt32LE(polygons.length, 0);
for (const rings of polygons) {
  o = landBuf.writeUInt32LE(rings.length, o);
  for (const ring of rings) {
    o = landBuf.writeUInt32LE(ring.length, o);
    for (const [lon, lat] of ring) {
      o = landBuf.writeFloatLE(lon, o);
      o = landBuf.writeFloatLE(lat, o);
    }
  }
}
writeFileSync(join(here, "../src/land.bin"), landBuf);

// ── places ──────────────────────────────────────────────────────────────────
const placesJson = await load("ne_50m_populated_places_simple.geojson");
const places = placesJson.features
  .map((f) => ({
    name: f.properties.name,
    rank: f.properties.scalerank,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }))
  .filter((p) => p.name && Buffer.byteLength(p.name, "utf8") <= 255 && p.rank >= 0 && p.rank <= 255)
  .sort((a, b) => a.rank - b.rank);

let placesSize = 4;
const nameBufs = places.map((p) => Buffer.from(p.name, "utf8"));
for (const nameBuf of nameBufs) placesSize += 4 + 4 + 1 + 1 + nameBuf.length;
const placesBuf = Buffer.alloc(placesSize);
o = placesBuf.writeUInt32LE(places.length, 0);
places.forEach((p, i) => {
  o = placesBuf.writeFloatLE(p.lon, o);
  o = placesBuf.writeFloatLE(p.lat, o);
  o = placesBuf.writeUInt8(p.rank, o);
  o = placesBuf.writeUInt8(nameBufs[i].length, o);
  o += nameBufs[i].copy(placesBuf, o);
});
writeFileSync(join(here, "../src/places.bin"), placesBuf);

const pts = polygons.flat().reduce((n, r) => n + r.length, 0);
console.log(`land.bin: ${polygons.length} polygons, ${pts} points, ${landBuf.length} bytes`);
console.log(`places.bin: ${places.length} places, ${placesBuf.length} bytes`);
