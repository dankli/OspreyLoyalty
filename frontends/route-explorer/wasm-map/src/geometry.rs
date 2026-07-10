//! Pure map geometry — no wasm, no canvas, tested natively with `cargo test`.
//! The A-Frame middle of the island: projection, great-circle sampling, hit-testing.

/// Equirectangular projection onto a canvas of `width` × `height` device pixels.
/// Simple and honest for a world overview; the 2:1 aspect keeps it undistorted.
#[derive(Clone, Copy)]
pub struct Projection {
    pub width: f32,
    pub height: f32,
}

impl Projection {
    pub fn new(width: f32, height: f32) -> Self {
        Self { width, height }
    }

    pub fn project(&self, lat: f32, lon: f32) -> (f32, f32) {
        let x = (lon + 180.0) / 360.0 * self.width;
        let y = (90.0 - lat) / 180.0 * self.height;
        (x, y)
    }
}

/// Sample a great-circle arc between two coordinates via spherical linear
/// interpolation on the unit sphere. Returns `samples + 1` (lat, lon) points,
/// endpoints included.
pub fn great_circle_arc(
    lat1: f32,
    lon1: f32,
    lat2: f32,
    lon2: f32,
    samples: usize,
) -> Vec<(f32, f32)> {
    let a = to_unit(lat1, lon1);
    let b = to_unit(lat2, lon2);
    let dot = (a.0 * b.0 + a.1 * b.1 + a.2 * b.2).clamp(-1.0, 1.0);
    let omega = dot.acos();

    // f32 dot products of near-identical unit vectors land around 1e-4 rad after acos;
    // anything under ~1e-3 rad (≈6 km) is a degenerate arc that renders as a dot anyway.
    if omega.abs() < 1e-3 {
        return vec![(lat1, lon1), (lat2, lon2)];
    }

    let sin_omega = omega.sin();
    (0..=samples)
        .map(|i| {
            let t = i as f32 / samples as f32;
            let wa = ((1.0 - t) * omega).sin() / sin_omega;
            let wb = (t * omega).sin() / sin_omega;
            from_unit(
                wa * a.0 + wb * b.0,
                wa * a.1 + wb * b.1,
                wa * a.2 + wb * b.2,
            )
        })
        .collect()
}

fn to_unit(lat: f32, lon: f32) -> (f32, f32, f32) {
    let (lat_r, lon_r) = (lat.to_radians(), lon.to_radians());
    (
        lat_r.cos() * lon_r.cos(),
        lat_r.cos() * lon_r.sin(),
        lat_r.sin(),
    )
}

fn from_unit(x: f32, y: f32, z: f32) -> (f32, f32) {
    let hyp = (x * x + y * y).sqrt();
    (z.atan2(hyp).to_degrees(), y.atan2(x).to_degrees())
}

/// Index of the projected point nearest to (x, y) within `radius`, or None.
/// Linear scan: ~4k points is nothing, and it keeps the middle dependency-free.
pub fn pick(points: &[(f32, f32)], x: f32, y: f32, radius: f32) -> Option<usize> {
    let radius_sq = radius * radius;
    let mut best: Option<(usize, f32)> = None;
    for (i, (px, py)) in points.iter().enumerate() {
        let d = (px - x) * (px - x) + (py - y) * (py - y);
        if d <= radius_sq && best.map_or(true, |(_, bd)| d < bd) {
            best = Some((i, d));
        }
    }
    best.map(|(i, _)| i)
}

/// Split a projected polyline where it wraps the antimeridian, so the canvas
/// never draws a horizontal stroke across the whole map. A jump wider than half
/// the canvas width can only be a wrap, not a real segment.
pub fn split_on_wrap(points: &[(f32, f32)], width: f32) -> Vec<Vec<(f32, f32)>> {
    let mut segments: Vec<Vec<(f32, f32)>> = Vec::new();
    let mut current: Vec<(f32, f32)> = Vec::new();
    for &point in points {
        if let Some(&(prev_x, _)) = current.last() {
            if (point.0 - prev_x).abs() > width / 2.0 {
                segments.push(std::mem::take(&mut current));
            }
        }
        current.push(point);
    }
    if !current.is_empty() {
        segments.push(current);
    }
    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    const W: f32 = 960.0;
    const H: f32 = 480.0;

    #[test]
    fn projects_the_map_corners_and_centre() {
        let p = Projection::new(W, H);
        assert_eq!(p.project(90.0, -180.0), (0.0, 0.0)); // top-left
        assert_eq!(p.project(-90.0, 180.0), (W, H)); // bottom-right
        assert_eq!(p.project(0.0, 0.0), (W / 2.0, H / 2.0)); // null island
    }

    #[test]
    fn arc_endpoints_match_the_inputs() {
        let arc = great_circle_arc(59.65, 17.93, -33.95, 151.18, 64);
        assert_eq!(arc.len(), 65);
        let (lat0, lon0) = arc[0];
        let (lat_n, lon_n) = arc[64];
        assert!((lat0 - 59.65).abs() < 1e-3 && (lon0 - 17.93).abs() < 1e-3);
        assert!((lat_n + 33.95).abs() < 1e-3 && (lon_n - 151.18).abs() < 1e-3);
    }

    #[test]
    fn arc_midpoint_along_the_equator_is_halfway() {
        let arc = great_circle_arc(0.0, 0.0, 0.0, 90.0, 2);
        let (lat_mid, lon_mid) = arc[1];
        assert!(lat_mid.abs() < 1e-3);
        assert!((lon_mid - 45.0).abs() < 1e-3);
    }

    #[test]
    fn identical_endpoints_do_not_divide_by_zero() {
        let arc = great_circle_arc(10.0, 10.0, 10.0, 10.0, 16);
        assert_eq!(arc.len(), 2);
    }

    #[test]
    fn pick_finds_the_nearest_point_within_the_radius_only() {
        let points = vec![(100.0, 100.0), (105.0, 100.0), (300.0, 300.0)];
        assert_eq!(pick(&points, 101.0, 101.0, 6.0), Some(0));
        assert_eq!(pick(&points, 104.0, 100.0, 6.0), Some(1));
        assert_eq!(pick(&points, 200.0, 200.0, 6.0), None);
    }

    #[test]
    fn polylines_split_where_they_wrap_the_antimeridian() {
        // Fiji-ish to Hawaii-ish: x jumps from near the right edge to near the left.
        let line = vec![(940.0, 200.0), (955.0, 195.0), (5.0, 190.0), (20.0, 185.0)];
        let segments = split_on_wrap(&line, W);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].len(), 2);
        assert_eq!(segments[1].len(), 2);
    }
}
