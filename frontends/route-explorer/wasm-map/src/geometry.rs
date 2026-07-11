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

/// Zoom bounds for the [`View`]: 1 shows the whole world; 40 puts single airports
/// and the densest label tier comfortably apart.
pub const MIN_ZOOM: f32 = 1.0;
pub const MAX_ZOOM: f32 = 40.0;

/// The zoom/pan window over base canvas space: `screen = base * zoom - offset`.
/// Offsets are clamped so the canvas always shows map, never void beyond the edges.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct View {
    pub zoom: f32,
    pub offset_x: f32,
    pub offset_y: f32,
}

impl View {
    pub fn identity() -> Self {
        Self {
            zoom: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }

    /// Screen (canvas) coordinates back to base map coordinates.
    pub fn to_base(&self, x: f32, y: f32) -> (f32, f32) {
        ((x + self.offset_x) / self.zoom, (y + self.offset_y) / self.zoom)
    }

    /// Zoom by `factor`, keeping the base point under screen `(x, y)` fixed.
    pub fn zoomed_at(&self, factor: f32, x: f32, y: f32, width: f32, height: f32) -> View {
        let zoom = (self.zoom * factor).clamp(MIN_ZOOM, MAX_ZOOM);
        let (bx, by) = self.to_base(x, y);
        View {
            zoom,
            offset_x: bx * zoom - x,
            offset_y: by * zoom - y,
        }
        .clamped(width, height)
    }

    /// Pan by a screen-space delta: the content follows the pointer.
    pub fn panned(&self, dx: f32, dy: f32, width: f32, height: f32) -> View {
        View {
            zoom: self.zoom,
            offset_x: self.offset_x - dx,
            offset_y: self.offset_y - dy,
        }
        .clamped(width, height)
    }

    /// Frame a set of base-space points with `padding` logical px around them,
    /// zooming in no further than `max_zoom`. None when there is nothing to frame.
    pub fn around(points: &[(f32, f32)], padding: f32, width: f32, height: f32, max_zoom: f32) -> Option<View> {
        let (mut min_x, mut min_y) = (f32::INFINITY, f32::INFINITY);
        let (mut max_x, mut max_y) = (f32::NEG_INFINITY, f32::NEG_INFINITY);
        for &(x, y) in points {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
        if !min_x.is_finite() {
            return None;
        }
        let box_w = (max_x - min_x).max(1.0) + padding * 2.0;
        let box_h = (max_y - min_y).max(1.0) + padding * 2.0;
        let zoom = (width / box_w).min(height / box_h).clamp(MIN_ZOOM, max_zoom);
        let (cx, cy) = ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0);
        Some(
            View {
                zoom,
                offset_x: cx * zoom - width / 2.0,
                offset_y: cy * zoom - height / 2.0,
            }
            .clamped(width, height),
        )
    }

    /// Rebuild a persisted view, clamping whatever the storage held back into bounds.
    pub fn restore(zoom: f32, offset_x: f32, offset_y: f32, width: f32, height: f32) -> View {
        View {
            zoom: if zoom.is_finite() { zoom.clamp(MIN_ZOOM, MAX_ZOOM) } else { 1.0 },
            offset_x: if offset_x.is_finite() { offset_x } else { 0.0 },
            offset_y: if offset_y.is_finite() { offset_y } else { 0.0 },
        }
        .clamped(width, height)
    }

    fn clamped(mut self, width: f32, height: f32) -> View {
        self.offset_x = self.offset_x.clamp(0.0, width * self.zoom - width);
        self.offset_y = self.offset_y.clamp(0.0, height * self.zoom - height);
        self
    }
}

/// Bucket an airport by out-degree so hubs read at a glance: 0 = field strip,
/// 3 = major hub. Thresholds sit on the dataset's natural breaks (busiest hub ≈250).
pub fn dot_class(degree: u32) -> u8 {
    match degree {
        d if d >= 100 => 3,
        d if d >= 40 => 2,
        d if d >= 10 => 1,
        _ => 0,
    }
}

/// The zoom below which a dot class stays hidden: the whole-world view shows the
/// network's shape (hubs and mid-size fields), not four thousand specks.
pub fn dot_visible_floor(class: u8) -> f32 {
    match class {
        0 => 2.5,
        1 => 1.6,
        _ => MIN_ZOOM,
    }
}

/// Great-circle arc between two (lat, lon) points, projected and split at the
/// antimeridian — the shared geometry behind both drawing and arc hit-testing.
pub fn arc_segments(
    projection: Projection,
    from: (f32, f32),
    to: (f32, f32),
    samples: usize,
) -> Vec<Vec<(f32, f32)>> {
    let projected: Vec<(f32, f32)> = great_circle_arc(from.0, from.1, to.0, to.1, samples)
        .into_iter()
        .map(|(lat, lon)| projection.project(lat, lon))
        .collect();
    split_on_wrap(&projected, projection.width)
}

fn point_segment_dist_sq(px: f32, py: f32, a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    let t = if len_sq <= f32::EPSILON {
        0.0
    } else {
        (((px - a.0) * dx + (py - a.1) * dy) / len_sq).clamp(0.0, 1.0)
    };
    let (cx, cy) = (a.0 + t * dx, a.1 + t * dy);
    (px - cx) * (px - cx) + (py - cy) * (py - cy)
}

/// True when (x, y) lies within `radius` of any segment of the polyline.
pub fn polyline_hit(points: &[(f32, f32)], x: f32, y: f32, radius: f32) -> bool {
    points
        .windows(2)
        .any(|pair| point_segment_dist_sq(x, y, pair[0], pair[1]) <= radius * radius)
}

/// The zoom at which an airport's IATA code starts labelling, per dot class:
/// major hubs name themselves on a regional view, field strips only close up.
pub fn airport_label_floor(class: u8) -> f32 {
    match class {
        3 => 4.0,
        2 => 8.0,
        1 => 14.0,
        _ => 22.0,
    }
}

/// Which Natural Earth scaleranks are labelled at a zoom level: the whole-world
/// view names only the biggest cities; each zoom step admits smaller ones.
pub fn rank_ceiling(zoom: f32) -> u8 {
    match zoom {
        z if z < 1.5 => 1,
        z if z < 2.5 => 2,
        z if z < 3.5 => 3,
        z if z < 5.0 => 4,
        z if z < 7.0 => 6,
        z if z < 9.0 => 7,
        _ => 10,
    }
}

/// Greedy label decluttering: walk candidates most-important-first and keep a
/// label only when its box `(x0, y0, x1, y1)` overlaps no already-kept box.
pub fn place_labels(boxes: &[(f32, f32, f32, f32)]) -> Vec<bool> {
    let mut kept: Vec<(f32, f32, f32, f32)> = Vec::new();
    boxes
        .iter()
        .map(|&(x0, y0, x1, y1)| {
            let free = kept
                .iter()
                .all(|&(kx0, ky0, kx1, ky1)| x1 < kx0 || kx1 < x0 || y1 < ky0 || ky1 < y0);
            if free {
                kept.push((x0, y0, x1, y1));
            }
            free
        })
        .collect()
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
    fn small_dots_hide_until_zoomed_in() {
        assert!(dot_visible_floor(0) > dot_visible_floor(1));
        assert_eq!(dot_visible_floor(2), MIN_ZOOM); // mid-size and hubs always show
        assert_eq!(dot_visible_floor(3), MIN_ZOOM);
    }

    #[test]
    fn around_frames_points_centred_and_clamped() {
        let view = View::around(&[(100.0, 100.0), (300.0, 200.0)], 50.0, W, H, 8.0).unwrap();
        // Both points end up on screen with the padding honoured.
        for &(x, y) in &[(100.0f32, 100.0f32), (300.0, 200.0)] {
            let sx = x * view.zoom - view.offset_x;
            let sy = y * view.zoom - view.offset_y;
            assert!((0.0..=W).contains(&sx), "x {sx} off screen");
            assert!((0.0..=H).contains(&sy), "y {sy} off screen");
        }
        assert!(view.zoom > 1.0 && view.zoom <= 8.0);
        assert!(View::around(&[], 50.0, W, H, 8.0).is_none());
    }

    #[test]
    fn restore_clamps_garbage_from_storage() {
        let view = View::restore(9999.0, -5000.0, f32::NAN, W, H);
        assert_eq!(view.zoom, MAX_ZOOM);
        assert_eq!(view.offset_x, 0.0);
        assert_eq!(view.offset_y, 0.0);
    }

    #[test]
    fn polylines_hit_near_segments_only() {
        let line = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)];
        assert!(polyline_hit(&line, 50.0, 3.0, 5.0)); // near the first segment
        assert!(polyline_hit(&line, 97.0, 50.0, 5.0)); // near the second
        assert!(!polyline_hit(&line, 50.0, 50.0, 5.0)); // inside the corner, far from both
    }

    #[test]
    fn airport_labels_admit_hubs_first_and_everything_within_max_zoom() {
        assert!(airport_label_floor(3) < airport_label_floor(2));
        assert!(airport_label_floor(2) < airport_label_floor(1));
        assert!(airport_label_floor(1) < airport_label_floor(0));
        assert!(airport_label_floor(0) < MAX_ZOOM);
    }

    #[test]
    fn hub_dots_bucket_by_out_degree() {
        assert_eq!(dot_class(0), 0);
        assert_eq!(dot_class(9), 0);
        assert_eq!(dot_class(10), 1);
        assert_eq!(dot_class(40), 2);
        assert_eq!(dot_class(100), 3);
        assert_eq!(dot_class(250), 3);
    }

    #[test]
    fn label_visibility_grows_with_zoom() {
        assert!(rank_ceiling(1.0) < rank_ceiling(3.0));
        assert!(rank_ceiling(3.0) < rank_ceiling(16.0));
        assert_eq!(rank_ceiling(16.0), 10); // everything labels when zoomed all the way in
    }

    #[test]
    fn overlapping_labels_yield_to_more_important_ones() {
        let boxes = [
            (0.0, 0.0, 40.0, 10.0),   // most important — always kept
            (30.0, 5.0, 70.0, 15.0),  // overlaps the first — dropped
            (50.0, 30.0, 90.0, 40.0), // clear of both — kept
        ];
        assert_eq!(place_labels(&boxes), vec![true, false, true]);
    }

    #[test]
    fn the_identity_view_maps_screen_to_base_unchanged() {
        let view = View::identity();
        assert_eq!(view.to_base(123.0, 45.0), (123.0, 45.0));
    }

    #[test]
    fn zooming_at_a_point_keeps_it_fixed_on_screen() {
        let view = View::identity().zoomed_at(2.0, 240.0, 120.0, W, H);
        let (bx, by) = view.to_base(240.0, 120.0);
        // The base point under the cursor before the zoom is still under it after.
        assert!((bx - 240.0).abs() < 1e-2);
        assert!((by - 120.0).abs() < 1e-2);
    }

    #[test]
    fn zoom_clamps_to_min_and_max() {
        let out = View::identity().zoomed_at(0.5, W / 2.0, H / 2.0, W, H);
        assert_eq!(out.zoom, MIN_ZOOM);
        let mut view = View::identity();
        for _ in 0..20 {
            view = view.zoomed_at(2.0, W / 2.0, H / 2.0, W, H);
        }
        assert_eq!(view.zoom, MAX_ZOOM);
    }

    #[test]
    fn panning_clamps_to_the_map_bounds() {
        let view = View::identity().zoomed_at(2.0, W / 2.0, H / 2.0, W, H);
        let dragged_off_one_way = view.panned(1e6, 1e6, W, H);
        assert_eq!(dragged_off_one_way.offset_x, 0.0);
        assert_eq!(dragged_off_one_way.offset_y, 0.0);
        let dragged_off_the_other = view.panned(-1e6, -1e6, W, H);
        assert_eq!(dragged_off_the_other.offset_x, W * view.zoom - W);
        assert_eq!(dragged_off_the_other.offset_y, H * view.zoom - H);
    }

    #[test]
    fn at_zoom_one_panning_cannot_move_the_map() {
        let view = View::identity().panned(50.0, -30.0, W, H);
        assert_eq!(view, View::identity());
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
