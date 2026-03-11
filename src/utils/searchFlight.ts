import type maplibregl from "maplibre-gl";
import type { CoverEntry } from "./coverLookup";
import { coverToGridCoords } from "./grid";
import { loadHiResCovers, setRasterLayersVisible } from "./spriteLoader";

type Phase = "idle" | "settling" | "flying";

/**
 * Search state machine: idle → settling → flying → idle
 *
 * 1. Search results arrive → apply dim/highlight (settling)
 * 2. Wait for fade transition to complete (600ms + 400ms cushion)
 * 3. Start fade-cut-jump if needed (flying) — ZERO style/source changes during fly
 * 4. On map idle → back to idle, resume normal loading
 */
export class SearchFlightController {
  private phase: Phase = "idle";
  private timers: ReturnType<typeof setTimeout>[] = [];
  private _isActive = false;

  get isActive(): boolean {
    return this._isActive;
  }

  reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.phase = "idle";
    this._isActive = false;
  }

  update(
    map: maplibregl.Map,
    highlightedCovers: Map<string, number> | null,
    covers: CoverEntry[],
    fadeOverlay: HTMLDivElement | null
  ): void {
    // Clear any pending timers from previous search
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];

    if (!map.isStyleLoaded()) return;

    if (highlightedCovers === null || highlightedCovers.size === 0) {
      // ── IDLE: clear search ──
      this._isActive = false;
      this.phase = "idle";
      map.setPaintProperty("cover-rects-dim", "fill-opacity", 0);
      map.setPaintProperty("cover-rects-highlight", "line-opacity", 0);
      setRasterLayersVisible(map, true);
      loadHiResCovers(map, covers);
      return;
    }

    // ── SETTLING: apply dim/highlight, hide raster layers ──
    this._isActive = true;
    this.phase = "settling";
    setRasterLayersVisible(map, false);

    const matchIds = Array.from(highlightedCovers.keys());

    map.setPaintProperty("cover-rects-dim", "fill-opacity", [
      "case",
      ["in", ["get", "id"], ["literal", matchIds]],
      0,
      0.7,
    ]);
    map.setPaintProperty("cover-rects-highlight", "line-opacity", [
      "case",
      ["in", ["get", "id"], ["literal", matchIds]],
      1,
      0,
    ]);

    // Wait for the fade transition to fully complete before anything else
    const SETTLE_DELAY = 1000; // 600ms transition + 400ms extra cushion

    const settleTimer = setTimeout(() => {
      if (this.phase !== "settling") return;

      // Check if any match is already visible — if so, skip fly
      const bounds = map.getBounds();
      let firstMatchIndex = -1;
      let anyVisible = false;

      for (let i = 0; i < covers.length; i++) {
        if (!highlightedCovers.has(covers[i].id)) continue;
        if (firstMatchIndex === -1) firstMatchIndex = i;
        const [lng, lat] = coverToGridCoords(i);
        if (
          lng >= bounds.getWest() && lng <= bounds.getEast() &&
          lat >= bounds.getSouth() && lat <= bounds.getNorth()
        ) {
          anyVisible = true;
          break;
        }
      }

      if (anyVisible || firstMatchIndex === -1) {
        this.phase = "idle";
        return;
      }

      // ── FLYING: fade-cut-jump (no animated camera = no tile churn) ──
      this.phase = "flying";
      if (!fadeOverlay) {
        this.phase = "idle";
        return;
      }

      // 1. Fade overlay to opaque black
      fadeOverlay.style.transition = "opacity 300ms ease-out";
      fadeOverlay.style.opacity = "1";

      const [lng, lat] = coverToGridCoords(firstMatchIndex);

      const fadeInTimer = setTimeout(() => {
        // 2. Instant jump while overlay hides everything
        map.jumpTo({ center: [lng, lat] });

        // 3. Wait for tiles to settle, then fade overlay out
        map.once("idle", () => {
          if (!fadeOverlay) return;
          fadeOverlay.style.transition = "opacity 500ms ease-in";
          fadeOverlay.style.opacity = "0";
          this.phase = "idle";
        });
      }, 350);

      this.timers.push(fadeInTimer);
    }, SETTLE_DELAY);

    this.timers.push(settleTimer);
  }
}
