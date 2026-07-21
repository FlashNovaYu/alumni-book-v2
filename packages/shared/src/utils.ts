function getItemDefensive(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function setItemDefensive(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {}
}

function removeItemDefensive(storage: Storage | undefined, key: string): void {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {}
}

function getSessionStorage(): Storage | undefined {
  return typeof sessionStorage !== 'undefined' ? sessionStorage : undefined
}

function getLocalStorage(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined
}

export function getSessionName(): string | null {
  const session = getSessionStorage()
  const local = getLocalStorage()
  let val = getItemDefensive(session, 'classmate_name')
  if (!val && local) {
    val = getItemDefensive(local, 'classmate_name')
    if (val && session) setItemDefensive(session, 'classmate_name', val)
  }
  return val
}

export function setSessionName(name: string): void {
  const session = getSessionStorage()
  const local = getLocalStorage()
  setItemDefensive(session, 'classmate_name', name)
  setItemDefensive(local, 'classmate_name', name)
}

export function clearSession(): void {
  const session = getSessionStorage()
  const local = getLocalStorage()
  removeItemDefensive(session, 'classmate_name')
  removeItemDefensive(local, 'classmate_name')
}

const CLASSMATE_TOKEN_KEY = 'classmate_account_token'
const CLASSMATE_STUDENT_KEY = 'classmate_account_student'

export function getClassmateToken(): string | null {
  const session = getSessionStorage()
  const local = getLocalStorage()
  let token = getItemDefensive(session, CLASSMATE_TOKEN_KEY)
  if (!token && local) {
    token = getItemDefensive(local, CLASSMATE_TOKEN_KEY)
    if (token && session) {
      setItemDefensive(session, CLASSMATE_TOKEN_KEY, token)
    }
  }
  return token
}

export function setClassmateSession(token: string, student: unknown): void {
  const session = getSessionStorage()
  const local = getLocalStorage()
  const studentStr = JSON.stringify(student)
  const name = (student && typeof student === 'object' && 'name' in student) ? String((student as any).name) : null

  setItemDefensive(session, CLASSMATE_TOKEN_KEY, token)
  setItemDefensive(session, CLASSMATE_STUDENT_KEY, studentStr)
  if (name) setItemDefensive(session, 'classmate_name', name)

  setItemDefensive(local, CLASSMATE_TOKEN_KEY, token)
  setItemDefensive(local, CLASSMATE_STUDENT_KEY, studentStr)
  if (name) setItemDefensive(local, 'classmate_name', name)
}

export function getClassmateStudent<T = unknown>(): T | null {
  const session = getSessionStorage()
  const local = getLocalStorage()
  let raw = getItemDefensive(session, CLASSMATE_STUDENT_KEY)
  if (!raw && local) {
    raw = getItemDefensive(local, CLASSMATE_STUDENT_KEY)
    if (raw && session) {
      setItemDefensive(session, CLASSMATE_STUDENT_KEY, raw)
    }
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    removeItemDefensive(session, CLASSMATE_STUDENT_KEY)
    removeItemDefensive(local, CLASSMATE_STUDENT_KEY)
    return null
  }
}

export function clearClassmateSession(): void {
  const session = getSessionStorage()
  const local = getLocalStorage()
  removeItemDefensive(session, CLASSMATE_TOKEN_KEY)
  removeItemDefensive(session, CLASSMATE_STUDENT_KEY)
  removeItemDefensive(session, 'classmate_name')
  removeItemDefensive(local, CLASSMATE_TOKEN_KEY)
  removeItemDefensive(local, CLASSMATE_STUDENT_KEY)
  removeItemDefensive(local, 'classmate_name')
}

export function escapeHtml(text: string): string {
  if (typeof document === 'undefined') {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
