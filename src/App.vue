<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
import type maplibregl from 'maplibre-gl'
import CoverMap from './components/CoverMap.vue'
import CoverModal from './components/CoverModal.vue'
import SearchBar from './components/SearchBar.vue'
import SearchMiniMap from './components/SearchMiniMap.vue'
import type { CoverEntry } from './utils/coverLookup'
import { initSearchIndex, searchCovers } from './utils/searchIndex'
import {
  buildSearchResultIndices,
  getSearchResultPos,
  navigatePrev,
  navigateNext,
  buildResultLabel,
  computeHasPrev,
  computeHasNext,
} from './utils/searchSession'
import './styles/app.css'

const coverMapRef = ref<InstanceType<typeof CoverMap> | null>(null)

const covers = ref<CoverEntry[]>([])
const selectedCover = ref<CoverEntry | null>(null)
const selectedIndex = ref(0)
const flyToIndex = ref<number | null>(null)
const searchReady = ref(false)
const searchResults = ref<Map<string, number> | null>(null)
const searchResultCount = ref<number | null>(null)
const mapInstance = shallowRef<maplibregl.Map | null>(null)
let preModalZoom: number | null = null

const searchResultIndices = computed(() =>
  buildSearchResultIndices(covers.value, searchResults.value)
)

const searchResultPos = computed(() =>
  getSearchResultPos(searchResultIndices.value, selectedIndex.value, !!selectedCover.value)
)

const resultLabel = computed(() =>
  buildResultLabel(searchResultIndices.value, searchResultPos.value)
)

const hasPrev = computed(() =>
  computeHasPrev(selectedIndex.value, searchResultIndices.value, searchResultPos.value)
)

const hasNext = computed(() =>
  computeHasNext(selectedIndex.value, covers.value.length, searchResultIndices.value, searchResultPos.value)
)

onMounted(async () => {
  const r = await fetch(`${import.meta.env.BASE_URL}fullCoversData.json`)
  covers.value = await r.json()
})

onMounted(async () => {
  try {
    await initSearchIndex()
    searchReady.value = true
  } catch (err) {
    console.warn('Search index failed to load:', err)
  }
})

function handleCoverClick(cover: CoverEntry, index: number) {
  if (!selectedCover.value && mapInstance.value) {
    preModalZoom = mapInstance.value.getZoom()
  }
  selectedCover.value = cover
  selectedIndex.value = index
  flyToIndex.value = index
}

function handleFlyComplete() {
  flyToIndex.value = null
}

function handleSearch(query: string) {
  if (!query.trim()) {
    searchResults.value = null
    searchResultCount.value = null
    return
  }
  const results = searchCovers(query)
  if (results === null) return
  const map = new Map(results.map((r) => [r.id + '.jpg', r.score]))
  searchResults.value = map.size > 0 ? map : new Map()
  searchResultCount.value = map.size
}

function handleMapReady(m: maplibregl.Map) {
  mapInstance.value = m
}

function handleMiniMapNavigate(lng: number, lat: number) {
  coverMapRef.value?.jumpWithFade([lng, lat])
}

function handleCloseModal() {
  selectedCover.value = null
  if (preModalZoom !== null && mapInstance.value) {
    mapInstance.value.flyTo({ zoom: preModalZoom, duration: 600 })
    preModalZoom = null
  }
}

function handlePrev() {
  const newIndex = navigatePrev(selectedIndex.value, searchResultIndices.value)
  if (newIndex !== null) {
    selectedIndex.value = newIndex
    selectedCover.value = covers.value[newIndex]
    flyToIndex.value = newIndex
  }
}

function handleNext() {
  const newIndex = navigateNext(selectedIndex.value, covers.value.length, searchResultIndices.value)
  if (newIndex !== null) {
    selectedIndex.value = newIndex
    selectedCover.value = covers.value[newIndex]
    flyToIndex.value = newIndex
  }
}
</script>

<template>
  <div v-if="covers.length > 0" class="app">
    <CoverMap
      ref="coverMapRef"
      :covers="covers"
      :fly-to-index="flyToIndex"
      :highlighted-covers="searchResults"
      @cover-click="handleCoverClick"
      @fly-complete="handleFlyComplete"
      @map-ready="handleMapReady"
    />

    <SearchBar
      :result-count="searchResultCount"
      :disabled="!searchReady"
      @search="handleSearch"
    />

    <SearchMiniMap
      :results="searchResults"
      :covers="covers"
      :main-map="mapInstance"
      @navigate="handleMiniMapNavigate"
    />

    <CoverModal
      :cover="selectedCover"
      :index="selectedIndex"
      :total-covers="covers.length"
      :has-prev="hasPrev"
      :has-next="hasNext"
      :result-label="resultLabel"
      @close="handleCloseModal"
      @prev="handlePrev"
      @next="handleNext"
    />
  </div>
</template>
