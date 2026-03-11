import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import type { CoverEntry } from "../utils/coverLookup";
import { COLS, CELL_W, CELL_H, TOTAL_ROWS, coverToGridCoords } from "../utils/grid";
import "../styles/search-minimap.css";

interface SearchMiniMapProps {
  results: Map<string, number> | null;
  covers: CoverEntry[];
  mainMap: maplibregl.Map | null;
  onNavigate: (lng: number, lat: number) => void;
}

export default function SearchMiniMap({
  results,
  covers,
  mainMap,
  onNavigate,
}: SearchMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const miniMap = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  // Compute full grid bounds
  const [lng0] = coverToGridCoords(0);
  const [lngLast] = coverToGridCoords(COLS - 1);
  const [, latTop] = coverToGridCoords(0);
  const [, latBot] = coverToGridCoords((TOTAL_ROWS - 1) * COLS);
  const gridLeft = lng0 - CELL_W / 2;
  const gridRight = lngLast + CELL_W / 2;
  const gridTop = latTop + CELL_H / 2;
  const gridBottom = latBot - CELL_H / 2;

  // Initialize mini-map once
  useEffect(() => {
    if (!containerRef.current || miniMap.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#111" },
          },
        ],
      },
      center: [(gridLeft + gridRight) / 2, (gridTop + gridBottom) / 2],
      zoom: 0,
      interactive: false, // we handle clicks ourselves
      attributionControl: false,
    });

    m.on("load", () => {
      // Faint grid sprite as background
      m.addSource("covers-sprite", {
        type: "image",
        url: "/covers-sprite.webp",
        coordinates: [
          [gridLeft, gridTop],
          [gridRight, gridTop],
          [gridRight, gridBottom],
          [gridLeft, gridBottom],
        ],
      });
      m.addLayer({
        id: "covers-sprite",
        type: "raster",
        source: "covers-sprite",
        paint: { "raster-opacity": 0.3, "raster-fade-duration": 0 },
      });

      // Match highlights layer (empty initially)
      m.addSource("match-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "match-dots",
        type: "circle",
        source: "match-points",
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#ec5150",
          "circle-opacity": 0.9,
        },
      });

      // Viewport rectangle layer
      m.addSource("viewport-rect", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "viewport-rect-fill",
        type: "fill",
        source: "viewport-rect",
        paint: { "fill-color": "#fff", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "viewport-rect-line",
        type: "line",
        source: "viewport-rect",
        paint: { "line-color": "#fff", "line-width": 1.5, "line-opacity": 0.6 },
      });

      // Fit to grid
      m.fitBounds(
        [[gridLeft, gridBottom], [gridRight, gridTop]],
        { padding: 4, duration: 0 }
      );

      setReady(true);
    });

    miniMap.current = m;

    return () => {
      m.remove();
      miniMap.current = null;
    };
  }, []);

  // Update match highlights
  useEffect(() => {
    if (!miniMap.current || !ready) return;
    const m = miniMap.current;

    if (!results || results.size === 0) {
      (m.getSource("match-points") as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const features = [];
    for (let i = 0; i < covers.length; i++) {
      if (!results.has(covers[i].id)) continue;
      const [lng, lat] = coverToGridCoords(i);
      features.push({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
      });
    }

    (m.getSource("match-points") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });
  }, [results, covers, ready]);

  // Sync viewport rectangle from main map
  useEffect(() => {
    if (!mainMap || !miniMap.current || !ready) return;
    const m = miniMap.current;

    function updateViewport() {
      if (!mainMap || !m) return;
      const bounds = mainMap.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      (m.getSource("viewport-rect") as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[
                [sw.lng, sw.lat],
                [ne.lng, sw.lat],
                [ne.lng, ne.lat],
                [sw.lng, ne.lat],
                [sw.lng, sw.lat],
              ]],
            },
          },
        ],
      });
    }

    updateViewport();
    mainMap.on("move", updateViewport);
    return () => {
      mainMap.off("move", updateViewport);
    };
  }, [mainMap, ready]);

  // Handle click → navigate main map
  function handleClick(e: React.MouseEvent) {
    if (!miniMap.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lngLat = miniMap.current.unproject([x, y]);
    onNavigate(lngLat.lng, lngLat.lat);
  }

  return (
    <div
      className={`search-minimap visible`}
      onClick={handleClick}
    >
      <div ref={containerRef} className="search-minimap-canvas" />
    </div>
  );
}
