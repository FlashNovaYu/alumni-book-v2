import { onScopeDispose } from 'vue'

export interface VisibilityPollingOptions {
  run(signal: AbortSignal): Promise<void> | void
  initialDelay?: number
  baseDelay?: number
  maxDelay?: number
}

const FAILURE_DELAYS = [5_000, 10_000, 20_000, 30_000]

export function useVisibilityPolling(options: VisibilityPollingOptions) {
  const initialDelay = options.initialDelay ?? 0
  const baseDelay = options.baseDelay ?? 30_000
  const maxDelay = options.maxDelay ?? 30_000
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let failureCount = 0
  let stopped = false

  const isAvailable = () => typeof document === 'undefined'
    || (!document.hidden && (typeof navigator === 'undefined' || navigator.onLine))

  function clearTimer() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function abortRequest() {
    const active = controller
    controller = null
    active?.abort()
  }

  function schedule(delay: number) {
    clearTimer()
    if (stopped || !isAvailable()) return
    timer = setTimeout(() => {
      timer = null
      void syncNow()
    }, delay)
  }

  async function syncNow() {
    clearTimer()
    if (stopped || !isAvailable() || controller) return

    const active = new AbortController()
    controller = active
    try {
      await options.run(active.signal)
      failureCount = 0
      if (!active.signal.aborted) schedule(baseDelay)
    } catch {
      if (!active.signal.aborted) {
        failureCount += 1
        const delay = FAILURE_DELAYS[Math.min(failureCount - 1, FAILURE_DELAYS.length - 1)]
        schedule(Math.min(delay, maxDelay))
      }
    } finally {
      if (controller === active) controller = null
    }
  }

  function pause() {
    clearTimer()
    abortRequest()
  }

  function handleVisibilityChange() {
    if (document.hidden) pause()
    else void syncNow()
  }

  function handleOnline() {
    void syncNow()
  }

  function handleOffline() {
    pause()
  }

  function stop() {
    if (stopped) return
    stopped = true
    pause()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }
  schedule(initialDelay)
  onScopeDispose(stop)

  return { syncNow, stop }
}
