import { useState, useRef, useEffect, useCallback } from "react";
import "../styles/search.css";

interface SearchBarProps {
  onSearch: (query: string) => void;
  resultCount: number | null; // null = index not ready, 0+ = result count
  disabled?: boolean;
}

export default function SearchBar({
  onSearch,
  resultCount,
  disabled,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(value), 300);
    },
    [onSearch]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    clearTimeout(timerRef.current);
    onSearch("");
  }, [onSearch]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="search-bar">
      <div className="search-bar-inner">
        {/* Search icon */}
        <svg
          className="search-bar-icon"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="13" y1="13" x2="18" y2="18" />
        </svg>

        <input
          className="search-bar-input"
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Titelseiten durchsuchen…"
          disabled={disabled}
        />

        {query && resultCount !== null && (
          <span className="search-bar-badge">
            {resultCount} {resultCount === 1 ? "Treffer" : "Treffer"}
          </span>
        )}

        {query && (
          <button
            type="button"
            className="search-bar-clear"
            onClick={handleClear}
            title="Suche zurücksetzen"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
