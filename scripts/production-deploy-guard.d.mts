export interface ProductionDeployContext {
  githubActions?: string
  eventName?: string
  ref?: string
  sha?: string
  head?: string
  confirmation?: string
  dirty?: boolean
}

export function validateProductionDeploy(context: ProductionDeployContext): void
