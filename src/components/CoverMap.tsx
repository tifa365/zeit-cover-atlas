import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../styles/map.css";
import type { CoverEntry } from "../utils/coverLookup";
import { formatGermanDate } from "../utils/coverLookup";
import { COLS, CELL_W, CELL_H, GAP, TOTAL_ROWS, GRID_TOP_LAT, coverToGridCoords } from "../utils/grid";
import { loadHiResCovers } from "../utils/spriteLoader";
import { SearchFlightController } from "../utils/searchFlight";

interface CoverMapProps {
  covers: CoverEntry[];
  onCoverClick: (cover: CoverEntry, index: number) => void;
  flyToIndex: number | null;
  onFlyComplete?: () => void;
  highlightedCovers: Map<string, number> | null; // id → score, null = no search active
  onMapReady?: (map: maplibregl.Map) => void;
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
  const [hoveredCover, setHoveredCover] = useState<{
    issue: string; start: string; x: number; y: number;
  } | null>(null);

  // Search state machine controller
  const searchFlight = useRef(new SearchFlightController());

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

    // Hover tooltip — use mousemove to track position and feature
    let hoveredId: string | null = null;
    m.on("mousemove", "cover-rects-fill", (e) => {
      m.getCanvas().style.cursor = "pointer";
      const props = e.features?.[0]?.properties;
      if (!props) return;
      hoveredId = props.id as string;
      setHoveredCover({
        issue: props.issue as string,
        start: props.start as string,
        x: e.point.x,
        y: e.point.y,
      });
    });
    m.on("mouseleave", "cover-rects-fill", () => {
      m.getCanvas().style.cursor = "";
      hoveredId = null;
      setHoveredCover(null);
    });
    m.on("mousedown", "cover-rects-fill", () => {
      hoveredId = null;
      setHoveredCover(null);
    });

    // Swap in hi-res on move end — never while search is active
    m.on("moveend", () => {
      if (!searchFlight.current.isActive) {
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

  // Search state machine — delegated to SearchFlightController
  useEffect(() => {
    searchFlight.current.reset();

    if (!map.current || !mapLoaded || !map.current.isStyleLoaded()) return;

    searchFlight.current.update(
      map.current,
      highlightedCovers,
      covers,
      fadeOverlayRef.current
    );

    return () => {
      searchFlight.current.reset();
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
      {hoveredCover && (() => {
        const [y, n] = hoveredCover.issue.split("/");
        return (
          <div
            className="cover-tooltip"
            style={{ left: hoveredCover.x, top: hoveredCover.y }}
          >
            <strong>Ausgabe {n} / {y}</strong>
            <span>{formatGermanDate(hoveredCover.start)}</span>
            <span className="cover-tooltip-hint">Details bei Klick auf Cover</span>
          </div>
        );
      })()}
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

