# Search Animation Ideas

## "Constellation" Effect
When a search query is active:
- Non-matching covers fade to full black
- Matching covers **physically move together** into a tight cluster
- On clear, covers animate back to their chronological grid positions

### Implementation Approaches

**Option A: Coordinate animation (complex, high impact)**
- Compute new packed grid positions for matched covers
- Animate polygon coordinates via `requestAnimationFrame` + lerping
- Challenge: raster image sources (sprite, row sprites, hi-res) are tied to fixed coordinates and can't move
- Would need HTML overlay with `<img>` tags + CSS transforms, or dynamically update image source coordinates

**Option B: Camera fitBounds (simple, still effective)**
- Fade non-matches to 100% black (not 70%)
- `map.fitBounds()` to the bounding box of all matching covers
- Matching covers get a subtle glow/pulse animation
- Much simpler, uses existing MapLibre APIs

**Option C: Hybrid**
- Use fitBounds for camera movement
- Add a secondary "gathered" view that re-renders matched covers as positioned HTML elements overlaid on the map
- Toggle between map view and gathered view
