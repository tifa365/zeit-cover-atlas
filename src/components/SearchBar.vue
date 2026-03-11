<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import '../styles/search.css'

const props = defineProps<{
  resultCount: number | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const query = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

function handleInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  query.value = value
  clearTimeout(timer)
  timer = setTimeout(() => emit('search', value), 800)
}

function handleClear() {
  query.value = ''
  clearTimeout(timer)
  emit('search', '')
}

onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <div class="search-bar">
    <div class="search-bar-inner">
      <svg
        class="search-bar-icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <line x1="13" y1="13" x2="18" y2="18" />
      </svg>

      <input
        class="search-bar-input"
        type="text"
        :value="query"
        @input="handleInput"
        placeholder="Titelseiten durchsuchen…"
        :disabled="props.disabled"
      />

      <span v-if="query && resultCount !== null" class="search-bar-badge">
        {{ resultCount }} Treffer
      </span>

      <button
        v-if="query"
        type="button"
        class="search-bar-clear"
        title="Suche zurücksetzen"
        @click="handleClear"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  </div>
</template>
