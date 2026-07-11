//! The Route Explorer map island (ADR-0022).
//!
//! The exported surface is one `RouteMap` handle behind a typed-array boundary:
//! Svelte passes coordinates as `Float32Array`s and airport *indices* are the shared
//! currency — no airport metadata (and since the i18n retrofit, no user-facing text)
//! crosses into WASM. Leptos renders the island's internal DOM (the canvas); Svelte
//! never sees Leptos. Interaction lives here: wheel zooms at the cursor, dragging and
//! one-finger touch pan, two fingers pinch, `zoom_in`/`zoom_out`/`reset_view` back the
//! host's toolbar, hovering and clicking dots (or a destination arc) report the
//! airport index back through callbacks, and the view survives remounts via
//! sessionStorage.

pub mod basemap;
mod draw;
pub mod geometry;

use std::cell::RefCell;
use std::rc::Rc;

use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    CanvasRenderingContext2d, HtmlCanvasElement, HtmlElement, MouseEvent, TouchEvent, WheelEvent,
};

use draw::Palette;
use geometry::{
    airport_label_floor, arc_segments, dot_class, dot_visible_floor, place_labels, polyline_hit,
    rank_ceiling, Projection, View,
};

const CANVAS_WIDTH: f32 = 960.0;
const CANVAS_HEIGHT: f32 = 480.0; // 2:1 — undistorted equirectangular
const PICK_RADIUS: f32 = 8.0;
const ARC_PICK_RADIUS: f32 = 5.0;
const ARC_SAMPLES: usize = 64;
const WHEEL_ZOOM_STEP: f32 = 1.2;
const BUTTON_ZOOM_STEP: f32 = 1.5;
const DRAG_THRESHOLD: f32 = 3.0; // canvas px of movement that turns a click into a pan
const BORDER_MIN_ZOOM: f32 = 2.0; // country borders would be noise on the world view
const FIT_MAX_ZOOM: f32 = 8.0; // framing a short hop must not zoom into a blank close-up
const FIT_PADDING: f32 = 40.0;
const VIEW_STORAGE_KEY: &str = "osprey.route-explorer.map-view";

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

/// An active touch interaction: one finger pans, two pinch-zoom.
enum Gesture {
    Pan { last_x: f32, last_y: f32 },
    Pinch { last_dist: f32, last_x: f32, last_y: f32 },
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
    dot_classes: Vec<u8>,    // out-degree bucket per airport (hub dot size/colour)
    airport_labels: Vec<String>, // IATA code per airport index — labels at deep zoom
    land: Vec<Vec<Vec<(f32, f32)>>>, // basemap polygons, projected
    borders: Vec<Vec<(f32, f32)>>, // country border polylines, projected
    cities: Vec<CityLabel>,  // rank-sorted, most important first
    ctx: Option<CanvasRenderingContext2d>,
    dpr: f64, // device pixel ratio baked into the backing store for crisp hidpi
    view: View,
    scene: Scene,
    drag: Option<Drag>,
    gesture: Option<Gesture>,
    dragged: bool, // suppresses the click-pick that follows a pan
    hovered: Option<usize>,
}

fn canvas_point(canvas: &HtmlCanvasElement, client_x: i32, client_y: i32) -> Option<(f32, f32)> {
    let rect = canvas.get_bounding_client_rect();
    if rect.width() <= 0.0 {
        return None;
    }
    // Map CSS pixels back to the fixed logical canvas coordinate space.
    let scale_x = CANVAS_WIDTH as f64 / rect.width();
    let scale_y = CANVAS_HEIGHT as f64 / rect.height();
    Some((
        ((client_x as f64 - rect.left()) * scale_x) as f32,
        ((client_y as f64 - rect.top()) * scale_y) as f32,
    ))
}

/// Nearest *visible* dot within the pick radius — dots hidden by the zoom gate
/// can be neither clicked nor hovered.
fn pick_visible(s: &State, x: f32, y: f32) -> Option<usize> {
    let (bx, by) = s.view.to_base(x, y);
    let radius = PICK_RADIUS / s.view.zoom;
    let radius_sq = radius * radius;
    let mut best: Option<(usize, f32)> = None;
    for (i, (px, py)) in s.projected.iter().enumerate() {
        if s.view.zoom < dot_visible_floor(*s.dot_classes.get(i).unwrap_or(&0)) {
            continue;
        }
        let d = (px - bx) * (px - bx) + (py - by) * (py - by);
        if d <= radius_sq && best.map_or(true, |(_, bd)| d < bd) {
            best = Some((i, d));
        }
    }
    best.map(|(i, _)| i)
}

