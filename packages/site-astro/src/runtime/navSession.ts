import { getClassmateStudent, getClassmateToken } from '@alumni/shared'

interface NavSessionRuntime { destroy(): void }

declare global {
  interface Window { __alumniNavSession?: NavSessionRuntime }
}

function isHome(path: string) {
  return path === '/' || path.endsWith('/index.html') || path.endsWith('/alumni-book-v2/')
}

export function initNavSession(apiBase: string) {
  window.__alumniNavSession?.destroy()
  const path = window.location.pathname
  const session = getClassmateToken()
  const student = getClassmateStudent<{ slug?: string }>()
  const adminEntry = sessionStorage.getItem('alumni_nav_admin_entry')
  if (session && student?.slug && adminEntry) {
    try {
      const parsed = JSON.parse(adminEntry) as { studentSlug?: string; available?: boolean }
      document.documentElement.classList.toggle('has-admin-entry', parsed.studentSlug === student.slug && parsed.available === true)
    } catch {}
  }

  const isExempt = isHome(path) || path.includes('/admin/') || path.includes('/404')
  let cancelled = false
  if (!isExempt && !session) {
    const adminToken = sessionStorage.getItem('admin_token')
    if (adminToken) {
      fetch(apiBase + '/api/auth/verify', { headers: { Authorization: 'Bearer ' + adminToken } })
        .then((response) => {
          if (!response.ok && !cancelled) window.location.replace(path.includes('/alumni-book-v2/') ? '/alumni-book-v2/' : '/')
        })
        .catch(() => {
          if (!cancelled) window.location.replace(path.includes('/alumni-book-v2/') ? '/alumni-book-v2/' : '/')
        })
    } else {
      window.location.replace(path.includes('/alumni-book-v2/') ? '/alumni-book-v2/' : '/')
    }
  }

  const runtime: NavSessionRuntime = { destroy() { cancelled = true } }
  window.__alumniNavSession = runtime
  return runtime
}
