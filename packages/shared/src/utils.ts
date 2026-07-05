const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `请求失败: ${res.status}`)
  }

  return res.json()
}

export function getSessionName(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem('classmate_name')
}

export function setSessionName(name: string): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem('classmate_name', name)
}

export function clearSession(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem('classmate_name')
}

const CLASSMATE_TOKEN_KEY = 'classmate_account_token'
const CLASSMATE_STUDENT_KEY = 'classmate_account_student'

export function getClassmateToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(CLASSMATE_TOKEN_KEY)
}

export function setClassmateSession(token: string, student: unknown): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(CLASSMATE_TOKEN_KEY, token)
  sessionStorage.setItem(CLASSMATE_STUDENT_KEY, JSON.stringify(student))
  if (student && typeof student === 'object' && 'name' in student) {
    sessionStorage.setItem('classmate_name', String((student as any).name))
  }
}

export function getClassmateStudent<T = unknown>(): T | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(CLASSMATE_STUDENT_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function clearClassmateSession(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(CLASSMATE_TOKEN_KEY)
  sessionStorage.removeItem(CLASSMATE_STUDENT_KEY)
  sessionStorage.removeItem('classmate_name')
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