/// In the destinations scene a click that misses every dot may still land on an
/// arc — treat that as picking the arc's destination.
fn pick_arc(s: &State, projection: Projection, x: f32, y: f32) -> Option<u32> {
    let Scene::Destinations { from, dests } = &s.scene else {
        return None;
    };
    let origin = *s.coords.get(*from as usize)?;
    let (bx, by) = s.view.to_base(x, y);
    let radius = ARC_PICK_RADIUS / s.view.zoom;
    dests.iter().copied().find(|&dest| {
        s.coords.get(dest as usize).is_some_and(|&target| {
            arc_segments(projection, origin, target, ARC_SAMPLES)
                .iter()
                .any(|segment| polyline_hit(segment, bx, by, radius))
        })
    })
}

fn persist_view(view: View) {
    if let Some(storage) = web_sys::window().and_then(|w| w.session_storage().ok().flatten()) {
        let _ = storage.set_item(
            VIEW_STORAGE_KEY,
            &format!("{},{},{}", view.zoom, view.offset_x, view.offset_y),
        );
    }
}

fn restore_view() -> Option<View> {
    let storage = web_sys::window()?.session_storage().ok()??;
    let raw = storage.get_item(VIEW_STORAGE_KEY).ok()??;
    let mut parts = raw.split(',').map(str::parse::<f32>);
    let zoom = parts.next()?.ok()?;
    let offset_x = parts.next()?.ok()?;
    let offset_y = parts.next()?.ok()?;
    Some(View::restore(zoom, offset_x, offset_y, CANVAS_WIDTH, CANVAS_HEIGHT))
}

/// One label plan entry: which list the index points into.
enum Label {
    City(usize),
    Airport(usize),
}

/// Labels visible in the current view, planned in priority order through one
/// greedy declutter pass: the scene's own airports first (a selected airport or a
/// drawn itinerary must never lose its name), then cities rank-filtered by zoom,
/// then airport IATA codes admitted per dot class (hubs before smaller fields).
/// Cities sit above their anchors, codes below the dots, so the two rarely collide.
fn visible_labels(s: &State) -> Vec<Label> {
    let view = s.view;
    let ceiling = rank_ceiling(view.zoom);
    const LABEL_HEIGHT: f32 = 13.0;
    const CHAR_WIDTH: f32 = 6.4; // ≈11px Hanken Grotesk average advance
    const CODE_CHAR_WIDTH: f32 = 5.8; // ≈9.5px, weight 600
    const MARGIN: f32 = 60.0;

    let on_screen = |sx: f32, sy: f32| {
        (-MARGIN..CANVAS_WIDTH + MARGIN).contains(&sx)
            && (-MARGIN..CANVAS_HEIGHT + MARGIN).contains(&sy)
    };

    let mut labels = Vec::new();
    let mut boxes = Vec::new();
    let mut taken = vec![false; s.projected.len()];

    let push_airport = |index: usize, labels: &mut Vec<Label>, boxes: &mut Vec<(f32, f32, f32, f32)>, taken: &mut Vec<bool>| {
        if taken.get(index).copied().unwrap_or(true) {
            return;
        }
        let Some(code) = s.airport_labels.get(index).filter(|c| !c.is_empty()) else {
            return;
        };
        let (x, y) = s.projected[index];
        let sx = x * view.zoom - view.offset_x;
        let sy = y * view.zoom - view.offset_y;
        if !on_screen(sx, sy) {
            return;
        }
        let half = code.chars().count() as f32 * CODE_CHAR_WIDTH / 2.0;
        taken[index] = true;
        labels.push(Label::Airport(index));
        boxes.push((sx - half, sy + 2.0, sx + half, sy + LABEL_HEIGHT + 2.0));
    };

    // The scene's own airports label unconditionally, ahead of everything else.
    match &s.scene {
        Scene::Base => {}
        Scene::Destinations { from, .. } => {
            push_airport(*from as usize, &mut labels, &mut boxes, &mut taken);
        }
        Scene::Path(path) => {
            for &index in path {
                push_airport(index as usize, &mut labels, &mut boxes, &mut taken);
            }
        }
    }

    for (index, city) in s.cities.iter().enumerate() {
        if city.rank > ceiling {
            break; // cities are rank-sorted; nothing smaller can qualify
        }
        let sx = city.x * view.zoom - view.offset_x;
        let sy = city.y * view.zoom - view.offset_y;
        if !on_screen(sx, sy) {
            continue;
        }
        let half = city.name.chars().count() as f32 * CHAR_WIDTH / 2.0;
        labels.push(Label::City(index));
        boxes.push((sx - half, sy - LABEL_HEIGHT - 3.0, sx + half, sy));
    }

    if view.zoom >= airport_label_floor(3) {
        // Hubs claim space before smaller fields; ties resolve by index (stable).
        let mut order: Vec<usize> = (0..s.projected.len())
            .filter(|&i| {
                let class = *s.dot_classes.get(i).unwrap_or(&0);
                view.zoom >= airport_label_floor(class) && view.zoom >= dot_visible_floor(class)
            })
            .collect();
        order.sort_by(|&a, &b| s.dot_classes[b].cmp(&s.dot_classes[a]));
        for index in order {
            push_airport(index, &mut labels, &mut boxes, &mut taken);
        }
    }

    place_labels(&boxes)
        .into_iter()
        .zip(labels)
        .filter_map(|(keep, label)| keep.then_some(label))
        .collect()
}

