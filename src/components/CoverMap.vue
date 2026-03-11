<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onUnmounted, markRaw } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../styles/map.css'
import type { CoverEntry } from '../utils/coverLookup'
import { formatGermanDate } from '../utils/coverLookup'
import { COLS, CELL_W, CELL_H, GAP, TOTAL_ROWS, GRID_TOP_LAT, coverToGridCoords } from '../utils/grid'
import { loadHiResCovers, resetLoadedSprites } from '../utils/spriteLoader'
import { SearchFlightController } from '../utils/searchFlight'

const props = defineProps<{
  covers: CoverEntry[]
  flyToIndex: number | null
  highlightedCovers: Map<string, number> | null
}>()

const emit = defineEmits<{
  coverClick: [cover: CoverEntry, index: number]
  flyComplete: []
  mapReady: [map: maplibregl.Map]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
const map = shallowRef<maplibregl.Map | null>(null)
const mapLoaded = ref(false)
const hoveredCover = ref<{
  issue: string; start: string; x: number; y: number
} | null>(null)
const fadeOverlay = ref<HTMLDivElement | null>(null)

const searchFlight = new SearchFlightController()

// Initialize map on mount (covers are guaranteed loaded via v-if in App.vue)
onMounted(() => {
  if (props.covers.length > 0 && mapContainer.value) {
    initializeMap(props.covers)
  }
})

function initializeMap(covers: CoverEntry[]) {
  const container = mapContainer.value!

  const VISIBLE_COLS = 32
  const visibleLng = VISIBLE_COLS * (CELL_W + GAP)
  const gridW = COLS * (CELL_W + GAP)
  const centerLng = gridW / 2

  const row2010 = 64
  const lat2010 = GRID_TOP_LAT - row2010 * (CELL_H + GAP)

  const containerW = container.clientWidth
  const zoom = Math.log2((containerW * 360) / (visibleLng * 256)) - 1
  const centerLat = lat2010 - (CELL_H + GAP) / 2

  const m = markRaw(new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#000' },
        },
      ],
    },
    center: [centerLng, centerLat],
    zoom,
    minZoom: zoom - 2,
    maxZoom: zoom + 1,
    cooperativeGestures: false,
    attributionControl: false,
  }))

  m.on('load', () => {
    const halfW = (CELL_W + GAP) / 2
    const halfH = (CELL_H + GAP) / 2
    const rectFeatures = covers.map((cover, i) => {
      const [lng, lat] = coverToGridCoords(i)
      return {
        type: 'Feature' as const,
        properties: { index: i, id: cover.id, issue: cover.issue, start: cover.start },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [lng - halfW, lat - halfH],
            [lng + halfW, lat - halfH],
            [lng + halfW, lat + halfH],
            [lng - halfW, lat + halfH],
            [lng - halfW, lat - halfH],
          ]],
        },
      }
    })

    m.addSource('cover-rects', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: rectFeatures },
    })

    // Sprite image covering the entire grid
    const lastCol = COLS - 1
    const lastRow = TOTAL_ROWS - 1
    const [lng0] = coverToGridCoords(0)
    const [lngN] = coverToGridCoords(lastCol)
    const [, latTop] = coverToGridCoords(0)
    const [, latBot] = coverToGridCoords(lastRow * COLS)

    const spriteLeft = lng0 - CELL_W / 2
    const spriteRight = lngN + CELL_W / 2
    const spriteTop = latTop + CELL_H / 2
    const spriteBottom = latBot - CELL_H / 2

    m.addSource('covers-sprite', {
      type: 'image',
      url: '/covers-sprite.webp',
      coordinates: [
        [spriteLeft, spriteTop],
        [spriteRight, spriteTop],
        [spriteRight, spriteBottom],
        [spriteLeft, spriteBottom],
      ],
    })

    m.addLayer({
      id: 'covers-sprite',
      type: 'raster',
      source: 'covers-sprite',
      paint: { 'raster-fade-duration': 0 },
    })

    // Black edge strips
    const EDGE_W = GAP * 3
    m.addSource('edge-strips', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [spriteLeft - EDGE_W, spriteTop + EDGE_W],
                [spriteLeft + EDGE_W, spriteTop + EDGE_W],
                [spriteLeft + EDGE_W, spriteBottom - EDGE_W],
                [spriteLeft - EDGE_W, spriteBottom - EDGE_W],
                [spriteLeft - EDGE_W, spriteTop + EDGE_W],
              ]],
            },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [spriteRight - EDGE_W, spriteTop + EDGE_W],
                [spriteRight + EDGE_W, spriteTop + EDGE_W],
                [spriteRight + EDGE_W, spriteBottom - EDGE_W],
                [spriteRight - EDGE_W, spriteBottom - EDGE_W],
                [spriteRight - EDGE_W, spriteTop + EDGE_W],
              ]],
            },
          },
        ],
      },
    })
    m.addLayer({
      id: 'edge-strips',
      type: 'fill',
      source: 'edge-strips',
      paint: { 'fill-color': '#000', 'fill-opacity': 1, 'fill-antialias': false },
    })

    // Dim layer
    m.addLayer({
      id: 'cover-rects-dim',
      type: 'fill',
      source: 'cover-rects',
      paint: {
        'fill-color': '#000',
        'fill-antialias': false,
        'fill-opacity': ['coalesce', ['get', 'dimmed'], 0],
        'fill-opacity-transition': { duration: 600, delay: 0 },
      },
    })

    // Highlight border
    m.addLayer({
      id: 'cover-rects-highlight',
      type: 'line',
      source: 'cover-rects',
      paint: {
        'line-color': '#ec5150',
        'line-width': 2,
        'line-opacity': ['coalesce', ['get', 'highlighted'], 0],
        'line-opacity-transition': { duration: 500, delay: 0 },
      },
    })

    // Invisible fill layer for click hit-testing
    m.addLayer({
      id: 'cover-rects-fill',
      type: 'fill',
      source: 'cover-rects',
      paint: { 'fill-color': '#000', 'fill-opacity': 0 },
    })

    loadHiResCovers(m, covers)
    mapLoaded.value = true
    emit('mapReady', m)
  })

  // Click handler
  m.on('click', 'cover-rects-fill', (e) => {
    if (e.features && e.features[0]) {
      const p = e.features[0].properties
      if (p) {
        const idx = p.index as number
        emit('coverClick', props.covers[idx], idx)
      }
    }
  })

  // Hover tooltip
  m.on('mousemove', 'cover-rects-fill', (e) => {
    m.getCanvas().style.cursor = 'pointer'
    const p = e.features?.[0]?.properties
    if (!p) return
    hoveredCover.value = {
      issue: p.issue as string,
      start: p.start as string,
      x: e.point.x,
      y: e.point.y,
    }
  })
  m.on('mouseleave', 'cover-rects-fill', () => {
    m.getCanvas().style.cursor = ''
    hoveredCover.value = null
  })
  m.on('mousedown', 'cover-rects-fill', () => {
    hoveredCover.value = null
  })

  // Hi-res on move end (skip during search)
  m.on('moveend', () => {
    if (!searchFlight.isActive) {
      loadHiResCovers(m, props.covers)
    }
  })

  map.value = m
}

