import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (relativePath: string) => readFileSync(resolve(src, relativePath), 'utf-8')

describe('同学会话失效约束', () => {
  it('为班级空间携带同学令牌并通过统一处理器处理 401', () => {
    const classSpace = read('api/classSpace.ts')
    const postOffice = read('api/postOffice.ts')

    expect(classSpace).toContain('getClassmateToken')
    expect(classSpace).toContain("'X-Classmate-Token'")
    expect(classSpace).toContain('handleClassmateUnauthorized')
    expect(postOffice).toContain('handleClassmateUnauthorized')
  })

  it('清理失效会话并在信箱中显示中文错误', () => {
    expect(existsSync(resolve(src, 'api/classmateSession.ts'))).toBe(true)

    const session = read('api/classmateSession.ts')
    const mailbox = read('components/MailboxApp.vue')

    expect(session).toContain("export const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'")
    expect(session).toContain('clearClassmateSession()')
    expect(session).toContain('window.location.assign')
    expect(mailbox).toContain('loadError')
    expect(mailbox).toContain('{{ loadError }}')
    expect(mailbox).toContain('v-if="!loadError"')
  })

  it('将可靠性回归纳入默认站点测试，并让公开目录保持公开解析', () => {
    const packageJson = readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
    const postOffice = read('api/postOffice.ts')

    expect(packageJson).toContain('tests/ui-reliability-static.test.ts')
    expect(postOffice).toContain('parsePublicResponse')
    expect(postOffice).toContain('return parsePublicResponse<ClassmateEntry[]>(res, \'同学目录加载失败\')')
  })
})
