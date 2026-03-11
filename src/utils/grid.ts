// Grid layout constants – keep near equator to avoid Mercator distortion
export const COLS = 53; // ~weeks per year
export const CELL_W = 0.3; // longitude units per cell
export const CELL_H = 0.429; // latitude units per cell (7:10 aspect ratio)
export const GAP = 0.003; // hairline gap

// Pre-compute grid origin so the grid is centred at lat=0
export const TOTAL_ROWS = 79; // ceil(4187 / 53)
const GRID_H = TOTAL_ROWS * (CELL_H + GAP);
export const GRID_TOP_LAT = GRID_H / 2; // ≈ +17 (well within low-distortion zone)

export function coverToGridCoords(index: number): [number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const lng = col * (CELL_W + GAP);
  const lat = GRID_TOP_LAT - row * (CELL_H + GAP);
  return [lng, lat];
}
