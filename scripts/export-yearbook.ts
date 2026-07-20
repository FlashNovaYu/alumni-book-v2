/**
 * 同学录纪念册单 HTML 导出脚本
 *
 * 使用方法:
 *   npx tsx scripts/export-yearbook.ts          # 基于本地 D1 数据导出
 *   npx tsx scripts/export-yearbook.ts --remote # 基于远程 D1 数据导出
 */

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const isRemote = process.argv.includes('--remote')
const mode = isRemote ? '--remote' : '--local'
const fileApiBase = (process.env.VITE_SSG_API_BASE || '').trim().replace(/\/+$/, '')

function fileUrl(value: string): string {
  if (/^https?:\/\//.test(value)) return value
  return `${fileApiBase}${value.startsWith('/') ? value : `/api/files/${value}`}`
}

console.log(`================================================`)
console.log(`  同学录单文件 HTML 纪念册导出中... [数据源: ${isRemote ? '远程' : '本地'}]`)
console.log(`================================================\n`)

try {
  // 1. 获取班级寄语配置
  console.log('正在拉取班级寄语配置...')
  const configCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT key, value FROM site_config"`
  const configOutput = execSync(configCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const configData = JSON.parse(configOutput)[0]?.results || []
  
  const siteConfig: Record<string, any> = {}
  configData.forEach((row: any) => {
    try {
      siteConfig[row.key] = JSON.parse(row.value)
    } catch {
      siteConfig[row.key] = row.value
    }
  })
  
  const preface = siteConfig.preface || { title: '致青春岁月', subtitle: '写在翻开同学录之前', content: '那些年，我们一起走过的日子...' }

  // 2. 获取同学列表
  console.log('正在拉取同窗好友名录...')
  const studentsCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT name, slug, avatar_url, info FROM students ORDER BY name"`
  const studentsOutput = execSync(studentsCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const students = JSON.parse(studentsOutput)[0]?.results || []

  // 3. 获取所有审核通过的留言
  console.log('正在拉取留言墙寄语...')
  const msgCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT author_name, content, created_at FROM messages WHERE is_approved = 1 AND is_hidden = 0 ORDER BY pinned DESC, created_at DESC"`
  const msgOutput = execSync(msgCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const messages = JSON.parse(msgOutput)[0]?.results || []

  // 4. 获取相册与照片
  console.log('正在拉取班级回忆相簿...')
  const albumsCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT id, title, description FROM albums ORDER BY sort_order"`
  const albumsOutput = execSync(albumsCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const albums = JSON.parse(albumsOutput)[0]?.results || []

  const photosCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT album_id, filename, caption, r2_key FROM photos ORDER BY sort_order"`
  const photosOutput = execSync(photosCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const photos = JSON.parse(photosOutput)[0]?.results || []

  // 拼接照片到相册中
  const albumsWithPhotos = albums.map((alb: any) => {
    return {
      ...alb,
      photos: photos.filter((p: any) => p.album_id === alb.id)
    }
  })

  // 5. 组合生成单文件 HTML
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  
  // HTML 模板
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>青春不散场 · 班级毕业纪念册</title>
  <style>
    :root {
      --color-primary: #cc785c;
      --color-ink: #2b2b2b;
      --color-muted: #7f7f7f;
      --color-bg: #faf9f5;
      --color-card: #ffffff;
      --color-border: #e6dfd5;
      --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: var(--font-body);
      color: var(--color-ink);
      background-color: var(--color-bg);
      line-height: 1.6;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    .text-center { text-align: center; }
    
    .card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.02);
    }
    
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    
    /* 封面 */
    .cover {
      min-height: 80vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    
    .cover-title {
      font-size: 48px;
      color: var(--color-primary);
      margin-bottom: 12px;
      font-weight: 700;
    }
    
    .cover-subtitle {
      font-size: 18px;
      color: var(--color-muted);
      margin-bottom: 32px;
    }
    
    .cover-line {
      width: 60px;
      height: 3px;
      background: var(--color-primary);
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 24px;
      color: var(--color-primary);
      border-bottom: 2px solid var(--color-primary);
      padding-bottom: 8px;
      margin-bottom: 24px;
      margin-top: 40px;
    }
    
    /* 寄语 */
    .preface-title { font-size: 20px; margin-bottom: 8px; font-weight: 600; }
    .preface-sub { font-size: 14px; color: var(--color-muted); margin-bottom: 16px; }
    .preface-text { white-space: pre-wrap; color: #4e342e; line-height: 1.8; }
    
    /* 同学名录 */
    .mate-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    
    .mate-card {
      padding: 16px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .mate-avatar {
      width: 64px; height: 64px;
      border-radius: 50%;
      background: var(--color-border);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: bold; color: var(--color-muted);
      margin-bottom: 12px;
      overflow: hidden;
      border: 1px solid var(--color-border);
    }
    
    .mate-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .mate-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .mate-motto { font-size: 12px; color: var(--color-muted); font-style: italic; }
    
    /* 留言板 */
    .msg-item {
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .msg-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .msg-author { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .msg-content { font-size: 13px; color: #333; line-height: 1.5; }
    .msg-time { font-size: 11px; color: var(--color-muted); margin-top: 4px; }
    
    /* 相册 */
    .album-box { margin-bottom: 32px; }
    .album-title { font-size: 18px; margin-bottom: 12px; color: var(--color-primary); }
    .album-photos {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .photo-item {
      position: relative;
      aspect-ratio: 1;
      border: 4px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .photo-item img { width: 100%; height: 100%; object-fit: cover; }
    .photo-cap {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.6); color: #fff;
      font-size: 11px; padding: 4px; text-align: center;
    }
    
    /* 打印 */
    @media print {
      body { background: #fff; padding: 0; font-size: 11pt; }
      .card { border: 1px solid #ccc; box-shadow: none; }
      .photo-item { border: 1px solid #ccc; box-shadow: none; }
    }
    
    @media (max-width: 600px) {
      .mate-grid { grid-template-columns: repeat(2, 1fr); }
      .album-photos { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- 封面 -->
    <div class="cover page-break">
      <h1 class="cover-title">青春不散场</h1>
      <p class="cover-subtitle">班级纪念册离线专版</p>
      <div class="cover-line"></div>
      <p style="font-size: 13px; color: var(--color-muted);">导出日期: ${dateStr}</p>
    </div>

    <!-- 寄语 -->
    <div class="page-break">
      <h2 class="section-title">✍️ 班级寄语</h2>
      <div class="card">
        <h3 class="preface-title">${escape(preface.title)}</h3>
        <p class="preface-sub">${escape(preface.subtitle)}</p>
        <p class="preface-text">${escape(preface.content)}</p>
      </div>
    </div>

    <!-- 同学名录 -->
    <div class="page-break">
      <h2 class="section-title">👥 同窗好友名录</h2>
      <div class="mate-grid">
        ${students.map((mate: any) => {
          let info: any = {}
          try { info = JSON.parse(mate.info || '{}') } catch {}
          const motto = info.motto || '留念'
          const avatarHtml = mate.avatar_url 
            ? `<img src="${fileUrl(mate.avatar_url)}" />`
            : `<span>${mate.name.charAt(0)}</span>`
            
          return `
          <div class="mate-card card">
            <div class="mate-avatar">${avatarHtml}</div>
            <div class="mate-name">${escape(mate.name)}</div>
            <div class="mate-motto">“${escape(motto)}”</div>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- 留言板 -->
    <div class="page-break">
      <h2 class="section-title">💬 寄语留言板</h2>
      <div class="card">
        ${messages.map((msg: any) => `
        <div class="msg-item">
          <div class="msg-author">${escape(msg.author_name)}</div>
          <div class="msg-content">${escape(msg.content)}</div>
          <div class="msg-time">${new Date(msg.created_at).toLocaleDateString('zh-CN')}</div>
        </div>`).join('')}
        ${messages.length === 0 ? '<p style="color:var(--color-muted);text-align:center;">暂无留言</p>' : ''}
      </div>
    </div>

    <!-- 班级回忆相簿 -->
    <div>
      <h2 class="section-title">📸 班级回忆相簿</h2>
      ${albumsWithPhotos.map((alb: any) => `
      <div class="album-box">
        <h3 class="album-title">${escape(alb.title)}</h3>
        <p style="font-size:13px;color:var(--color-muted);margin-bottom:12px;">${escape(alb.description || '')}</p>
        <div class="album-photos">
          ${alb.photos.map((p: any) => `
          <div class="photo-item">
            <img src="${fileUrl(p.r2_key)}" />
            ${p.caption ? `<div class="photo-cap">${escape(p.caption)}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>`).join('')}
    </div>
  </div>
</body>
</html>`

  function escape(str: string): string {
    if (!str) return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // 写入 yearbook.html 离线版
  const outputPath = resolve(__dirname, '../yearbook.html')
  writeFileSync(outputPath, htmlContent, 'utf-8')
  console.log(`\n🎉 纪念册已成功导出为单文件网页！`)
  console.log(`保存路径: ${outputPath}`)

} catch (e: any) {
  console.error('❌ 纪念册导出发生错误:', e.message || e)
}