// Fly to a specific cover
watch(
  () => props.flyToIndex,
  (idx) => {
    if (idx === null || !map.value || !mapLoaded.value) return
    const [lng, lat] = coverToGridCoords(idx)
    map.value.flyTo({ center: [lng, lat], zoom: 12, duration: 1500 })
    map.value.once('moveend', () => emit('flyComplete'))
  }
)

// Search state machine
watch(
  [() => props.highlightedCovers, mapLoaded, () => props.covers],
  ([highlighted]) => {
    searchFlight.reset()
    if (!map.value || !mapLoaded.value || !map.value.isStyleLoaded()) return
    searchFlight.update(
      map.value,
      highlighted as Map<string, number> | null,
      props.covers,
      fadeOverlay.value
    )
  }
)

/** Fade to black, jump, wait for idle, fade back in */
function jumpWithFade(center: [number, number]) {
  const m = map.value
  const overlay = fadeOverlay.value
  if (!m || !overlay) {
    m?.jumpTo({ center })
    return
  }

  overlay.style.transition = 'opacity 150ms ease-out'
  overlay.style.opacity = '1'

  setTimeout(() => {
    m.jumpTo({ center })
    m.once('idle', () => {
      overlay.style.transition = 'opacity 300ms ease-in'
      overlay.style.opacity = '0'
    })
  }, 180)
}

defineExpose({ jumpWithFade })

onUnmounted(() => {
  searchFlight.reset()
  resetLoadedSprites()
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <div class="map-container">
    <div ref="mapContainer" style="width: 100%; height: 100%" />
    <div
      ref="fadeOverlay"
      :style="{
        position: 'absolute',
        inset: '0',
        background: '#000',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }"
    />
    <div
      v-if="hoveredCover"
      class="cover-tooltip"
      :style="{ left: hoveredCover.x + 'px', top: hoveredCover.y + 'px' }"
    >
      <strong>Ausgabe {{ hoveredCover.issue.split('/')[1] }} / {{ hoveredCover.issue.split('/')[0] }}</strong>
      <span>{{ formatGermanDate(hoveredCover.start) }}</span>
      <span class="cover-tooltip-hint">Details bei Klick auf Cover</span>
    </div>
    <div v-if="map" class="zoom-controls">
      <button type="button" title="Heranzoomen" @click="map!.zoomIn()">
        <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19.2746684,18 L23.7360075,22.4613403 C24.0879975,22.81333 24.0879975,23.3840175 23.7360075,23.7360072 C23.3840176,24.0879987 22.8133291,24.0879987 22.4613391,23.7360072 L18,19.2746694 L13.5386609,23.7360072 C13.1866709,24.0879987 12.6159824,24.0879987 12.2639925,23.7360072 C11.9120025,23.3840175 11.9120025,22.81333 12.2639925,22.4613403 L16.7253316,18 L12.2639925,13.538661 C11.9120025,13.1866713 11.9120025,12.6159837 12.2639925,12.2639923 C12.6159824,11.9120026 13.1866709,11.9120026 13.5386609,12.2639923 L18,16.7253319 L22.4613391,12.2639923 C22.8133291,11.9120026 23.3840176,11.9120026 23.7360075,12.2639923 C24.0879975,12.6159837 24.0879975,13.1866713 23.7360075,13.538661 L19.2746684,18 Z"
            fill="#44444C"
            fill-rule="nonzero"
            transform="translate(18, 18) rotate(-315) translate(-18, -18)"
          />
        </svg>
      </button>
      <button type="button" title="Herauszoomen" @click="map!.zoomOut()">
        <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M13.5386609,23.7360072 C13.1866709,24.0879987 12.6159824,24.0879987 12.2639925,23.7360072 C11.9120025,23.3840175 11.9120025,22.81333 12.2639925,22.4613403 L22.4613391,12.2639923 C22.8133291,11.9120026 23.3840176,11.9120026 23.7360075,12.2639923 C24.0879975,12.6159837 24.0879975,13.1866713 23.7360075,13.538661 L13.5386609,23.7360072 Z"
            fill="#44444C"
            fill-rule="nonzero"
            transform="translate(18, 18) rotate(-315) translate(-18, -18)"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
