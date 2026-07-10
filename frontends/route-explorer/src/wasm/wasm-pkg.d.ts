// Ambient fallback typing for the wasm-pack output. When src/wasm/pkg/ has been built
// its own generated .d.ts wins; this keeps `tsc` green on a fresh clone where the pkg
// (a gitignored build artifact) does not exist yet.
declare module "*/wasm/pkg/wasm_map.js" {
  export default function init(): Promise<unknown>;
  export class RouteMap {
    constructor(
      host: HTMLElement,
      lats: Float32Array,
      lons: Float32Array,
      onPick: (index: number) => void,
    );
    draw_base(): void;
    highlight_destinations(from: number, dests: Uint32Array): void;
    show_path(path: Uint32Array): void;
    zoom_in(): void;
    zoom_out(): void;
    reset_view(): void;
    free(): void;
  }
}
