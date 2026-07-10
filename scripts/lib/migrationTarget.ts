export type MigrationTarget = '--local' | '--remote'

export function resolveMigrationTarget(args: readonly string[]): MigrationTarget {
  const useLocal = args.includes('--local')
  const useRemote = args.includes('--remote')

  if (useLocal && useRemote) {
    throw new Error('不能同时使用 --local 和 --remote')
  }

  return useRemote ? '--remote' : '--local'
}
