# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive cover browser for 80 years of DIE ZEIT (1946–2026). Displays ~4187 weekly cover images on a pannable MapLibre map with full-text search (OCR-based) and a date picker. All user-facing text is in **German** (locale: `de`).

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check + Vite production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run preview` — Preview production build

## Architecture

**React + TypeScript + Vite** single-page app. No routing — everything is in `App.tsx`.

### Key Components (`src/components/`)

- **CoverMap** — Core component. Uses MapLibre GL directly (not react-map-gl) to render covers on a fake geographic grid (53 columns × 79 rows, near-equator coordinates to avoid Mercator distortion). Three-tier image loading: base sprite → row sprites → individual hi-res covers.
- **CoverModal** — Cover detail overlay with prev/next navigation (navigates search results when search is active).
- **SearchBar** — Full-text search input with 800ms debounce.
- **SearchMiniMap** — Shows all search result positions as dots; click to fly to location.
- **DatePicker** — Year → month → day progressive picker using react-day-picker.

### Data & Search (`src/utils/`)

- **coverLookup** — `CoverEntry` type (`id`, `issue`, `start`, `end`), date-to-cover lookup, grid position math.
- **coverUrl** — URL helpers for cover images (`/covers/`, `/covers-thumb/`) and ZEIT archive links.
- **searchIndex** — MiniSearch-based full-text search over OCR data (`/search-data/ocr-index.json`). Boosts headlines 3×, supports fuzzy + prefix matching.

### Map Grid System

Covers are laid out on a geographic coordinate grid (not pixel-based):
- 53 columns (≈ weeks/year), cell size 0.3 × 0.429 lng/lat units (7:10 aspect ratio)
- Grid centred at latitude 0; coordinates exported via `coverToGridCoords(index)`
- Search uses a fade-cut-jump state machine (settling → flying → idle) to avoid tile churn during navigation

### Static Assets (`public/`)

- `fullCoversData.json` — Array of all cover entries loaded at startup
- `covers-sprite.webp` — Single sprite with all 4187 thumbnails (60×86px each)
- `row-sprites/row-{n}.webp` — Per-row sprites at 2× resolution
- `covers/` and `covers-thumb/` — Individual cover images (gitignored)
- `search-data/ocr-index.json` — OCR text index for MiniSearch

### Scripts (`scripts/`)

Python tooling (managed with `uv`) for OCR processing of cover images.

## Reference Files (from original ZEIT CMS app)

- `code.txt` — CMS block registration snippet (`registerCMSBlocks()`)
- `react_components_to_install.txt` — Original vendor dependencies
- `index.css` — Compiled CSS from original app (design tokens prefixed `--2026-80-jahre-zeit-2026-duv-*`)
- `birthday_button.css` — Svelte-compiled CSS from original
