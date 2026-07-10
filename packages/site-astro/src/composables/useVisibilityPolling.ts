import { onScopeDispose } from 'vue'

export function useVisibilityPolling(
  apiBase: string,
  intervalMs: number,
  onPoll: (signal: AbortSignal) => Promise<any>,
  onError?: (error: any) => void
) {
  let timerId: any = null
  let abortController: AbortController | null = null
  let consecutiveFailures = 0

  function getBackoffDelay(): number {
    if (consecutiveFailures === 0) return intervalMs
    const seconds = [5, 10, 20, 30]
    const idx = Math.min(consecutiveFailures - 1, seconds.length - 1)
    return seconds[idx] * 1000
  }

  function canPoll(): boolean {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false
    }
    if (typeof window !== 'undefined' && typeof window.navigator !== 'undefined' && !window.navigator.onLine) {
      return false
    }
    return true
  }

  function cleanup() {
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function poll() {
    cleanup()
    if (!canPoll()) return

    abortController = new AbortController()

    try {
      await onPoll(abortController.signal)
      consecutiveFailures = 0
    } catch (err: any) {
      if (err.name === 'AbortError') return
      consecutiveFailures++
      if (onError) {
        try {
          onError(err)
        } catch {}
      }
    }

    if (canPoll()) {
      const delay = getBackoffDelay()
      timerId = setTimeout(poll, delay)
    }
  }

  function trigger() {
    cleanup()
    poll()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      trigger()
    } else {
      cleanup()
    }
  }

  function handleOnline() {
    trigger()
  }

  function handleOffline() {
    cleanup()
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // 启动初始轮询
    poll()
  }

  onScopeDispose(() => {
    cleanup()
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  return {
    trigger,
    cleanup
  }
}
