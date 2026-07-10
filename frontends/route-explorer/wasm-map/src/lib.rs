//! The Route Explorer map island (ADR-0022).
//!
//! The exported surface is one `RouteMap` handle behind a typed-array boundary:
//! Svelte passes coordinates as `Float32Array`s and airport *indices* are the shared
//! currency — no airport metadata (and since the i18n retrofit, no user-facing text)
//! crosses into WASM. Leptos renders the island's internal DOM (the canvas); Svelte
//! never sees Leptos. Zoom lives here: wheel zooms at the cursor, dragging pans, and
//! `zoom_in`/`zoom_out`/`reset_view` back the host's toolbar buttons.

pub mod basemap;
mod draw;
pub mod geometry;

use std::cell::RefCell;
use std::rc::Rc;

use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlElement, MouseEvent, WheelEvent};

use draw::Palette;
use geometry::{pick, place_labels, rank_ceiling, Projection, View};

const CANVAS_WIDTH: f32 = 960.0;
const CANVAS_HEIGHT: f32 = 480.0; // 2:1 — undistorted equirectangular
const PICK_RADIUS: f32 = 8.0;
const WHEEL_ZOOM_STEP: f32 = 1.2;
const BUTTON_ZOOM_STEP: f32 = 1.5;
const DRAG_THRESHOLD: f32 = 3.0; // canvas px of movement that turns a click into a pan

/// What is currently painted — kept so zoom/pan repaint the same scene.
enum Scene {
    Base,
    Destinations { from: u32, dests: Vec<u32> },
    Path(Vec<u32>),
}

struct Drag {
    start_x: f32,
    start_y: f32,
    last_x: f32,
    last_y: f32,
}

/// A populated place projected into base canvas coordinates, ready to label.
struct CityLabel {
    x: f32,
    y: f32,
    rank: u8,
    name: String,
}

struct State {
    projected: Vec<(f32, f32)>,
    coords: Vec<(f32, f32)>, // (lat, lon) per airport index
    land: Vec<Vec<Vec<(f32, f32)>>>, // basemap polygons, projected
    cities: Vec<CityLabel>,  // rank-sorted, most important first
    ctx: Option<CanvasRenderingContext2d>,
    view: View,
    scene: Scene,
    drag: Option<Drag>,
    dragged: bool, // suppresses the click-pick that follows a pan
}

fn canvas_point(canvas: &HtmlCanvasElement, client_x: i32, client_y: i32) -> Option<(f32, f32)> {
    let rect = canvas.get_bounding_client_rect();
    if rect.width() <= 0.0 {
        return None;
    }
    // Map CSS pixels back to the fixed canvas coordinate space.
    let scale_x = CANVAS_WIDTH as f64 / rect.width();
    let scale_y = CANVAS_HEIGHT as f64 / rect.height();
    Some((
        ((client_x as f64 - rect.left()) * scale_x) as f32,
        ((client_y as f64 - rect.top()) * scale_y) as f32,
    ))
}

/// City labels visible in the current view: rank-filtered by zoom, then greedily
/// decluttered in screen space so important names win the fight for pixels.
fn visible_labels(s: &State) -> Vec<usize> {
    let view = s.view;
    let ceiling = rank_ceiling(view.zoom);
    const LABEL_HEIGHT: f32 = 13.0;
    const CHAR_WIDTH: f32 = 6.4; // ≈11px Hanken Grotesk average advance
    const MARGIN: f32 = 60.0;

    let mut indexes = Vec::new();
    let mut boxes = Vec::new();
    for (index, city) in s.cities.iter().enumerate() {
        if city.rank > ceiling {
            break; // cities are rank-sorted; nothing smaller can qualify
        }
        let sx = city.x * view.zoom - view.offset_x;
        let sy = city.y * view.zoom - view.offset_y;
        if !(-MARGIN..CANVAS_WIDTH + MARGIN).contains(&sx)
            || !(-MARGIN..CANVAS_HEIGHT + MARGIN).contains(&sy)
        {
            continue;
        }
        let half = city.name.chars().count() as f32 * CHAR_WIDTH / 2.0;
        indexes.push(index);
        boxes.push((sx - half, sy - LABEL_HEIGHT - 3.0, sx + half, sy));
    }
    place_labels(&boxes)
        .into_iter()
        .zip(indexes)
        .filter_map(|(keep, index)| keep.then_some(index))
        .collect()
}

