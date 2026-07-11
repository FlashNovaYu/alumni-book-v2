import type { ClassSpaceOverview } from '@alumni/shared'
import { requestClassmateApi } from './classmateRequest'

export async function fetchClassSpaceOverview(apiBase: string): Promise<ClassSpaceOverview> {
  return requestClassmateApi(apiBase, '/api/class-space/overview', {}, '班级空间加载失败')
}
