import type { ApiResponse, ClassSpaceOverview } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export async function fetchClassSpaceOverview(apiBase: string): Promise<ClassSpaceOverview> {
  const res = await fetch(joinApiUrl(apiBase, '/api/class-space/overview'))
  const data = await res.json() as ApiResponse<ClassSpaceOverview>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '班级空间加载失败')
  return data.data
}