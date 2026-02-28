import { useState, useEffect, useCallback, useMemo } from "react";
import type maplibregl from "maplibre-gl";
import CoverMap from "./components/CoverMap";
import CoverModal from "./components/CoverModal";
import DatePicker from "./components/DatePicker";
import SearchBar from "./components/SearchBar";
import SearchMiniMap from "./components/SearchMiniMap";
import { findCoverByDate } from "./utils/coverLookup";
import type { CoverEntry } from "./utils/coverLookup";
import { initSearchIndex, searchCovers } from "./utils/searchIndex";
import "./styles/app.css";

const MIN_DATE = new Date(1946, 1, 21); // Feb 21, 1946
const MAX_DATE = new Date(2026, 1, 21); // Feb 21, 2026

export default function App() {
  const [covers, setCovers] = useState<CoverEntry[]>([]);
  const [selectedCover, setSelectedCover] = useState<CoverEntry | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [flyToIndex, setFlyToIndex] = useState<number | null>(null);
  const [searchReady, setSearchReady] = useState(false);
  const [searchResults, setSearchResults] = useState<Map<string, number> | null>(null);
  const [searchResultCount, setSearchResultCount] = useState<number | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Ordered list of cover indices that match the current search (chronological)
  const searchResultIndices = useMemo(() => {
    if (!searchResults || searchResults.size === 0) return [];
    const indices: number[] = [];
    for (let i = 0; i < covers.length; i++) {
      if (searchResults.has(covers[i].id)) indices.push(i);
    }
    return indices;
  }, [searchResults, covers]);

  // Current position within search results (-1 = none selected)
  const searchResultPos = useMemo(() => {
    if (searchResultIndices.length === 0 || !selectedCover) return -1;
    return searchResultIndices.indexOf(selectedIndex);
  }, [searchResultIndices, selectedIndex, selectedCover]);

  // Load cover data
  useEffect(() => {
    fetch("/fullCoversData.json")
      .then((r) => r.json())
      .then((data: CoverEntry[]) => setCovers(data));
  }, []);

  // Load search index
  useEffect(() => {
    initSearchIndex()
      .then(() => setSearchReady(true))
      .catch((err) => console.warn("Search index failed to load:", err));
  }, []);

  const handleCoverClick = useCallback(
    (cover: CoverEntry, index: number) => {
      setSelectedCover(cover);
      setSelectedIndex(index);
    },
    []
  );

  const handleDateSelect = useCallback(
    (date: Date) => {
      const cover = findCoverByDate(covers, date);
      if (cover) {
        const idx = covers.indexOf(cover);
        setFlyToIndex(idx);
        setSelectedCover(cover);
        setSelectedIndex(idx);
      }
    },
    [covers]
  );

  const handleFlyComplete = useCallback(() => {
    setFlyToIndex(null);
  }, []);

  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchResultCount(null);
      return;
    }
    const results = searchCovers(query);
    if (results === null) return; // index not ready
    const map = new Map(results.map((r) => [r.id + ".jpg", r.score]));
    setSearchResults(map.size > 0 ? map : new Map());
    setSearchResultCount(map.size);
  }, []);

  const handleMapReady = useCallback((m: maplibregl.Map) => {
    setMapInstance(m);
  }, []);

  const handleMiniMapNavigate = useCallback(
    (lng: number, lat: number) => {
      mapInstance?.flyTo({ center: [lng, lat], duration: 800 });
    },
    [mapInstance]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedCover(null);
  }, []);

  // Navigate: search results when search is active, otherwise all covers
  const handlePrev = useCallback(() => {
    if (searchResultIndices.length > 0) {
      const pos = searchResultIndices.indexOf(selectedIndex);
      if (pos > 0) {
        const newIndex = searchResultIndices[pos - 1];
        setSelectedIndex(newIndex);
        setSelectedCover(covers[newIndex]);
        setFlyToIndex(newIndex);
      }
    } else if (selectedIndex > 0) {
      const newIndex = selectedIndex - 1;
      setSelectedIndex(newIndex);
      setSelectedCover(covers[newIndex]);
      setFlyToIndex(newIndex);
    }
  }, [selectedIndex, covers, searchResultIndices]);

  const handleNext = useCallback(() => {
    if (searchResultIndices.length > 0) {
      const pos = searchResultIndices.indexOf(selectedIndex);
      if (pos < searchResultIndices.length - 1) {
        const newIndex = searchResultIndices[pos + 1];
        setSelectedIndex(newIndex);
        setSelectedCover(covers[newIndex]);
        setFlyToIndex(newIndex);
      }
    } else if (selectedIndex < covers.length - 1) {
      const newIndex = selectedIndex + 1;
      setSelectedIndex(newIndex);
      setSelectedCover(covers[newIndex]);
      setFlyToIndex(newIndex);
    }
  }, [selectedIndex, covers, searchResultIndices]);

  if (covers.length === 0) {
    return null; // Loading
  }

  // Build result label for modal: "Treffer 3 von 15"
  const resultLabel =
    searchResultIndices.length > 0 && searchResultPos >= 0
      ? `Treffer ${searchResultPos + 1} von ${searchResultIndices.length}`
      : undefined;

  // Determine if prev/next are available
  const hasPrev =
    searchResultIndices.length > 0
      ? searchResultPos > 0
      : selectedIndex > 0;
  const hasNext =
    searchResultIndices.length > 0
      ? searchResultPos >= 0 && searchResultPos < searchResultIndices.length - 1
      : selectedIndex < covers.length - 1;

  return (
    <div className="app">
      <CoverMap
        covers={covers}
        onCoverClick={handleCoverClick}
        flyToIndex={flyToIndex}
        onFlyComplete={handleFlyComplete}
        highlightedCovers={searchResults}
        onMapReady={handleMapReady}
      />

      <SearchBar
        onSearch={handleSearch}
        resultCount={searchResultCount}
        disabled={!searchReady}
      />

      <div className="overlay-card">
        <div className="overlay-card-inner">
          <p>
            Mit unserem Tool können Sie sich die Titelseite der Woche ansehen,
            in der Sie geboren wurden. Wählen Sie dafür erst das Jahr, dann den
            Monat, dann den Tag aus.
          </p>
          <DatePicker
            onDateSelect={handleDateSelect}
            minDate={MIN_DATE}
            maxDate={MAX_DATE}
          />
        </div>
      </div>

      <SearchMiniMap
        results={searchResults}
        covers={covers}
        mainMap={mapInstance}
        onNavigate={handleMiniMapNavigate}
      />

      <CoverModal
        cover={selectedCover}
        index={selectedIndex}
        totalCovers={covers.length}
        onClose={handleCloseModal}
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        resultLabel={resultLabel}
      />
    </div>
  );
}
