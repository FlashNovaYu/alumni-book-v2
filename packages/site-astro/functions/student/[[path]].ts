type StudentPagesEnv = {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

type StudentPagesContext = {
  request: Request
  env: StudentPagesEnv
}

export const onRequest = async ({ request, env }: StudentPagesContext) => {
  const assetResponse = await env.ASSETS.fetch(request)
  if (assetResponse.status !== 404) return assetResponse

  const templateUrl = new URL('/student/template/', request.url)
  return env.ASSETS.fetch(new Request(templateUrl, request))
}
