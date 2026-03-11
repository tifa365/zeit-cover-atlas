<script setup lang="ts">
import { reactive, ref, watchEffect } from 'vue'
import type { CoverEntry } from '../utils/coverLookup'
import { formatGermanDate } from '../utils/coverLookup'
import { getCoverUrl, getArchiveUrl } from '../utils/coverUrl'
import '../styles/modal.css'

const props = withDefaults(defineProps<{
  cover: CoverEntry | null
  index: number
  totalCovers: number
  hasPrev?: boolean
  hasNext?: boolean
  resultLabel?: string
}>(), {
  hasPrev: true,
  hasNext: true,
})

const emit = defineEmits<{
  close: []
  prev: []
  next: []
}>()

const MAGNIFIER_SIZE = 160
const ZOOM = 2

const glass = reactive({ active: false, x: 0, y: 0 })
const figureRef = ref<HTMLDivElement | null>(null)

// Keyboard navigation
watchEffect((onCleanup) => {
  if (!props.cover) return
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') emit('close')
    if (e.key === 'ArrowLeft') emit('prev')
    if (e.key === 'ArrowRight') emit('next')
  }
  window.addEventListener('keydown', handleKey)
  onCleanup(() => window.removeEventListener('keydown', handleKey))
})

function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  glass.active = true
  glass.x = e.clientX - rect.left
  glass.y = e.clientY - rect.top
}

function handleMouseLeave() {
  glass.active = false
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="cover" class="modal-backdrop" @click="handleBackdropClick">
      <div class="modal-card">
        <figcaption class="modal-title">
          <strong>Ausgabe {{ cover.issue.split('/')[1] }} / {{ cover.issue.split('/')[0] }}</strong>
          {{ formatGermanDate(cover.start) }}
          <span v-if="resultLabel" class="modal-result-label">{{ resultLabel }}</span>
        </figcaption>

        <figure class="modal-figure">
          <div
            ref="figureRef"
            class="modal-magnifier"
            @mousemove="handleMouseMove"
            @mouseleave="handleMouseLeave"
          >
            <img
              :src="getCoverUrl(cover.id)"
              :alt="`ZEIT Ausgabe ${cover.issue}`"
              loading="eager"
            />
            <div
              :class="['modal-glass', { active: glass.active && (figureRef?.clientWidth ?? 0) > 0 }]"
              aria-hidden="true"
              :style="{
                width: MAGNIFIER_SIZE + 'px',
                height: MAGNIFIER_SIZE + 'px',
                left: (glass.x - MAGNIFIER_SIZE / 2) + 'px',
                top: (glass.y - MAGNIFIER_SIZE / 2) + 'px',
                backgroundImage: `url(${getCoverUrl(cover.id)})`,
                backgroundSize: `${(figureRef?.clientWidth ?? 0) * ZOOM}px ${(figureRef?.clientHeight ?? 0) * ZOOM}px`,
                backgroundPosition: `${-(glass.x * ZOOM - MAGNIFIER_SIZE / 2)}px ${-(glass.y * ZOOM - MAGNIFIER_SIZE / 2)}px`,
              }"
            />
            <a
              :href="getArchiveUrl(cover.issue)"
              target="_blank"
              rel="noreferrer"
              class="modal-link"
            >
              Ausgabe lesen →
            </a>
          </div>
        </figure>

        <button class="modal-close" @click="emit('close')">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15" cy="15" r="14.25" stroke="currentColor" stroke-width="1.5" />
            <rect x="20.4907" y="9" width="1.25" height="16" rx="0.625" transform="rotate(45 20.4907 9)" fill="currentColor" />
            <rect x="21.1978" y="20.3135" width="1.25" height="16" rx="0.625" transform="rotate(135 21.1978 20.3135)" fill="currentColor" />
          </svg>
        </button>

        <button class="modal-prev" :disabled="!hasPrev" @click="emit('prev')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 1L4 7L10 13" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>

        <button class="modal-next" :disabled="!hasNext" @click="emit('next')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1L10 7L4 13" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-card,
.modal-leave-active .modal-card {
  transition: opacity 0.25s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-card,
.modal-leave-to .modal-card {
  opacity: 0;
}
</style>