fn paint(state: &Rc<RefCell<State>>, projection: Projection) {
    let s = state.borrow();
    let Some(ctx) = s.ctx.as_ref() else { return };
    draw::clear(ctx, projection);
    draw::apply_view(ctx, s.view);
    let zoom = s.view.zoom;
    draw::draw_land(ctx, &s.land, zoom);
    draw::draw_dots(ctx, &s.projected, zoom);
    match &s.scene {
        Scene::Base => {}
        Scene::Destinations { from, dests } => {
            let Some(&origin) = s.coords.get(*from as usize) else { return };
            for &dest in dests {
                if let Some(&target) = s.coords.get(dest as usize) {
                    draw::draw_arc(ctx, projection, origin, target, Palette::ARC, 1.0, zoom);
                }
            }
            for &dest in dests {
                if let Some(&point) = s.projected.get(dest as usize) {
                    draw::draw_highlight(ctx, point, zoom);
                }
            }
            if let Some(&point) = s.projected.get(*from as usize) {
                draw::draw_highlight(ctx, point, zoom);
            }
        }
        Scene::Path(path) => {
            for pair in path.windows(2) {
                let (Some(&from), Some(&to)) = (
                    s.coords.get(pair[0] as usize),
                    s.coords.get(pair[1] as usize),
                ) else {
                    continue;
                };
                draw::draw_arc(ctx, projection, from, to, Palette::PATH, 2.0, zoom);
            }
            for &index in path {
                if let Some(&point) = s.projected.get(index as usize) {
                    draw::draw_highlight(ctx, point, zoom);
                }
            }
        }
    }
    for index in visible_labels(&s) {
        let city = &s.cities[index];
        draw::draw_label(ctx, city.x, city.y, &city.name, zoom);
    }
}

#[wasm_bindgen]
pub struct RouteMap {
    state: Rc<RefCell<State>>,
    projection: Projection,
    // Dropping the handle unmounts the Leptos island; freeing RouteMap tears it down.
    _unmount: Box<dyn std::any::Any>,
}

