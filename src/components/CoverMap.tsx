import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../styles/map.css";
import type { CoverEntry } from "../utils/coverLookup";
import { getCoverUrl } from "../utils/coverUrl";

// Grid layout constants – keep near equator to avoid Mercator distortion
const COLS = 53; // ~weeks per year
const CELL_W = 0.3; // longitude units per cell
const CELL_H = 0.429; // latitude units per cell (7:10 aspect ratio)
const GAP = 0.003; // hairline gap

interface CoverMapProps {
  covers: CoverEntry[];
  onCoverClick: (cover: CoverEntry, index: number) => void;
  flyToIndex: number | null;
  onFlyComplete?: () => void;
  highlightedCovers: Map<string, number> | null; // id → score, null = no search active
  onMapReady?: (map: maplibregl.Map) => void;
}

// Pre-compute grid origin so the grid is centred at lat=0
const TOTAL_ROWS = 79; // ceil(4187 / 53)
const GRID_H = TOTAL_ROWS * (CELL_H + GAP);
const GRID_TOP_LAT = GRID_H / 2; // ≈ +17 (well within low-distortion zone)

export const GRID_COLS = COLS;

export function coverToGridCoords(index: number): [number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const lng = col * (CELL_W + GAP);
  const lat = GRID_TOP_LAT - row * (CELL_H + GAP);
  return [lng, lat];
}

