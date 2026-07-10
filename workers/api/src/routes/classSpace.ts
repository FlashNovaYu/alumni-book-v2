import { Hono } from 'hono'
import { getTimelineFeed } from '../lib/timelineFeed'

type Bindings = { DB: D1Database }
export const classSpaceRoutes = new Hono<{ Bindings: Bindings }>()

const parseJson = <T>(value: string | null, fallback: T): T => {
  try { return JSON.parse(value || '') as T } catch { return fallback }
}

classSpaceRoutes.get('/class-space/overview', async (c) => {
  const [messageRows, albumRows, messageCount, albumCount, timeline] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, author_slug, author_name, content, card_style, featured, pinned, reactions, created_at, reviewed_at FROM public_messages WHERE status = 'approved' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 8"
    ).all(),
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.tags,
        COALESCE(a.cover_r2_key, (SELECT p.r2_key FROM photos p WHERE p.album_id = a.id ORDER BY p.sort_order, p.created_at LIMIT 1)) AS cover_r2_key,
        (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count
       FROM albums a ORDER BY a.featured DESC, a.sort_order, a.created_at DESC LIMIT 4`
    ).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM public_messages WHERE status = 'approved'").first(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM albums').first(),
    getTimelineFeed(c.env.DB, { limit: 8 }),
  ])

  const messages = (messageRows.results || []).map((row: any) => ({
    id: row.id,
    authorSlug: row.author_slug,
    authorName: row.author_name,
    content: row.content,
    cardStyle: row.card_style || 'paper',
    status: 'approved',
    featured: !!row.featured,
    pinned: !!row.pinned,
    reactions: parseJson(row.reactions, {}),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  }))
  const albums = (albumRows.results || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    coverR2Key: row.cover_r2_key || null,
    photoCount: Number(row.photo_count || 0),
    tags: parseJson(row.tags, []),
  }))

  c.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
  return c.json({
    success: true,
    data: {
      messages,
      albums,
      timeline,
      counts: {
        approvedMessages: Number((messageCount as any)?.count || 0),
        albums: Number((albumCount as any)?.count || 0),
        timelineItems: timeline.length,
      },
    },
  })
})
