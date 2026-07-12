import { clearClassmateSession } from '@alumni/shared'

export const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'

export function handleClassmateUnauthorized(): never {
  clearClassmateSession()
  try {
    sessionStorage.removeItem('alumni_nav_admin_entry')
  } catch {}
  if (typeof window !== 'undefined') {
    window.location.assign(import.meta.env.BASE_URL || '/')
  }
  throw new Error(SESSION_EXPIRED_MESSAGE)
}