export default function CoverMap({
  covers,
  onCoverClick,
  flyToIndex,
  onFlyComplete,
  highlightedCovers,
  onMapReady,
}: CoverMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Search state machine: idle → settling → flying → idle
  const searchPhase = useRef<"idle" | "settling" | "flying">("idle");
  const searchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const searchActiveRef = useRef(false);

  // Fade-cut overlay for flicker-free "fly" to search results
  const fadeOverlayRef = useRef<HTMLDivElement>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Show ~32 columns filling the full screen width, centred on the 90s
    const VISIBLE_COLS = 32;
    const visibleLng = VISIBLE_COLS * (CELL_W + GAP);
    const gridW = COLS * (CELL_W + GAP);
    const centerLng = gridW / 2;

    // Row ~64 ≈ 2010 (colourful covers)
    const row2010 = 64;
    const lat2010 = GRID_TOP_LAT - row2010 * (CELL_H + GAP);

    // Calculate zoom so visibleLng fills the container pixel width
    const containerW = mapContainer.current.clientWidth;
    const containerH = mapContainer.current.clientHeight;
    const zoom = Math.log2((containerW * 360) / (visibleLng * 256)) - 1;

    // Offset center so the top row is fully visible and any clipping is at the bottom
    // Visible lat span ≈ containerH / containerW * visibleLng
    const visibleLat = (containerH / containerW) * visibleLng;
    // Shift center down by half a cell so the topmost row isn't cut off
    const centerLat = lat2010 - (CELL_H + GAP) / 2;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#000",
            },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom,
      minZoom: zoom - 2,
      maxZoom: zoom + 1,
      cooperativeGestures: false,
      attributionControl: false,
    });

    m.on("load", () => {
      // Clickable cover rectangles (invisible, on top for hit-testing)
      // Extend each rect by GAP/2 so adjacent polygons overlap,
      // preventing bright sprite bleed-through in gap areas when dimmed
      const halfW = (CELL_W + GAP) / 2;
      const halfH = (CELL_H + GAP) / 2;
      const rectFeatures = covers.map((cover, i) => {
        const [lng, lat] = coverToGridCoords(i);
        return {
          type: "Feature" as const,
          properties: { index: i, id: cover.id, issue: cover.issue, start: cover.start },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[
              [lng - halfW, lat - halfH],
              [lng + halfW, lat - halfH],
              [lng + halfW, lat + halfH],
              [lng - halfW, lat + halfH],
              [lng - halfW, lat - halfH],
            ]],
          },
        };
      });

      m.addSource("cover-rects", {
        type: "geojson",
        data: { type: "FeatureCollection", features: rectFeatures },
      });

      // Sprite image covering the entire grid — one load for all 4187 covers
      const lastCol = COLS - 1;
      const lastRow = TOTAL_ROWS - 1;
      const [lng0] = coverToGridCoords(0);           // first col center
      const [lngN] = coverToGridCoords(lastCol);     // last col center
      const [, latTop] = coverToGridCoords(0);        // first row center
      const [, latBot] = coverToGridCoords(lastRow * COLS); // last row center

      const spriteLeft = lng0 - CELL_W / 2;
      const spriteRight = lngN + CELL_W / 2;
      const spriteTop = latTop + CELL_H / 2;
      const spriteBottom = latBot - CELL_H / 2;

      m.addSource("covers-sprite", {
        type: "image",
        url: "/covers-sprite.webp",
        coordinates: [
          [spriteLeft, spriteTop],      // top-left
          [spriteRight, spriteTop],     // top-right
          [spriteRight, spriteBottom],  // bottom-right
          [spriteLeft, spriteBottom],   // bottom-left
        ],
      });

      m.addLayer({
        id: "covers-sprite",
        type: "raster",
        source: "covers-sprite",
        paint: { "raster-fade-duration": 0 },
      });

      // Black edge strips to hide raster interpolation artifacts at sprite borders
      const EDGE_W = GAP * 3; // thin strip width
      m.addSource("edge-strips", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            // Left edge strip
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [[
                  [spriteLeft - EDGE_W, spriteTop + EDGE_W],
                  [spriteLeft + EDGE_W, spriteTop + EDGE_W],
                  [spriteLeft + EDGE_W, spriteBottom - EDGE_W],
                  [spriteLeft - EDGE_W, spriteBottom - EDGE_W],
                  [spriteLeft - EDGE_W, spriteTop + EDGE_W],
                ]],
              },
            },
            // Right edge strip
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [[
                  [spriteRight - EDGE_W, spriteTop + EDGE_W],
                  [spriteRight + EDGE_W, spriteTop + EDGE_W],
                  [spriteRight + EDGE_W, spriteBottom - EDGE_W],
                  [spriteRight - EDGE_W, spriteBottom - EDGE_W],
                  [spriteRight - EDGE_W, spriteTop + EDGE_W],
                ]],
              },
            },
          ],
        },
      });
      m.addLayer({
        id: "edge-strips",
        type: "fill",
        source: "edge-strips",
        paint: { "fill-color": "#000", "fill-opacity": 1, "fill-antialias": false },
      });

      // Dim layer: darkens non-matching covers during search
      m.addLayer({
        id: "cover-rects-dim",
        type: "fill",
        source: "cover-rects",
        paint: {
          "fill-color": "#000",
          "fill-antialias": false,
          "fill-opacity": ["coalesce", ["get", "dimmed"], 0],
          "fill-opacity-transition": { duration: 600, delay: 0 },
        },
      });

      // Highlight border on matched covers
      m.addLayer({
        id: "cover-rects-highlight",
        type: "line",
        source: "cover-rects",
        paint: {
          "line-color": "#ec5150",
          "line-width": 2,
          "line-opacity": ["coalesce", ["get", "highlighted"], 0],
          "line-opacity-transition": { duration: 500, delay: 0 },
        },
      });

      // Invisible fill layer on top for click hit-testing
      m.addLayer({
        id: "cover-rects-fill",
        type: "fill",
        source: "cover-rects",
        paint: { "fill-color": "#000", "fill-opacity": 0 },
      });

      // Progressively swap in hi-res images when zoomed in
      loadHiResCovers(m, covers);

      setMapLoaded(true);
      onMapReady?.(m);
    });

    // Handle click on cover rectangles
    m.on("click", "cover-rects-fill", (e) => {
      if (e.features && e.features[0]) {
        const props = e.features[0].properties;
        if (props) {
          const idx = props.index as number;
          onCoverClick(covers[idx], idx);
        }
      }
    });

    // Cursor pointer on hover
    m.on("mouseenter", "cover-rects-fill", () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", "cover-rects-fill", () => {
      m.getCanvas().style.cursor = "";
    });

    // Swap in hi-res on move end — never while search is active
    m.on("moveend", () => {
      if (!searchActiveRef.current) {
        loadHiResCovers(m, covers);
      }
    });

    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  }, [covers]);

  // Fly to a specific cover
  useEffect(() => {
    if (flyToIndex === null || !map.current || !mapLoaded) return;
    const [lng, lat] = coverToGridCoords(flyToIndex);
    map.current.flyTo({
      center: [lng, lat],
      zoom: 12,
      duration: 1500,
    });
    map.current.once("moveend", () => {
      onFlyComplete?.();
    });
  }, [flyToIndex, mapLoaded]);

  // ── Search state machine: idle → settling → flying → idle ──
  //
  // 1. Search results arrive → apply dim/highlight (settling)
  // 2. Wait for fade to complete (600ms transition + 400ms extra)
  // 3. Start flyTo if needed (flying) — ZERO style/source changes
  // 4. On moveend → back to idle, resume normal loading
  //
  useEffect(() => {
    // Clear any pending timers from previous search
    for (const t of searchTimers.current) clearTimeout(t);
    searchTimers.current = [];

    if (!map.current || !mapLoaded || !map.current.isStyleLoaded()) return;
    const m = map.current;

    // Helper: toggle visibility of all loaded raster layers
    function setRasterLayersVisible(visible: boolean) {
      const val = visible ? "visible" : "none";
      for (const r of rowSpritesLoaded) {
        const id = `row-sprite-${r}`;
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", val);
      }
      for (const i of hiResLoaded) {
        const id = `cover-hires-${i}`;
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", val);
      }
    }

    if (highlightedCovers === null || highlightedCovers.size === 0) {
      // ── IDLE: clear search ──
      searchActiveRef.current = false;
      searchPhase.current = "idle";
      m.setPaintProperty("cover-rects-dim", "fill-opacity", 0);
      m.setPaintProperty("cover-rects-highlight", "line-opacity", 0);
      setRasterLayersVisible(true); // show them again
      loadHiResCovers(m, covers);
      return;
    }

    // ── SETTLING: apply dim/highlight, hide raster layers ──
    searchActiveRef.current = true;
    searchPhase.current = "settling";
    setRasterLayersVisible(false); // hide — only base sprite remains

    const matchIds = Array.from(highlightedCovers.keys());

    m.setPaintProperty("cover-rects-dim", "fill-opacity", [
      "case",
      ["in", ["get", "id"], ["literal", matchIds]],
      0,
      0.7,
    ]);
    m.setPaintProperty("cover-rects-highlight", "line-opacity", [
      "case",
      ["in", ["get", "id"], ["literal", matchIds]],
      1,
      0,
    ]);

    // Wait for the fade transition to fully complete before anything else
    const SETTLE_DELAY = 1000; // 600ms transition + 400ms extra cushion

    const settleTimer = setTimeout(() => {
      if (!map.current || searchPhase.current !== "settling") return;

      // Check if any match is already visible — if so, skip fly
      const bounds = map.current.getBounds();
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
        // Matches already visible — stay put, go idle
        searchPhase.current = "idle";
        return;
      }

      // ── FLYING: fade-cut-jump (no animated camera = no tile churn) ──
      searchPhase.current = "flying";
      const overlay = fadeOverlayRef.current;
      if (!overlay || !map.current) {
        searchPhase.current = "idle";
        return;
      }

      // 1. Fade overlay to opaque black
      overlay.style.transition = "opacity 300ms ease-out";
      overlay.style.opacity = "1";

      const [lng, lat] = coverToGridCoords(firstMatchIndex);

      const fadeInTimer = setTimeout(() => {
        if (!map.current) return;

        // 2. Instant jump while overlay hides everything
        map.current.jumpTo({ center: [lng, lat] });

        // 3. Wait for tiles to settle, then fade overlay out
        map.current.once("idle", () => {
          if (!overlay) return;
          overlay.style.transition = "opacity 500ms ease-in";
          overlay.style.opacity = "0";
          searchPhase.current = "idle";
        });
      }, 350); // slightly longer than fade duration to ensure fully opaque

      searchTimers.current.push(fadeInTimer);
    }, SETTLE_DELAY);

    searchTimers.current.push(settleTimer);

    return () => {
      for (const t of searchTimers.current) clearTimeout(t);
      searchTimers.current = [];
    };
  }, [highlightedCovers, mapLoaded, covers]);

  return (
    <div className="map-container">
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      <div
        ref={fadeOverlayRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "#000",
          opacity: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {map.current && <ZoomControls map={map.current} />}
    </div>
  );
}

