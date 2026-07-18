export type StudentViewer =
  | { kind: 'public' }
  | { kind: 'admin' }
  | { kind: 'classmate'; slug: string }

export type StudentAudience = 'public' | 'classmates' | 'owner' | 'admin'

type StudentRecord = {
  info?: Record<string, unknown>
  accountStatus?: unknown
  accountLastLoginAt?: unknown
  [key: string]: unknown
}

export function audienceForStudent(viewer: StudentViewer, studentSlug: string): StudentAudience {
  if (viewer.kind === 'admin') return 'admin'
  if (viewer.kind === 'classmate') return viewer.slug === studentSlug ? 'owner' : 'classmates'
  return 'public'
}

export function filterStudentForAudience<T extends StudentRecord>(student: T, audience: StudentAudience) {
  const info = { ...(student.info || {}) }
  const rawVisibility = info.visibility
  const visibility = rawVisibility && typeof rawVisibility === 'object'
    ? rawVisibility as Record<string, string>
    : {}

  for (const key of ['qq', 'wechat', 'phone', 'email', 'address', 'weibo']) {
    const level = visibility[key] || 'classmates'
    if (level === 'owner' && audience !== 'owner' && audience !== 'admin') delete info[key]
    if (level === 'hidden' && audience !== 'admin') delete info[key]
    if (level === 'classmates' && audience === 'public') delete info[key]
  }

  const filtered: StudentRecord = { ...student, info }
  if (audience === 'public') {
    delete info.seatNo
    delete info.dormNo
  }
  if (audience === 'public' || audience === 'classmates') {
    delete filtered.accountStatus
    delete filtered.accountLastLoginAt
  }
  return filtered
}
