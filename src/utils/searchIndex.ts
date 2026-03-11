import MiniSearch from "minisearch";

interface OcrEntry {
  id: string;
  headline: string;
  allText: string;
  confidence: number;
}

let miniSearch: MiniSearch<OcrEntry> | null = null;

/**
 * Fetch the OCR index and build the MiniSearch instance.
 * Returns a promise that resolves when the index is ready.
 */
export async function initSearchIndex(): Promise<void> {
  const response = await fetch(`${import.meta.env.BASE_URL}search-data/ocr-index.json`);
  const entries: OcrEntry[] = await response.json();

  miniSearch = new MiniSearch<OcrEntry>({
    fields: ["headline", "allText"],
    storeFields: ["id", "headline", "confidence"],
    searchOptions: {
      boost: { headline: 3 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  miniSearch.addAll(
    entries.map((entry, i) => ({ ...entry, _msId: i, id: entry.id }))
  );
}

export interface SearchResult {
  id: string;
  score: number;
}

/**
 * Search covers by query string.
 * Returns array of { id, score } sorted by relevance (highest first).
 * Returns null if index not yet loaded, or empty array if no matches.
 */
export function searchCovers(query: string): SearchResult[] | null {
  if (!miniSearch) return null;
  if (!query.trim()) return [];

  const results = miniSearch.search(query);
  return results.map((r) => ({ id: r.id, score: r.score }));
}
