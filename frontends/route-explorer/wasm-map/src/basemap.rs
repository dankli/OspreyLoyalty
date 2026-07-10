//! The embedded basemap: Natural Earth land polygons and populated places
//! (public domain, naturalearthdata.com), packed by `tools/build-basemap.mjs`
//! into the compact binaries decoded here. Pure byte-reading — no wasm, no
//! canvas — so `cargo test` covers it natively. The data is compile-time
//! embedded and trusted; malformed bytes are a build defect, so decoding
//! indexes straight into the slices and panics rather than degrades.

static LAND: &[u8] = include_bytes!("land.bin");
static PLACES: &[u8] = include_bytes!("places.bin");

pub struct Place {
    pub lat: f32,
    pub lon: f32,
    pub rank: u8,
    pub name: String,
}

fn read_u32(bytes: &[u8], at: &mut usize) -> u32 {
    let value = u32::from_le_bytes(bytes[*at..*at + 4].try_into().unwrap());
    *at += 4;
    value
}

fn read_f32(bytes: &[u8], at: &mut usize) -> f32 {
    let value = f32::from_le_bytes(bytes[*at..*at + 4].try_into().unwrap());
    *at += 4;
    value
}

/// Land as polygon → rings → (lat, lon); the first ring is the outer boundary,
/// any further rings are holes (drawn with the even-odd fill rule).
pub fn land_polygons() -> Vec<Vec<Vec<(f32, f32)>>> {
    let mut at = 0;
    let polygon_count = read_u32(LAND, &mut at) as usize;
    let mut polygons = Vec::with_capacity(polygon_count);
    for _ in 0..polygon_count {
        let ring_count = read_u32(LAND, &mut at) as usize;
        let mut rings = Vec::with_capacity(ring_count);
        for _ in 0..ring_count {
            let point_count = read_u32(LAND, &mut at) as usize;
            let mut ring = Vec::with_capacity(point_count);
            for _ in 0..point_count {
                let lon = read_f32(LAND, &mut at);
                let lat = read_f32(LAND, &mut at);
                ring.push((lat, lon));
            }
            rings.push(ring);
        }
        polygons.push(rings);
    }
    polygons
}

/// City labels, sorted most-important-first (ascending Natural Earth scalerank),
/// so greedy label decluttering can simply walk the list.
pub fn places() -> Vec<Place> {
    let mut at = 0;
    let count = read_u32(PLACES, &mut at) as usize;
    let mut places = Vec::with_capacity(count);
    for _ in 0..count {
        let lon = read_f32(PLACES, &mut at);
        let lat = read_f32(PLACES, &mut at);
        let rank = PLACES[at];
        let name_len = PLACES[at + 1] as usize;
        at += 2;
        let name = std::str::from_utf8(&PLACES[at..at + name_len])
            .expect("embedded place names are valid UTF-8")
            .to_owned();
        at += name_len;
        places.push(Place { lat, lon, rank, name });
    }
    places
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn land_decodes_and_covers_the_globe() {
        let polygons = land_polygons();
        assert!(polygons.len() > 100, "expected the 110m polygon set");
        let points: usize = polygons.iter().flatten().map(Vec::len).sum();
        assert!(points > 4_000);
        for &(lat, lon) in polygons.iter().flatten().flatten() {
            assert!((-90.0..=90.0).contains(&lat), "lat {lat} out of range");
            assert!((-180.0..=180.0001).contains(&lon), "lon {lon} out of range");
        }
    }

    #[test]
    fn places_decode_sorted_by_rank_with_readable_names() {
        let places = places();
        assert!(places.len() > 1_000, "expected the 50m places set");
        assert!(places.windows(2).all(|w| w[0].rank <= w[1].rank));
        assert!(places.iter().all(|p| !p.name.is_empty()));
        assert!(places.iter().any(|p| p.name == "Stockholm"));
        assert!(places.iter().any(|p| p.name == "Tokyo"));
    }
}
