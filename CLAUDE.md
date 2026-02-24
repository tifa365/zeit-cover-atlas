# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains **reference artifacts** from the interactive ZEIT 80th anniversary feature ("Was stand in der ZEIT, als Sie geboren wurden?"). It is **not a buildable source repository** — there is no package.json, no source code, and no build toolchain. The actual application source lives elsewhere.

## Contents

- `code.txt` — CMS block registration snippet showing how the React app integrates with ZEIT's CMS via `registerCMSBlocks()`. Defines two embeddable blocks: a MapLibre map (`80-jahre-zeit-maplibre-karte`) and a waypoint navigator (`80-jahre-zeit-waypoint-start`) with three historical events.
- `react_components_to_install.txt` — Documents the vendor chunk dependencies. If rebuilding from scratch: `npm install react react-map-gl maplibre-gl react-day-picker date-fns framer-motion @turf/turf`.
- `index.css` — Compiled CSS with the full design system (CSS custom properties prefixed `--2026-80-jahre-zeit-2026-duv-*`). Includes dark mode support via `prefers-color-scheme` and `.color-scheme-dark` class.
- `birthday_button.css` — Small Svelte-compiled CSS for the birthday button component (scoped with `.svelte-1cxp7dv`).

## Architecture of the Original App

The full application is a React app with Svelte components, bundled via Vite/Webpack into a vendor chunk + business logic chunk pattern. Key features:

- **Map viewer**: MapLibre GL with React-Map-GL wrappers, GeoJSON data sources, polygon mask cutouts via Turf.js
- **Birthday picker**: react-day-picker with date-fns German locale
- **Animations**: Framer Motion for modal transitions and magnifying glass effect
- **CMS integration**: Hydrated into ZEIT's CMS via `ReactDOM.hydrateRoot`

## Language

All user-facing text is in German (locale: `de`).
