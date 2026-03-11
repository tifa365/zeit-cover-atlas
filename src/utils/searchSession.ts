import type { CoverEntry } from "./coverLookup";

/**
 * Build an ordered list of cover indices that match the current search (chronological).
 */
export function buildSearchResultIndices(
  covers: CoverEntry[],
  searchResults: Map<string, number> | null
): number[] {
  if (!searchResults || searchResults.size === 0) return [];
  const indices: number[] = [];
  for (let i = 0; i < covers.length; i++) {
    if (searchResults.has(covers[i].id)) indices.push(i);
  }
  return indices;
}

/**
 * Find the current position within search results (-1 = not found / none selected).
 */
export function getSearchResultPos(
  searchResultIndices: number[],
  selectedIndex: number,
  hasSelectedCover: boolean
): number {
  if (searchResultIndices.length === 0 || !hasSelectedCover) return -1;
  return searchResultIndices.indexOf(selectedIndex);
}

/**
 * Navigate to previous cover. Returns new index or null if can't navigate.
 * When search is active, navigates within search results; otherwise navigates all covers.
 */
export function navigatePrev(
  selectedIndex: number,
  coversLength: number,
  searchResultIndices: number[]
): number | null {
  if (searchResultIndices.length > 0) {
    const pos = searchResultIndices.indexOf(selectedIndex);
    if (pos > 0) return searchResultIndices[pos - 1];
  } else if (selectedIndex > 0) {
    return selectedIndex - 1;
  }
  return null;
}

/**
 * Navigate to next cover. Returns new index or null if can't navigate.
 * When search is active, navigates within search results; otherwise navigates all covers.
 */
export function navigateNext(
  selectedIndex: number,
  coversLength: number,
  searchResultIndices: number[]
): number | null {
  if (searchResultIndices.length > 0) {
    const pos = searchResultIndices.indexOf(selectedIndex);
    if (pos >= 0 && pos < searchResultIndices.length - 1) return searchResultIndices[pos + 1];
  } else if (selectedIndex < coversLength - 1) {
    return selectedIndex + 1;
  }
  return null;
}

/**
 * Build result label for modal: "Treffer 3 von 15"
 */
export function buildResultLabel(
  searchResultIndices: number[],
  searchResultPos: number
): string | undefined {
  if (searchResultIndices.length > 0 && searchResultPos >= 0) {
    return `Treffer ${searchResultPos + 1} von ${searchResultIndices.length}`;
  }
  return undefined;
}

/**
 * Determine if prev navigation is available.
 */
export function computeHasPrev(
  selectedIndex: number,
  searchResultIndices: number[],
  searchResultPos: number
): boolean {
  return searchResultIndices.length > 0
    ? searchResultPos > 0
    : selectedIndex > 0;
}

/**
 * Determine if next navigation is available.
 */
export function computeHasNext(
  selectedIndex: number,
  coversLength: number,
  searchResultIndices: number[],
  searchResultPos: number
): boolean {
  return searchResultIndices.length > 0
    ? searchResultPos >= 0 && searchResultPos < searchResultIndices.length - 1
    : selectedIndex < coversLength - 1;
}
