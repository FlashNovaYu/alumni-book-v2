import { isAbortError } from './network'

/** 管理筛选与路由卸载时的请求所有权，防止陈旧响应覆盖当前视图。 */
export class RequestLifecycle {
  private current: AbortController | null = null

  begin(): AbortController {
    this.current?.abort()
    this.current = new AbortController()
    return this.current
  }

  commit(controller: AbortController, apply: () => void): boolean {
    if (controller !== this.current || controller.signal.aborted) return false
    apply()
    return true
  }

  shouldReport(error: unknown, controller: AbortController): boolean {
    return controller === this.current && !controller.signal.aborted && !isAbortError(error)
  }

  finish(controller: AbortController): boolean {
    if (controller !== this.current) return false
    this.current = null
    return true
  }

  abort(): void {
    this.current?.abort()
    this.current = null
  }
}
