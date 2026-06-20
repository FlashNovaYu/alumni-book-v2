<template>
  <div class="music-player-widget no-print">
    <button
      class="music-toggle-btn"
      :class="{ playing: musicPlaying }"
      @click="toggleMusic"
      :title="musicTitle || '背景音乐'"
    >
      <span class="music-icon">🎵</span>
    </button>
    <transition name="fade">
      <span v-if="showMusicTip" class="music-tip">点击播放背景音乐</span>
    </transition>
    <audio
      ref="audioRef"
      :src="getPhotoUrl(musicUrl)"
      loop
      preload="auto"
      @play="onMusicPlay"
      @pause="onMusicPause"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps<{
  musicUrl: string
  musicTitle: string | null
  musicAutoplay: boolean
  apiBase: string
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const musicPlaying = ref(false)
const showMusicTip = ref(false)

function getPhotoUrl(r2Key: string) {
  if (r2Key.startsWith('http')) return r2Key
  return `${props.apiBase}/api/files/${r2Key}`
}

function toggleMusic() {
  if (!audioRef.value) return
  if (musicPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play().catch(err => {
      console.warn('Playback prevented:', err)
      showMusicTip.value = true
      setTimeout(() => { showMusicTip.value = false }, 5000)
    })
  }
}

function onMusicPlay() {
  musicPlaying.value = true
  showMusicTip.value = false
}

function onMusicPause() {
  musicPlaying.value = false
}

onMounted(() => {
  nextTick(() => {
    if (audioRef.value && props.musicAutoplay) {
      audioRef.value.play().then(() => {
        musicPlaying.value = true
      }).catch(err => {
        console.log('Autoplay prevented by browser, showing play prompt:', err)
        showMusicTip.value = true
        setTimeout(() => { showMusicTip.value = false }, 6000)
      })
    }
  })
})
</script>

<style scoped>
.music-player-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 99;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.music-toggle-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-surface-card);
  border: 1px solid var(--color-hairline);
  box-shadow: var(--shadow-card-hover);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s;
}
.music-toggle-btn:hover {
  background-color: var(--color-surface-cream-strong);
  transform: scale(1.05);
}
.music-toggle-btn.playing {
  animation: rotate 6s linear infinite;
  background-color: var(--color-primary);
  color: var(--color-on-primary);
  border-color: var(--color-primary);
}
.music-tip {
  background: var(--color-surface-card);
  border: 1px solid var(--color-hairline);
  padding: 6px 12px;
  border-radius: var(--rounded-md);
  font-size: 12px;
  color: var(--color-muted);
  box-shadow: var(--shadow-card-hover);
  white-space: nowrap;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