fn paint(state: &Rc<RefCell<State>>, projection: Projection) {
    let s = state.borrow();
    let Some(ctx) = s.ctx.as_ref() else { return };
    draw::clear(ctx, projection, s.dpr);
    draw::apply_view(ctx, s.view, s.dpr);
    let zoom = s.view.zoom;
    draw::draw_land(ctx, &s.land, zoom);
    if zoom >= BORDER_MIN_ZOOM {
        draw::draw_borders(ctx, &s.borders, zoom);
    }
    draw::draw_dots(ctx, &s.projected, &s.dot_classes, zoom);
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
    for label in visible_labels(&s) {
        match label {
            Label::City(index) => {
                let city = &s.cities[index];
                draw::draw_label(ctx, city.x, city.y, &city.name, zoom);
            }
            Label::Airport(index) => {
                let (x, y) = s.projected[index];
                draw::draw_airport_label(ctx, x, y, &s.airport_labels[index], zoom);
            }
        }
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
    /// `lats`/`lons`/`degrees`/`labels` are parallel arrays (degree = destinations
    /// served, for hub dot sizing and gating; label = the IATA code drawn at deep
    /// zoom); `on_pick` fires with a clicked airport's index, `on_hover` with the
    /// hovered index or -1 when the pointer leaves a dot.
    #[wasm_bindgen(constructor)]
    pub fn new(
        host: HtmlElement,
        lats: &[f32],
        lons: &[f32],
        degrees: &[u32],
        labels: Vec<String>,
        on_pick: js_sys::Function,
        on_hover: js_sys::Function,
    ) -> RouteMap {
        let projection = Projection::new(CANVAS_WIDTH, CANVAS_HEIGHT);
        let coords: Vec<(f32, f32)> = lats.iter().copied().zip(lons.iter().copied()).collect();
        let projected: Vec<(f32, f32)> = coords
            .iter()
            .map(|&(lat, lon)| projection.project(lat, lon))
            .collect();
        let mut dot_classes: Vec<u8> = degrees.iter().map(|&d| dot_class(d)).collect();
        dot_classes.resize(coords.len(), 0); // tolerate a short array — extras render smallest
        let mut airport_labels = labels;
        airport_labels.resize(coords.len(), String::new()); // short array — extras stay unlabelled

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
        let borders = basemap::border_lines()
            .into_iter()
            .map(|line| {
                line.into_iter()
                    .map(|(lat, lon)| projection.project(lat, lon))
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

        let dpr = web_sys::window()
            .map(|w| w.device_pixel_ratio())
            .filter(|r| r.is_finite() && *r > 0.0)
            .unwrap_or(1.0);
        let backing_w = (CANVAS_WIDTH as f64 * dpr).round() as u32;
        let backing_h = (CANVAS_HEIGHT as f64 * dpr).round() as u32;

        let state = Rc::new(RefCell::new(State {
            projected,
            coords,
            dot_classes,
            airport_labels,
            land,
            borders,
            cities,
            ctx: None,
            dpr,
            view: restore_view().unwrap_or_else(View::identity),
            scene: Scene::Base,
            drag: None,
            gesture: None,
            dragged: false,
            hovered: None,
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
                    pick_visible(&s, x, y)
                        .map(|i| i as u32)
                        .or_else(|| pick_arc(&s, projection, x, y))
                };
                if let Some(index) = hit {
                    let _ = on_pick.call1(&JsValue::NULL, &JsValue::from(index));
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

        let hover_callback = on_hover.clone();
        let on_mousemove = {
            let state = Rc::clone(&state);
            move |ev: MouseEvent| {
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let Some((x, y)) = canvas_point(&canvas, ev.client_x(), ev.client_y()) else {
                    return;
                };
                let dragging = {
                    let mut guard = state.borrow_mut();
                    let s = &mut *guard;
                    match s.drag.as_mut() {
                        Some(drag) => {
                            if !s.dragged {
                                let travelled =
                                    (x - drag.start_x).abs() + (y - drag.start_y).abs();
                                if travelled < DRAG_THRESHOLD {
                                    return;
                                }
                                s.dragged = true;
                            }
                            let (dx, dy) = (x - drag.last_x, y - drag.last_y);
                            drag.last_x = x;
                            drag.last_y = y;
                            s.view = s.view.panned(dx, dy, CANVAS_WIDTH, CANVAS_HEIGHT);
                            true
                        }
                        None => false,
                    }
                };
                if dragging {
                    paint(&state, projection);
                    return;
                }
                // Not dragging: hover affordance + callback, only on change.
                let changed = {
                    let mut s = state.borrow_mut();
                    let hit = pick_visible(&s, x, y);
                    if hit == s.hovered {
                        None
                    } else {
                        s.hovered = hit;
                        Some(hit)
                    }
                };
                if let Some(hit) = changed {
                    // UFCS: leptos' ElementExt::style would otherwise shadow web_sys.
                    let _ = web_sys::HtmlElement::style(&canvas)
                        .set_property("cursor", if hit.is_some() { "pointer" } else { "crosshair" });
                    let arg = hit.map(|i| i as i32).unwrap_or(-1);
                    let _ = hover_callback.call1(&JsValue::NULL, &JsValue::from(arg));
                }
            }
        };

        // `dragged` deliberately survives mouseup: the click event that follows a pan
        // consumes it in on_click; the next mousedown resets it either way.
        let on_mouseup = {
            let state = Rc::clone(&state);
            move |_ev: MouseEvent| {
                let view = {
                    let mut s = state.borrow_mut();
                    s.drag = None;
                    s.view
                };
                persist_view(view);
            }
        };
        let hover_leave = on_hover.clone();
        let on_mouseleave = {
            let state = Rc::clone(&state);
            move |_ev: MouseEvent| {
                let (view, had_hover) = {
                    let mut s = state.borrow_mut();
                    s.drag = None;
                    let had = s.hovered.take().is_some();
                    (s.view, had)
                };
                persist_view(view);
                if had_hover {
                    let _ = hover_leave.call1(&JsValue::NULL, &JsValue::from(-1));
                }
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
                let view = {
                    let mut s = state.borrow_mut();
                    s.view = s.view.zoomed_at(factor, x, y, CANVAS_WIDTH, CANVAS_HEIGHT);
                    s.view
                };
                persist_view(view);
                paint(&state, projection);
            }
        };

        // Touch: one finger pans, two pinch-zoom around the midpoint. touchmove is
        // prevented (no page scroll, no synthetic mouse events mid-gesture); a clean
        // tap still produces the browser's synthetic click, which lands in on_click.
        let touch_point = |canvas: &HtmlCanvasElement, ev: &TouchEvent, i: u32| {
            ev.touches()
                .item(i)
                .and_then(|t| canvas_point(canvas, t.client_x(), t.client_y()))
        };
        let read_gesture = move |canvas: &HtmlCanvasElement, ev: &TouchEvent| -> Option<Gesture> {
            match ev.touches().length() {
                1 => {
                    let (x, y) = touch_point(canvas, ev, 0)?;
                    Some(Gesture::Pan { last_x: x, last_y: y })
                }
                2 => {
                    let (ax, ay) = touch_point(canvas, ev, 0)?;
                    let (bx, by) = touch_point(canvas, ev, 1)?;
                    Some(Gesture::Pinch {
                        last_dist: ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt().max(1.0),
                        last_x: (ax + bx) / 2.0,
                        last_y: (ay + by) / 2.0,
                    })
                }
                _ => None,
            }
        };

        let on_touchstart = {
            let state = Rc::clone(&state);
            move |ev: TouchEvent| {
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                state.borrow_mut().gesture = read_gesture(&canvas, &ev);
            }
        };
        let on_touchmove = {
            let state = Rc::clone(&state);
            move |ev: TouchEvent| {
                ev.prevent_default();
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                {
                    let mut guard = state.borrow_mut();
                    let s = &mut *guard;
                    match s.gesture.as_mut() {
                        Some(Gesture::Pan { last_x, last_y }) => {
                            let Some((x, y)) = touch_point(&canvas, &ev, 0) else { return };
                            let (dx, dy) = (x - *last_x, y - *last_y);
                            *last_x = x;
                            *last_y = y;
                            s.view = s.view.panned(dx, dy, CANVAS_WIDTH, CANVAS_HEIGHT);
                            s.dragged = true; // swallow any synthetic click after the gesture
                        }
                        Some(Gesture::Pinch { last_dist, last_x, last_y }) => {
                            let (Some((ax, ay)), Some((bx, by))) =
                                (touch_point(&canvas, &ev, 0), touch_point(&canvas, &ev, 1))
                            else {
                                return;
                            };
                            let dist = ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt().max(1.0);
                            let (mx, my) = ((ax + bx) / 2.0, (ay + by) / 2.0);
                            let factor = dist / *last_dist;
                            let (dx, dy) = (mx - *last_x, my - *last_y);
                            *last_dist = dist;
                            *last_x = mx;
                            *last_y = my;
                            s.view = s
                                .view
                                .zoomed_at(factor, mx, my, CANVAS_WIDTH, CANVAS_HEIGHT)
                                .panned(dx, dy, CANVAS_WIDTH, CANVAS_HEIGHT);
                            s.dragged = true;
                        }
                        None => return,
                    }
                }
                paint(&state, projection);
            }
        };
        let on_touchend = {
            let state = Rc::clone(&state);
            move |ev: TouchEvent| {
                let Some(canvas) = canvas_ref.get_untracked() else { return };
                let view = {
                    let mut s = state.borrow_mut();
                    s.gesture = read_gesture(&canvas, &ev); // 2→1 fingers degrades to a pan
                    s.view
                };
                persist_view(view);
            }
        };

        let backing_w_attr = backing_w.to_string();
        let backing_h_attr = backing_h.to_string();
        let island = move || {
            view! {
                <div class="wasm-map-island">
                    <canvas
                        node_ref=canvas_ref
                        width=backing_w_attr
                        height=backing_h_attr
                        style="width: 100%; height: auto; display: block; cursor: crosshair; touch-action: none; aspect-ratio: 2 / 1;"
                        on:click=on_click
                        on:mousedown=on_mousedown
                        on:mousemove=on_mousemove
                        on:mouseup=on_mouseup
                        on:mouseleave=on_mouseleave
                        on:wheel=on_wheel
                        on:touchstart=on_touchstart
                        on:touchmove=on_touchmove
                        on:touchend=on_touchend
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

    /// Base map plus a searched itinerary drawn leg by leg — and the view zooms
    /// to frame it (arc geometry included, so polar bulges stay on screen).
    pub fn show_path(&self, path: &[u32]) {
        {
            let mut s = self.state.borrow_mut();
            s.scene = Scene::Path(path.to_vec());
            let mut arc_points: Vec<(f32, f32)> = Vec::new();
            for pair in path.windows(2) {
                let (Some(&from), Some(&to)) = (
                    s.coords.get(pair[0] as usize),
                    s.coords.get(pair[1] as usize),
                ) else {
                    continue;
                };
                for segment in arc_segments(self.projection, from, to, 32) {
                    arc_points.extend(segment);
                }
            }
            if let Some(view) =
                View::around(&arc_points, FIT_PADDING, CANVAS_WIDTH, CANVAS_HEIGHT, FIT_MAX_ZOOM)
            {
                s.view = view;
                persist_view(view);
            }
        }
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
        {
            let mut s = self.state.borrow_mut();
            s.view = View::identity();
        }
        persist_view(View::identity());
        paint(&self.state, self.projection);
    }
}

impl RouteMap {
    fn zoom_centered(&self, factor: f32) {
        let view = {
            let mut s = self.state.borrow_mut();
            s.view = s.view.zoomed_at(
                factor,
                CANVAS_WIDTH / 2.0,
                CANVAS_HEIGHT / 2.0,
                CANVAS_WIDTH,
                CANVAS_HEIGHT,
            );
            s.view
        };
        persist_view(view);
        paint(&self.state, self.projection);
    }
}
