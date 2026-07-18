<template>
  <div class="ui-avatar" :class="avatarClasses" :style="avatarStyle">
    <img
      v-if="src && !hasError"
      :src="src"
      :alt="alt"
      class="ui-avatar__image"
      @error="handleError"
    />
    <span v-else class="ui-avatar__fallback" :style="fallbackStyle">
      {{ initials }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface Props {
  src?: string | null
  alt?: string
  name?: string
  size?: AvatarSize
  square?: boolean
  ring?: boolean
  ringColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  name: '',
  size: 'md',
  square: false,
  ring: false,
  ringColor: 'var(--accent)',
})

const hasError = ref(false)

const sizeMap: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
}

const avatarClasses = computed(() => [
  `ui-avatar--${props.size}`,
  {
    'ui-avatar--square': props.square,
    'ui-avatar--ring': props.ring,
  },
])

const avatarStyle = computed(() => {
  const size = sizeMap[props.size]
  const styles: Record<string, string> = {
    width: `${size}px`,
    height: `${size}px`,
  }

  if (props.ring) {
    styles['--avatar-ring-color'] = props.ringColor
  }

  return styles
})

const fallbackStyle = computed(() => {
  const size = sizeMap[props.size]
  return {
    fontSize: `${Math.max(size * 0.35, 12)}px`,
  }
})

const initials = computed(() => {
  if (!props.name) return '?'
  return props.name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

function handleError() {
  hasError.value = true
}
</script>

<style scoped>
.ui-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
  user-select: none;
}

.ui-avatar--square {
  border-radius: var(--radius-md);
}

.ui-avatar--ring {
  box-shadow: 0 0 0 3px var(--avatar-ring-color, var(--accent));
}

.ui-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.ui-avatar__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-raised));
  border-radius: inherit;
}
</style>
