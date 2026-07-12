import { handle } from 'hono/cloudflare-pages'
import app from '../../../../workers/api/src/index'

export const onRequest = handle(app)