#[wasm_bindgen]
impl RouteMap {
    /// `lats`/`lons` are parallel arrays; `on_pick` is invoked with the clicked airport's index.
    #[wasm_bindgen(constructor)]
    pub fn new(host: HtmlElement, lats: &[f32], lons: &[f32], on_pick: js_sys::Function) -> RouteMap {
        let projection = Projection::new(CANVAS_WIDTH, CANVAS_HEIGHT);
        let coords: Vec<(f32, f32)> = lats.iter().copied().zip(lons.iter().copied()).collect();
        let projected = coords
            .iter()
            .map(|&(lat, lon)| projection.project(lat, lon))
            .collect();

        // The embedded Natural Earth basemap, projected once up front.
        let land = basemap::land_polygons()
            .into_iter()
            .map(|rings| {
                rings
                    .into_iter()
                    .map(|ring| {
                        ring.into_iter()
                            .map(|(lat, lon)| projection.project(lat, lon))
                            .collect()
                    })
                    .collect()
            })
            .collect();
        let cities = basemap::places()
            .into_iter()
            .map(|place| {
                let (x, y) = projection.project(place.lat, place.lon);
                CityLabel {
                    x,
                    y,
                    rank: place.rank,
                    name: place.name,
                }
            })
            .collect();

        let state = Rc::new(RefCell::new(State {
            projected,
            coords,
            land,
            cities,
            ctx: None,
            view: View::identity(),
            scene: Scene::Base,
            drag: None,
            dragged: false,
        }));

        let canvas_ref: NodeRef<leptos::html::Canvas> = NodeRef::new();

        let on_click = {
            let state = Rc::clone(&state);
            move |ev: MouseEvent| {
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let Some((x, y)) = canvas_point(&canvas, ev.client_x(), ev.client_y()) else {
                    return;
                };
                // End the borrow before calling back into JS, which may re-enter the handle.
                let hit = {
                    let mut s = state.borrow_mut();
                    if s.dragged {
                        s.dragged = false; // the click that ends a pan is not a pick
                        return;
                    }
                    let (bx, by) = s.view.to_base(x, y);
                    pick(&s.projected, bx, by, PICK_RADIUS / s.view.zoom)
                };
                if let Some(index) = hit {
                    let _ = on_pick.call1(&JsValue::NULL, &JsValue::from(index as u32));
                }
            }
        };

        let on_mousedown = {
            let state = Rc::clone(&state);
            move |ev: MouseEvent| {
                if ev.button() != 0 {
                    return;
                }
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let Some((x, y)) = canvas_point(&canvas, ev.client_x(), ev.client_y()) else {
                    return;
                };
                let mut s = state.borrow_mut();
                s.drag = Some(Drag {
                    start_x: x,
                    start_y: y,
                    last_x: x,
                    last_y: y,
                });
                s.dragged = false;
            }
        };

        let on_mousemove = {
            let state = Rc::clone(&state);
            move |ev: MouseEvent| {
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let Some((x, y)) = canvas_point(&canvas, ev.client_x(), ev.client_y()) else {
                    return;
                };
                {
                    let mut guard = state.borrow_mut();
                    let s = &mut *guard;
                    let Some(drag) = s.drag.as_mut() else { return };
                    if !s.dragged {
                        let travelled = (x - drag.start_x).abs() + (y - drag.start_y).abs();
                        if travelled < DRAG_THRESHOLD {
                            return;
                        }
                        s.dragged = true;
                    }
                    let (dx, dy) = (x - drag.last_x, y - drag.last_y);
                    drag.last_x = x;
                    drag.last_y = y;
                    s.view = s.view.panned(dx, dy, CANVAS_WIDTH, CANVAS_HEIGHT);
                }
                paint(&state, projection);
            }
        };

        // `dragged` deliberately survives mouseup: the click event that follows a pan
        // consumes it in on_click; the next mousedown resets it either way.
        let on_mouseup = {
            let state = Rc::clone(&state);
            move |_ev: MouseEvent| {
                state.borrow_mut().drag = None;
            }
        };
        let on_mouseleave = {
            let state = Rc::clone(&state);
            move |_ev: MouseEvent| {
                state.borrow_mut().drag = None;
            }
        };

        let on_wheel = {
            let state = Rc::clone(&state);
            move |ev: WheelEvent| {
                ev.prevent_default(); // the map zooms; the page must not scroll
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let Some((x, y)) = canvas_point(&canvas, ev.client_x(), ev.client_y()) else {
                    return;
                };
                let factor = if ev.delta_y() < 0.0 {
                    WHEEL_ZOOM_STEP
                } else {
                    1.0 / WHEEL_ZOOM_STEP
                };
                {
                    let mut s = state.borrow_mut();
                    s.view = s.view.zoomed_at(factor, x, y, CANVAS_WIDTH, CANVAS_HEIGHT);
                }
                paint(&state, projection);
            }
        };

        let island = move || {
            view! {
                <div class="wasm-map-island">
                    <canvas
                        node_ref=canvas_ref
                        width="960"
                        height="480"
                        style="width: 100%; height: auto; display: block; cursor: crosshair; touch-action: none;"
                        on:click=on_click
                        on:mousedown=on_mousedown
                        on:mousemove=on_mousemove
                        on:mouseup=on_mouseup
                        on:mouseleave=on_mouseleave
                        on:wheel=on_wheel
                    ></canvas>
                </div>
            }
        };
        let unmount = leptos::mount::mount_to(host, island);

        if let Some(canvas) = canvas_ref.get_untracked() {
            let canvas: HtmlCanvasElement = canvas;
            let ctx = canvas
                .get_context("2d")
                .ok()
                .flatten()
                .and_then(|object| object.dyn_into::<CanvasRenderingContext2d>().ok());
            state.borrow_mut().ctx = ctx;
        }

        RouteMap {
            state,
            projection,
            _unmount: Box::new(unmount),
        }
    }

    /// Repaint every airport as a dot.
    pub fn draw_base(&self) {
        self.state.borrow_mut().scene = Scene::Base;
        paint(&self.state, self.projection);
    }

    /// Base map plus arcs from one airport to each destination index.
    pub fn highlight_destinations(&self, from: u32, dests: &[u32]) {
        self.state.borrow_mut().scene = Scene::Destinations {
            from,
            dests: dests.to_vec(),
        };
        paint(&self.state, self.projection);
    }

    /// Base map plus a searched itinerary drawn leg by leg.
    pub fn show_path(&self, path: &[u32]) {
        self.state.borrow_mut().scene = Scene::Path(path.to_vec());
        paint(&self.state, self.projection);
    }

    /// Step-zoom on the canvas centre — backs the host's "+" button.
    pub fn zoom_in(&self) {
        self.zoom_centered(BUTTON_ZOOM_STEP);
    }

    /// Step-zoom out on the canvas centre — backs the host's "−" button.
    pub fn zoom_out(&self) {
        self.zoom_centered(1.0 / BUTTON_ZOOM_STEP);
    }

    /// Back to the whole-world view.
    pub fn reset_view(&self) {
        self.state.borrow_mut().view = View::identity();
        paint(&self.state, self.projection);
    }
}

impl RouteMap {
    fn zoom_centered(&self, factor: f32) {
        {
            let mut s = self.state.borrow_mut();
            s.view = s.view.zoomed_at(
                factor,
                CANVAS_WIDTH / 2.0,
                CANVAS_HEIGHT / 2.0,
                CANVAS_WIDTH,
                CANVAS_HEIGHT,
            );
        }
        paint(&self.state, self.projection);
    }
}
