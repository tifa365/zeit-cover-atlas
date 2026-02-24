export interface CoverEntry {
  id: string;
  issue: string;
  start: string;
  end: string;
}

export function findCoverByDate(
  covers: CoverEntry[],
  date: Date
): CoverEntry | null {
  const dateStr = toISODate(date);

  for (const cover of covers) {
    if (dateStr >= cover.start && dateStr < cover.end) {
      return cover;
    }
  }

  // If before first issue or after last, return closest boundary
  if (covers.length > 0) {
    if (dateStr < covers[0].start) return covers[0];
    if (dateStr >= covers[covers.length - 1].start)
      return covers[covers.length - 1];
  }

  return null;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatGermanDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Compute grid position for a cover based on its index.
 * Arranges covers in a grid: ~53 covers per row (one year of weekly issues).
 * Returns [col, row] for positioning on the map.
 */
export function getCoverGridPosition(
  index: number,
  columns: number = 53
): [number, number] {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return [col, row];
}
