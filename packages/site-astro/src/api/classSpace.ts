import type { ApiResponse, ClassSpaceOverview } from '@alumni/shared'
import { getClassmateToken } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export async function fetchClassSpaceOverview(apiBase: string): Promise<ClassSpaceOverview> {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/class-space/overview'), {
    headers: token ? { 'X-Classmate-Token': token } : {},
  })
  const data = await res.json() as ApiResponse<ClassSpaceOverview>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '班级空间加载失败')
  return data.data
}
