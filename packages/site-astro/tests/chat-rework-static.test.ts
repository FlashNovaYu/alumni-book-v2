import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { useVisibilityPolling } from '../src/composables/useVisibilityPolling'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

describe('Chat Rework Static & Contract Audits', () => {
  it('verifies that the required keywords exist and setInterval is banned', () => {
    const root = resolve(__dirname, '../')
    const files = [
      resolve(root, 'src/api/groupChat.ts'),
      resolve(root, 'src/api/inbox.ts'),
      resolve(root, 'src/api/error.ts'),
      resolve(root, 'src/composables/useVisibilityPolling.ts'),
    ]

    const contents = files.map(f => readFileSync(f, 'utf-8')).join('\n')

    // 必须包含特定关键机制
    expect(contents).toContain('joinApiUrl')
    expect(contents).toContain('X-Classmate-Token')
    expect(contents).toContain('AbortController')
    expect(contents).toContain('visibilitychange')
    expect(contents).toContain('online')
    expect(contents).toContain('onScopeDispose')

    // 绝对禁止 setInterval
    expect(contents).not.toContain('setInterval')
  })

  it('audits client source codes for token guards and API fetch rules', () => {
    const root = resolve(__dirname, '../')
    const groupChatSrc = readFileSync(resolve(root, 'src/api/groupChat.ts'), 'utf-8')
    const inboxSrc = readFileSync(resolve(root, 'src/api/inbox.ts'), 'utf-8')
    const classSpaceSrc = readFileSync(resolve(root, 'src/api/classSpace.ts'), 'utf-8')
    const errorSrc = readFileSync(resolve(root, 'src/api/error.ts'), 'utf-8')
    const navRuntimeSrc = readFileSync(resolve(root, 'src/scripts/navRuntime.ts'), 'utf-8')

    // 审计对 apiFetch 的调用
    expect(groupChatSrc).toContain('apiFetch')
    expect(inboxSrc).toContain('apiFetch')
    expect(classSpaceSrc).toContain('apiFetch')

    // 验证 ApiRequestError 的属性定义
    expect(errorSrc).toContain('class ApiRequestError')
    expect(errorSrc).toContain('status: number')
    expect(errorSrc).toContain('retryAfter?: number')

    // 验证 navRuntime 单例设计与生命周期审计
    expect(navRuntimeSrc).toContain('initNavRuntime')
    expect(navRuntimeSrc).toContain('__alumniNavRuntime')
    expect(navRuntimeSrc).toContain('astro:page-load')
    expect(navRuntimeSrc).toContain('astro:before-swap')
    expect(navRuntimeSrc).not.toContain('setInterval')
  })

  it('implements useVisibilityPolling with correct setTimeout recursion and backoff', async () => {
    vi.useFakeTimers()
    const onPoll = vi.fn().mockResolvedValue({})
    const onError = vi.fn()

    // 默认在线且非隐藏
    vi.stubGlobal('document', { 
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })

    const { trigger, cleanup } = useVisibilityPolling('https://api.test', 10000, onPoll, onError)

    // 初始执行一次
    expect(onPoll).toHaveBeenCalledTimes(1)

    // 第一次快进成功后调度 10s 后执行
    await vi.advanceTimersByTimeAsync(10000)
    expect(onPoll).toHaveBeenCalledTimes(2)

    // 模拟一次失败
    onPoll.mockRejectedValueOnce(new Error('fail-1'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(onPoll).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenCalledTimes(1)

    // 失败一次后，退避 5s 调度
    onPoll.mockRejectedValueOnce(new Error('fail-2'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(onPoll).toHaveBeenCalledTimes(4)
    expect(onError).toHaveBeenCalledTimes(2)

    // 失败两次后，退避 10s 调度
    await vi.advanceTimersByTimeAsync(10000)
    expect(onPoll).toHaveBeenCalledTimes(5)

    // 清理
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
