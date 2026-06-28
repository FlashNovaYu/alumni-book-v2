import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

export const highlightsRoutes = new Hono<{ Bindings: Bindings }>()

// 辅助函数：解析学生的 info JSON 字段
function parseInfo(value: unknown) {
  try {
    return JSON.parse(String(value || '{}'))
  } catch {
    return {}
  }
}

// 获取班级关系图数据
highlightsRoutes.get('/class-graph', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(`
    SELECT s.slug, s.name, s.mbti, s.info, COUNT(m.id) AS message_count
    FROM students s
    LEFT JOIN messages m ON m.student_slug = s.slug AND m.is_approved = 1 AND m.is_hidden = 0
    GROUP BY s.slug
    ORDER BY s.name
  `).all()

  const nodes = (results || []).map((row: any) => {
    const info = parseInfo(row.info)
    return {
      slug: row.slug,
      name: row.name,
      groupName: info.groupName || '',
      mbti: row.mbti || info.mbti || '',
      favoriteSong: info.favoriteSong || '',
      messageCount: Number(row.message_count || 0),
    }
  })

  const edges: any[] = []
  // 双循环构建基于小组（group）和共同爱好（favoriteSong）的关系边
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.groupName && a.groupName === b.groupName) {
        edges.push({ from: a.slug, to: b.slug, reason: 'group', weight: 3 })
      } else if (a.favoriteSong && a.favoriteSong === b.favoriteSong) {
        edges.push({ from: a.slug, to: b.slug, reason: 'interest', weight: 1 })
      }
    }
  }

  // 限制返回边数以保持轻量
  return c.json({ success: true, data: { nodes, edges: edges.slice(0, 40) } })
})

// 获取班级座位图数据
highlightsRoutes.get('/seat-map', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT slug, name, info FROM students ORDER BY name').all()

  let missingSeatCount = 0
  const seats = (results || []).flatMap((row: any) => {
    const info = parseInfo(row.info)
    if (!info.seatNo) {
      missingSeatCount += 1
      return []
    }
    return [{
      slug: row.slug,
      name: row.name,
      seatNo: info.seatNo,
      groupName: info.groupName || '',
    }]
  })

  return c.json({ success: true, data: { seats, missingSeatCount } })
})
