import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (relativePath: string) => readFileSync(resolve(src, relativePath), 'utf-8')

describe('班级空间会话客户端契约', () => {
  it('提供统一的同学会话请求和错误语义', () => {
    expect(existsSync(resolve(src, 'api/classmateRequest.ts'))).toBe(true)
    const source = read('api/classmateRequest.ts')

    expect(source).toContain('ApiRequestError')
    expect(source).toContain('getClassmateToken')
    expect(source).toContain('X-Classmate-Token')
    expect(source).toContain('joinApiUrl')
    expect(source).toContain('Retry-After')
  })

  it('按群聊、私聊和通知边界提供强类型客户端', () => {
    expect(existsSync(resolve(src, 'api/groupChat.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'api/inbox.ts'))).toBe(true)

    const groupChat = read('api/groupChat.ts')
    const inbox = read('api/inbox.ts')

    for (const endpoint of ['/api/group-chat/messages', '/api/group-chat/sync', '/api/group-chat/mine']) {
      expect(groupChat).toContain(endpoint)
    }
    for (const endpoint of ['/api/direct-conversations', '/api/inbox/summary', '/api/inbox/sync', '/api/notifications']) {
      expect(inbox).toContain(endpoint)
    }
    expect(groupChat).toContain('requestClassmateApi')
    expect(inbox).toContain('requestClassmateApi')
  })

  it('在没有同学会话时拒绝班级空间概览请求', () => {
    const source = read('api/classSpace.ts')

    expect(source).toContain('requestClassmateApi')
    expect(source).not.toContain("fetch(joinApiUrl(apiBase, '/api/class-space/overview'))")
  })
})

describe('可见性轮询生命周期契约', () => {
  it('使用一个可取消的递归计时器同步，并在页面生命周期中释放资源', () => {
    expect(existsSync(resolve(src, 'composables/useVisibilityPolling.ts'))).toBe(true)
    const source = read('composables/useVisibilityPolling.ts')

    expect(source).toContain('AbortController')
    expect(source).toContain('visibilitychange')
    expect(source).toContain("addEventListener('online'")
    expect(source).toContain('onScopeDispose')
    expect(source).toContain('clearTimeout')
    expect(source).toContain('setTimeout')
    expect(source).not.toContain('setInterval')
    expect(source).toContain('5_000')
    expect(source).toContain('10_000')
    expect(source).toContain('20_000')
    expect(source).toContain('30_000')
  })
})
