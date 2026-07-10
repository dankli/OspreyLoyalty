//! Canvas 2D rendering — the thin web-sys edge around the pure geometry.

use crate::geometry::{great_circle_arc, split_on_wrap, Projection};
use web_sys::CanvasRenderingContext2d;

const DOT_RADIUS: f64 = 1.4;
const HIGHLIGHT_RADIUS: f64 = 4.0;
const ARC_SAMPLES: usize = 64;

pub struct Palette;

impl Palette {
    pub const BACKGROUND: &'static str = "#0d1b26";
    pub const DOT: &'static str = "#3d5a70";
    pub const HIGHLIGHT: &'static str = "#f2b134";
    pub const ARC: &'static str = "rgba(242, 177, 52, 0.45)";
    pub const PATH: &'static str = "#5ad19a";
}

pub fn clear(ctx: &CanvasRenderingContext2d, projection: Projection) {
    ctx.set_fill_style_str(Palette::BACKGROUND);
    ctx.fill_rect(0.0, 0.0, projection.width as f64, projection.height as f64);
}

pub fn draw_dots(ctx: &CanvasRenderingContext2d, points: &[(f32, f32)]) {
    ctx.set_fill_style_str(Palette::DOT);
    for &(x, y) in points {
        ctx.begin_path();
        let _ = ctx.arc(x as f64, y as f64, DOT_RADIUS, 0.0, std::f64::consts::TAU);
        ctx.fill();
    }
}

pub fn draw_highlight(ctx: &CanvasRenderingContext2d, point: (f32, f32)) {
    ctx.set_fill_style_str(Palette::HIGHLIGHT);
    ctx.begin_path();
    let _ = ctx.arc(
        point.0 as f64,
        point.1 as f64,
        HIGHLIGHT_RADIUS,
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
) {
    let arc = great_circle_arc(from.0, from.1, to.0, to.1, ARC_SAMPLES);
    let projected: Vec<(f32, f32)> = arc
        .into_iter()
        .map(|(lat, lon)| projection.project(lat, lon))
        .collect();

    ctx.set_stroke_style_str(style);
    ctx.set_line_width(line_width);
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