function ZoomControls({ map }: { map: maplibregl.Map }) {
  return (
    <div className="zoom-controls">
      <button
        type="button"
        title="Heranzoomen"
        onClick={() => map.zoomIn()}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19.2746684,18 L23.7360075,22.4613403 C24.0879975,22.81333 24.0879975,23.3840175 23.7360075,23.7360072 C23.3840176,24.0879987 22.8133291,24.0879987 22.4613391,23.7360072 L18,19.2746694 L13.5386609,23.7360072 C13.1866709,24.0879987 12.6159824,24.0879987 12.2639925,23.7360072 C11.9120025,23.3840175 11.9120025,22.81333 12.2639925,22.4613403 L16.7253316,18 L12.2639925,13.538661 C11.9120025,13.1866713 11.9120025,12.6159837 12.2639925,12.2639923 C12.6159824,11.9120026 13.1866709,11.9120026 13.5386609,12.2639923 L18,16.7253319 L22.4613391,12.2639923 C22.8133291,11.9120026 23.3840176,11.9120026 23.7360075,12.2639923 C24.0879975,12.6159837 24.0879975,13.1866713 23.7360075,13.538661 L19.2746684,18 Z"
            fill="#44444C"
            fillRule="nonzero"
            transform="translate(18, 18) rotate(-315) translate(-18, -18)"
          />
        </svg>
      </button>
      <button
        type="button"
        title="Herauszoomen"
        onClick={() => map.zoomOut()}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M13.5386609,23.7360072 C13.1866709,24.0879987 12.6159824,24.0879987 12.2639925,23.7360072 C11.9120025,23.3840175 11.9120025,22.81333 12.2639925,22.4613403 L22.4613391,12.2639923 C22.8133291,11.9120026 23.3840176,11.9120026 23.7360075,12.2639923 C24.0879975,12.6159837 24.0879975,13.1866713 23.7360075,13.538661 L13.5386609,23.7360072 Z"
            fill="#44444C"
            fillRule="nonzero"
            transform="translate(18, 18) rotate(-315) translate(-18, -18)"
          />
        </svg>
      </button>
    </div>
  );
}

/** Track loaded row sprites and hi-res individual covers */
const rowSpritesLoaded = new Set<number>();
const hiResLoaded = new Set<number>();

/**
 * Three-tier image loading:
 * 1) Full-grid sprite (always on) — 60×86 thumbs, ~4.4MB single load
 * 2) Row sprites (zoom ≥ 8) — 120×172 (2×), ~280KB each, only visible rows
 * 3) Full-res individual covers (zoom ≥ 11) — only visible cells
 */
function loadHiResCovers(map: maplibregl.Map, covers: CoverEntry[]) {
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
        url: `/row-sprites/row-${r}.webp`,
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
