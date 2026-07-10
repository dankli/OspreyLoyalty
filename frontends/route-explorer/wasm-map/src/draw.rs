//! Canvas 2D rendering — the thin web-sys edge around the pure geometry.

use crate::geometry::{great_circle_arc, split_on_wrap, Projection, View};
use web_sys::CanvasRenderingContext2d;

const DOT_RADIUS: f64 = 1.4;
const HIGHLIGHT_RADIUS: f64 = 4.0;
const ARC_SAMPLES: usize = 64;

pub struct Palette;

/// The fleet's "field-guide" palette (see frontends/member-portal/src/index.css):
/// talon-dark water, tan airport dots, the amber eye as the accent, cream itinerary.
impl Palette {
    pub const BACKGROUND: &'static str = "#140d06";
    pub const DOT: &'static str = "#7a6340";
    pub const HIGHLIGHT: &'static str = "#e3ae36";
    pub const ARC: &'static str = "rgba(227, 174, 54, 0.45)";
    pub const PATH: &'static str = "#efe6d3";
}

pub fn clear(ctx: &CanvasRenderingContext2d, projection: Projection) {
    let _ = ctx.set_transform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    ctx.set_fill_style_str(Palette::BACKGROUND);
    ctx.fill_rect(0.0, 0.0, projection.width as f64, projection.height as f64);
}

/// Everything after this draws in base map coordinates; the canvas transform applies
/// the zoom/pan window. Dot radii and stroke widths are divided by the zoom in the
/// draw fns below so they keep their on-screen size.
pub fn apply_view(ctx: &CanvasRenderingContext2d, view: View) {
    let _ = ctx.set_transform(
        view.zoom as f64,
        0.0,
        0.0,
        view.zoom as f64,
        -view.offset_x as f64,
        -view.offset_y as f64,
    );
}

pub fn draw_dots(ctx: &CanvasRenderingContext2d, points: &[(f32, f32)], zoom: f32) {
    ctx.set_fill_style_str(Palette::DOT);
    let radius = DOT_RADIUS / zoom as f64;
    for &(x, y) in points {
        ctx.begin_path();
        let _ = ctx.arc(x as f64, y as f64, radius, 0.0, std::f64::consts::TAU);
        ctx.fill();
    }
}

pub fn draw_highlight(ctx: &CanvasRenderingContext2d, point: (f32, f32), zoom: f32) {
    ctx.set_fill_style_str(Palette::HIGHLIGHT);
    ctx.begin_path();
    let _ = ctx.arc(
        point.0 as f64,
        point.1 as f64,
        HIGHLIGHT_RADIUS / zoom as f64,
        0.0,
        std::f64::consts::TAU,
    );
    ctx.fill();
}

/// Draw a great-circle arc between two coordinates, split where it wraps the map edge.
pub fn draw_arc(
    ctx: &CanvasRenderingContext2d,
    projection: Projection,
    from: (f32, f32),
    to: (f32, f32),
    style: &str,
    line_width: f64,
    zoom: f32,
) {
    let arc = great_circle_arc(from.0, from.1, to.0, to.1, ARC_SAMPLES);
    let projected: Vec<(f32, f32)> = arc
        .into_iter()
        .map(|(lat, lon)| projection.project(lat, lon))
        .collect();

    ctx.set_stroke_style_str(style);
    ctx.set_line_width(line_width / zoom as f64);
    for segment in split_on_wrap(&projected, projection.width) {
        if segment.len() < 2 {
            continue;
        }
        ctx.begin_path();
        ctx.move_to(segment[0].0 as f64, segment[0].1 as f64);
        for &(x, y) in &segment[1..] {
            ctx.line_to(x as f64, y as f64);
        }
        ctx.stroke();
    }
}
