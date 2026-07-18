import { Hono } from 'hono'
import { encodeCursor, type CursorValue } from '../lib/cursor'
import { getActiveMute, listGroupMessages } from '../lib/groupChat'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { getTimelineFeed } from '../lib/timelineFeed'

type Bindings = { DB: D1Database }
export const classSpaceRoutes = new Hono<{ Bindings: Bindings }>()

const parseJson = <T>(value: string | null, fallback: T): T => {
  try { return JSON.parse(value || '') as T } catch { return fallback }
}

const OVERVIEW_CHAT_WINDOW = 30
const OVERVIEW_CHAT_SCAN_LIMIT = 120

classSpaceRoutes.get('/class-space/overview', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const chatItems = []
  let before: CursorValue | undefined
  let scanned = 0
  while (chatItems.length < OVERVIEW_CHAT_WINDOW && scanned < OVERVIEW_CHAT_SCAN_LIMIT) {
    const page = await listGroupMessages(c.env.DB, identity.slug, { before, includeStatusChanges: true, limit: OVERVIEW_CHAT_WINDOW })
    scanned += page.length
    chatItems.unshift(...page.filter((item) => item.status !== 'hidden'))
    if (page.length < OVERVIEW_CHAT_WINDOW) break
    const oldest = page[0]
    before = { timestamp: oldest.createdAt, id: oldest.id }
  }
  const chat = chatItems.slice(-OVERVIEW_CHAT_WINDOW)

  const [albumRows, groupMessageCount, albumCount, timeline, mute] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.tags,
        COALESCE(a.cover_r2_key, (SELECT p.r2_key FROM photos p WHERE p.album_id = a.id ORDER BY p.sort_order, p.created_at LIMIT 1)) AS cover_r2_key,
        (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count
       FROM albums a ORDER BY a.featured DESC, a.sort_order, a.created_at DESC LIMIT 4`
    ).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM public_messages WHERE status IN ('visible', 'recalled_by_author', 'recalled_by_admin')").first(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM albums').first(),
    getTimelineFeed(c.env.DB, { curatedOnly: true, limit: 6 }),
    getActiveMute(c.env.DB, identity.slug),
  ])

  const groupMessages = Number((groupMessageCount as any)?.count || 0)
  const albums = (albumRows.results || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    coverR2Key: row.cover_r2_key || null,
    photoCount: Number(row.photo_count || 0),
    tags: parseJson(row.tags, []),
  }))

  c.header('Cache-Control', 'private, no-store')
  return c.json({
    success: true,
    data: {
      chat: {
        items: chat,
        cursor: groupMessages > chat.length && chat[0]
          ? encodeCursor({ timestamp: chat[0].createdAt, id: chat[0].id })
          : null,
        mute,
      },
      albums,
      timeline,
      counts: {
        groupMessages,
        albums: Number((albumCount as any)?.count || 0),
        timelineItems: timeline.length,
      },
    },
  })
})
