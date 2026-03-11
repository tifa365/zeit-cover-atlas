import type maplibregl from "maplibre-gl";
import type { CoverEntry } from "./coverLookup";
import { getCoverUrl } from "./coverUrl";
import { COLS, CELL_W, CELL_H, GAP, TOTAL_ROWS, GRID_TOP_LAT, coverToGridCoords } from "./grid";

const base = import.meta.env.BASE_URL;

/** Track loaded row sprites and hi-res individual covers */
export const rowSpritesLoaded = new Set<number>();
export const hiResLoaded = new Set<number>();

/** Reset all tracking sets (call on map teardown) */
export function resetLoadedSprites(): void {
  rowSpritesLoaded.clear();
  hiResLoaded.clear();
}

/** Toggle visibility of all loaded raster layers (row sprites + hi-res) */
export function setRasterLayersVisible(map: maplibregl.Map, visible: boolean): void {
  const val = visible ? "visible" : "none";
  for (const r of rowSpritesLoaded) {
    const id = `row-sprite-${r}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", val);
  }
  for (const i of hiResLoaded) {
    const id = `cover-hires-${i}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", val);
  }
}

/**
 * Three-tier image loading:
 * 1) Full-grid sprite (always on) — 60×86 thumbs, ~4.4MB single load
 * 2) Row sprites (zoom ≥ 8) — 120×172 (2×), ~280KB each, only visible rows
 * 3) Full-res individual covers (zoom ≥ 11) — only visible cells
 */
export function loadHiResCovers(map: maplibregl.Map, covers: CoverEntry[]): void {
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  const rowStep = CELL_H + GAP;
  const colStep = CELL_W + GAP;
  const lngSpan = bounds.getEast() - bounds.getWest();
  const latSpan = bounds.getNorth() - bounds.getSouth();
  const marginLat = latSpan * 0.5;
  const marginLng = lngSpan * 0.5;
  const minLat = bounds.getSouth() - marginLat;
  const maxLat = bounds.getNorth() + marginLat;
  const minLng = bounds.getWest() - marginLng;
  const maxLng = bounds.getEast() + marginLng;

  const minRow = Math.max(0, Math.floor((GRID_TOP_LAT - maxLat) / rowStep));
  const maxRow = Math.min(TOTAL_ROWS - 1, Math.ceil((GRID_TOP_LAT - minLat) / rowStep));

  // --- Tier 2: Row sprites (2× resolution) — always load for visible rows ---
  {
    // Remove off-screen row sprites
    for (const r of rowSpritesLoaded) {
      if (r < minRow || r > maxRow) {
        const id = `row-sprite-${r}`;
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
        rowSpritesLoaded.delete(r);
      }
    }
    // Add visible row sprites
    for (let r = minRow; r <= maxRow; r++) {
      if (rowSpritesLoaded.has(r)) continue;
      const [, rowLat] = coverToGridCoords(r * COLS);
      const [lastColLng] = coverToGridCoords(r * COLS + COLS - 1);
      const id = `row-sprite-${r}`;
      map.addSource(id, {
        type: "image",
        url: `${base}row-sprites/row-${r}.webp`,
        coordinates: [
          [0 - CELL_W / 2, rowLat + CELL_H / 2],
          [lastColLng + CELL_W / 2, rowLat + CELL_H / 2],
          [lastColLng + CELL_W / 2, rowLat - CELL_H / 2],
          [0 - CELL_W / 2, rowLat - CELL_H / 2],
        ],
      });
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-fade-duration": 200 } }, "cover-rects-dim");
      rowSpritesLoaded.add(r);
    }
  }

  // --- Tier 3: Full-res individual covers ---
  if (zoom < 11) {
    for (const i of hiResLoaded) {
      const id = `cover-hires-${i}`;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }
    hiResLoaded.clear();
    return;
  }

  // Remove off-screen hi-res
  for (const i of hiResLoaded) {
    const [lng, lat] = coverToGridCoords(i);
    if (
      lng + CELL_W / 2 < minLng || lng - CELL_W / 2 > maxLng ||
      lat + CELL_H / 2 < minLat || lat - CELL_H / 2 > maxLat
    ) {
      const id = `cover-hires-${i}`;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      hiResLoaded.delete(i);
    }
  }

  // Add hi-res for visible cells
  const minCol = Math.max(0, Math.floor(minLng / colStep));
  const maxCol = Math.min(COLS - 1, Math.ceil(maxLng / colStep));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const i = row * COLS + col;
      if (i >= covers.length || hiResLoaded.has(i)) continue;

      const [lng, lat] = coverToGridCoords(i);
      const sourceId = `cover-hires-${i}`;

      map.addSource(sourceId, {
        type: "image",
        url: getCoverUrl(covers[i].id),
        coordinates: [
          [lng - CELL_W / 2, lat + CELL_H / 2],
          [lng + CELL_W / 2, lat + CELL_H / 2],
          [lng + CELL_W / 2, lat - CELL_H / 2],
          [lng - CELL_W / 2, lat - CELL_H / 2],
        ],
      });

      map.addLayer({
        id: sourceId,
        type: "raster",
        source: sourceId,
        paint: { "raster-fade-duration": 300 },
      }, "cover-rects-dim");

      hiResLoaded.add(i);
    }
  }
}
