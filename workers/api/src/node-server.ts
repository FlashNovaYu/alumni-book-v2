import { serve } from '@hono/node-server'
import app from './index'
import { createNodeRuntime, type NodeRuntime } from './runtime/nodeEnv'

export function createNodeFetch(runtime: NodeRuntime) {
  return (request: Request) => app.fetch(
    request,
    runtime.env as never,
    {
      waitUntil(promise: Promise<unknown>) {
        void promise.catch((error) => console.error('Node background task failed:', error))
      },
    } as never,
  )
}

export function startNodeServer() {
  const runtime = createNodeRuntime()
  const port = Number(process.env.PORT || 8787)
  const server = serve({ fetch: createNodeFetch(runtime), port })
  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    server.close(() => {
      try {
        runtime.close()
      } catch (error) {
        console.error('Node runtime close failed:', error)
      }
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  console.log(`Alumni Book API listening on ${port}`)
  return server
}

if (process.argv[1]?.endsWith('node-server.ts') || process.argv[1]?.endsWith('node-server.js')) {
  startNodeServer()
}
