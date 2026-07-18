import { adminFetch } from './client'
import { DEFAULT_PAGE_SIZE, nextArrayPageCursor, normalizePageResult, pageSearchParams, type PageResult } from './pagination'

export interface ProfileMessage {
  id: string
  studentSlug: string
  authorName: string
  content: string
  isApproved: boolean
  isHidden: boolean
  createdAt: string
  pinned: boolean
  reply?: string | null
}

export type ProfileMessageFilter = 'all' | 'pending' | 'approved'

export async function listProfileMessages(
  filter: ProfileMessageFilter,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<PageResult<ProfileMessage>> {
  const query = pageSearchParams(DEFAULT_PAGE_SIZE, cursor)
  if (filter !== 'all') query.set('approved', filter === 'approved' ? '1' : '0')
  const result = await adminFetch<{ data?: ProfileMessage[] | PageResult<ProfileMessage> }>(`/api/admin/messages?${query}`, { signal })
  // 仅供忽略筛选参数的完整旧接口兼容；现行 Worker 会先按 approved 过滤再 LIMIT。
  const data = result.data
  const legacyArray = Array.isArray(data)
  const legacyFiltered = legacyArray && filter !== 'all'
    ? (data as ProfileMessage[]).filter((message) => filter === 'pending' ? !message.isApproved : message.isApproved)
    : data
  const page = normalizePageResult<ProfileMessage>(legacyFiltered, DEFAULT_PAGE_SIZE, cursor)
  // 旧的 page 数组可能整页都是另一种状态；继续请求下一页，避免前 50 条已通过时看不到待审核。
  if (legacyArray && filter !== 'all' && (data as ProfileMessage[]).length === DEFAULT_PAGE_SIZE && !page.nextCursor) {
    page.nextCursor = nextArrayPageCursor(cursor)
  }
  return page
}
