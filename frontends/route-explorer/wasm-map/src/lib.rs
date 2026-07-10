//! The Route Explorer map island (ADR-0022).
//!
//! The exported surface is one `RouteMap` handle behind a typed-array boundary:
//! Svelte passes coordinates as `Float32Array`s and airport *indices* are the shared
//! currency — no airport metadata crosses into WASM. Leptos renders the island's
//! internal DOM (canvas + status line); Svelte never sees Leptos.

mod draw;
pub mod geometry;

use std::cell::RefCell;
use std::rc::Rc;

use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlElement, MouseEvent};

use draw::Palette;
use geometry::{pick, Projection};

const CANVAS_WIDTH: f32 = 960.0;
const CANVAS_HEIGHT: f32 = 480.0; // 2:1 — undistorted equirectangular
const PICK_RADIUS: f32 = 8.0;

struct State {
    projected: Vec<(f32, f32)>,
    coords: Vec<(f32, f32)>, // (lat, lon) per airport index
    ctx: Option<CanvasRenderingContext2d>,
}

#[wasm_bindgen]
pub struct RouteMap {
    state: Rc<RefCell<State>>,
    status: RwSignal<String>,
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

        let state = Rc::new(RefCell::new(State {
            projected,
            coords,
            ctx: None,
        }));
        let status = RwSignal::new(format!("{} airports — click one to see its routes", lats.len()));

        let canvas_ref: NodeRef<leptos::html::Canvas> = NodeRef::new();
        let click_state = Rc::clone(&state);
        let on_click = move |ev: MouseEvent| {
            let Some(canvas) = canvas_ref.get_untracked() else { return };
            let rect = canvas.get_bounding_client_rect();
            if rect.width() <= 0.0 {
                return;
            }
            // Map CSS pixels back to the fixed canvas coordinate space.
            let scale_x = CANVAS_WIDTH as f64 / rect.width();
            let scale_y = CANVAS_HEIGHT as f64 / rect.height();
            let x = (ev.client_x() as f64 - rect.left()) * scale_x;
            let y = (ev.client_y() as f64 - rect.top()) * scale_y;
            let hit = pick(&click_state.borrow().projected, x as f32, y as f32, PICK_RADIUS);
            if let Some(index) = hit {
                let _ = on_pick.call1(&JsValue::NULL, &JsValue::from(index as u32));
            }
        };

        let island = move || {
            view! {
                <div class="wasm-map-island">
                    <canvas
                        node_ref=canvas_ref
                        width="960"
                        height="480"
                        style="width: 100%; height: auto; display: block; border-radius: 8px; cursor: crosshair;"
                        on:click=on_click
                    ></canvas>
                    <p class="map-status">{move || status.get()}</p>
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
            status,
            projection,
            _unmount: Box::new(unmount),
        }
    }

    /// Repaint every airport as a dot.
    pub fn draw_base(&self) {
        let state = self.state.borrow();
        let Some(ctx) = state.ctx.as_ref() else { return };
        draw::clear(ctx, self.projection);
        draw::draw_dots(ctx, &state.projected);
    }

    /// Base map plus arcs from one airport to each destination index.
    pub fn highlight_destinations(&self, from: u32, dests: &[u32]) {
        self.draw_base();
        let state = self.state.borrow();
        let Some(ctx) = state.ctx.as_ref() else { return };
        let Some(&origin) = state.coords.get(from as usize) else { return };

        for &dest in dests {
            if let Some(&target) = state.coords.get(dest as usize) {
                draw::draw_arc(ctx, self.projection, origin, target, Palette::ARC, 1.0);
            }
        }
        for &dest in dests {
            if let Some(&point) = state.projected.get(dest as usize) {
                draw::draw_highlight(ctx, point);
            }
        }
        if let Some(&point) = state.projected.get(from as usize) {
            draw::draw_highlight(ctx, point);
        }
        self.status.set(format!("{} destinations shown", dests.len()));
    }

    /// Base map plus a searched itinerary drawn leg by leg.
    pub fn show_path(&self, path: &[u32]) {
        self.draw_base();
        let state = self.state.borrow();
        let Some(ctx) = state.ctx.as_ref() else { return };

        for pair in path.windows(2) {
            let (Some(&from), Some(&to)) = (
                state.coords.get(pair[0] as usize),
                state.coords.get(pair[1] as usize),
            ) else {
                continue;
            };
            draw::draw_arc(ctx, self.projection, from, to, Palette::PATH, 2.0);
        }
        for &index in path {
            if let Some(&point) = state.projected.get(index as usize) {
                draw::draw_highlight(ctx, point);
            }
        }
        self.status.set(format!(
            "itinerary with {} leg(s)",
            path.len().saturating_sub(1)
        ));
    }
}
