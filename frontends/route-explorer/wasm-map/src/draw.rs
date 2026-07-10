//! Canvas 2D rendering — the thin web-sys edge around the pure geometry.

use crate::geometry::{great_circle_arc, split_on_wrap, Projection, View};
use web_sys::{CanvasRenderingContext2d, CanvasWindingRule};

/// Dot radius + colour per [`crate::geometry::dot_class`] bucket: bigger and warmer
/// as the out-degree grows, so hubs read at a glance without stealing the amber
/// highlight reserved for selection.
pub const DOT_STYLES: [(f64, &str); 4] = [
    (1.1, "#5f4d33"),
    (1.7, "#8a6f45"),
    (2.4, "#b08d52"),
    (3.2, "#dfa93f"),
];
const HIGHLIGHT_RADIUS: f64 = 4.5;
const ARC_SAMPLES: usize = 64;

pub struct Palette;

/// The fleet's "field-guide" palette (see frontends/member-portal/src/index.css):
/// talon-dark water, tan-to-amber airport dots (see [`DOT_STYLES`]), the amber eye
/// as the accent, cream itinerary.
impl Palette {
    pub const BACKGROUND: &'static str = "#140d06";
    pub const LAND: &'static str = "#241a10";
    pub const COAST: &'static str = "#43331d";
    pub const LABEL: &'static str = "rgba(193, 162, 116, 0.85)";
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

/// Fill the landmasses — each polygon's outer ring plus its holes as subpaths
/// under the even-odd rule — with a hairline coast stroke that keeps its
/// on-screen width across zoom levels.
pub fn draw_land(ctx: &CanvasRenderingContext2d, polygons: &[Vec<Vec<(f32, f32)>>], zoom: f32) {
    ctx.set_fill_style_str(Palette::LAND);
    ctx.set_stroke_style_str(Palette::COAST);
    ctx.set_line_width(0.75 / zoom as f64);
    for rings in polygons {
        ctx.begin_path();
        for ring in rings {
            let Some(&(x0, y0)) = ring.first() else { continue };
            ctx.move_to(x0 as f64, y0 as f64);
            for &(x, y) in &ring[1..] {
                ctx.line_to(x as f64, y as f64);
            }
            ctx.close_path();
        }
        ctx.fill_with_canvas_winding_rule(CanvasWindingRule::Evenodd);
        ctx.stroke();
    }
}

/// One city label: a tiny anchor dot plus haloed text, both sized to stay
/// constant on screen across zoom levels.
pub fn draw_label(ctx: &CanvasRenderingContext2d, x: f32, y: f32, name: &str, zoom: f32) {
    let z = zoom as f64;
    ctx.set_fill_style_str(Palette::LABEL);
    ctx.begin_path();
    let _ = ctx.arc(x as f64, y as f64, 1.1 / z, 0.0, std::f64::consts::TAU);
    ctx.fill();

    ctx.set_font(&format!(
        "{}px 'Hanken Grotesk', system-ui, sans-serif",
        11.0 / z
    ));
    ctx.set_text_align("center");
    ctx.set_text_baseline("bottom");
    let baseline_y = (y - 3.5 / zoom) as f64;
    ctx.set_stroke_style_str(Palette::BACKGROUND);
    ctx.set_line_width(3.0 / z);
    let _ = ctx.stroke_text(name, x as f64, baseline_y);
    ctx.set_fill_style_str(Palette::LABEL);
    let _ = ctx.fill_text(name, x as f64, baseline_y);
}

/// One pass per style bucket keeps canvas state changes to four, not thousands.
pub fn draw_dots(ctx: &CanvasRenderingContext2d, points: &[(f32, f32)], classes: &[u8], zoom: f32) {
    for (class, &(radius, color)) in DOT_STYLES.iter().enumerate() {
        ctx.set_fill_style_str(color);
        let r = radius / zoom as f64;
        for (i, &(x, y)) in points.iter().enumerate() {
            if usize::from(*classes.get(i).unwrap_or(&0)) != class {
                continue;
            }
            ctx.begin_path();
            let _ = ctx.arc(x as f64, y as f64, r, 0.0, std::f64::consts::TAU);
            ctx.fill();
        }
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
