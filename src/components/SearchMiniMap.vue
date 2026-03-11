<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import type { CoverEntry } from '../utils/coverLookup'
import { COLS, CELL_W, CELL_H, TOTAL_ROWS, coverToGridCoords } from '../utils/grid'
import '../styles/search-minimap.css'

const props = defineProps<{
  results: Map<string, number> | null
  covers: CoverEntry[]
  mainMap: maplibregl.Map | null
}>()

const emit = defineEmits<{
  navigate: [lng: number, lat: number]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const miniMap = shallowRef<maplibregl.Map | null>(null)
const ready = ref(false)

// Compute full grid bounds
const [lng0] = coverToGridCoords(0)
const [lngLast] = coverToGridCoords(COLS - 1)
const [, latTop] = coverToGridCoords(0)
const [, latBot] = coverToGridCoords((TOTAL_ROWS - 1) * COLS)
const gridLeft = lng0 - CELL_W / 2
const gridRight = lngLast + CELL_W / 2
const gridTop = latTop + CELL_H / 2
const gridBottom = latBot - CELL_H / 2

onMounted(() => {
  if (!containerRef.value) return

  const m = new maplibregl.Map({
    container: containerRef.value,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#111' },
        },
      ],
    },
    center: [(gridLeft + gridRight) / 2, (gridTop + gridBottom) / 2],
    zoom: 0,
    interactive: false,
    attributionControl: false,
  })

  m.on('load', () => {
    m.addSource('covers-sprite', {
      type: 'image',
      url: '/covers-sprite.webp',
      coordinates: [
        [gridLeft, gridTop],
        [gridRight, gridTop],
        [gridRight, gridBottom],
        [gridLeft, gridBottom],
      ],
    })
    m.addLayer({
      id: 'covers-sprite',
      type: 'raster',
      source: 'covers-sprite',
      paint: { 'raster-opacity': 0.3, 'raster-fade-duration': 0 },
    })

    m.addSource('match-points', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    m.addLayer({
      id: 'match-dots',
      type: 'circle',
      source: 'match-points',
      paint: {
        'circle-radius': 2.5,
        'circle-color': '#ec5150',
        'circle-opacity': 0.9,
      },
    })

    m.addSource('viewport-rect', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    m.addLayer({
      id: 'viewport-rect-fill',
      type: 'fill',
      source: 'viewport-rect',
      paint: { 'fill-color': '#fff', 'fill-opacity': 0.08 },
    })
    m.addLayer({
      id: 'viewport-rect-line',
      type: 'line',
      source: 'viewport-rect',
      paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-opacity': 0.6 },
    })

    m.fitBounds(
      [[gridLeft, gridBottom], [gridRight, gridTop]],
      { padding: 4, duration: 0 }
    )

    ready.value = true
  })

  miniMap.value = m
})

onUnmounted(() => {
  miniMap.value?.remove()
  miniMap.value = null
})

// Update match highlights
watch([() => props.results, () => props.covers, ready], () => {
  if (!miniMap.value || !ready.value) return
  const m = miniMap.value

  if (!props.results || props.results.size === 0) {
    ;(m.getSource('match-points') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: [],
    })
    return
  }

  const features = []
  for (let i = 0; i < props.covers.length; i++) {
    if (!props.results.has(props.covers[i].id)) continue
    const [lng, lat] = coverToGridCoords(i)
    features.push({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
    })
  }

  ;(m.getSource('match-points') as maplibregl.GeoJSONSource)?.setData({
    type: 'FeatureCollection',
    features,
  })
})

// Sync viewport rectangle from main map
watch([() => props.mainMap, ready], ([mainMap], _old, onCleanup) => {
  if (!mainMap || !miniMap.value || !ready.value) return
  const m = miniMap.value

  function updateViewport() {
    if (!mainMap || !m) return
    const bounds = mainMap.getBounds()
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()

    ;(m.getSource('viewport-rect') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [sw.lng, sw.lat],
              [ne.lng, sw.lat],
              [ne.lng, ne.lat],
              [sw.lng, ne.lat],
              [sw.lng, sw.lat],
            ]],
          },
        },
      ],
    })
  }

  updateViewport()
  mainMap.on('move', updateViewport)
  onCleanup(() => {
    mainMap.off('move', updateViewport)
  })
})

function handleClick(e: MouseEvent) {
  if (!miniMap.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const lngLat = miniMap.value.unproject([x, y])
  emit('navigate', lngLat.lng, lngLat.lat)
}
</script>

<template>
  <div class="search-minimap visible" @click="handleClick">
    <div ref="containerRef" class="search-minimap-canvas" />
  </div>
</template>
