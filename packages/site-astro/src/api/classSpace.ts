import type { ClassSpaceOverview } from '@alumni/shared'
import { apiFetch } from './error'

export async function fetchClassSpaceOverview(apiBase: string): Promise<ClassSpaceOverview> {
  return apiFetch<ClassSpaceOverview>(apiBase, '/api/class-space/overview')
}