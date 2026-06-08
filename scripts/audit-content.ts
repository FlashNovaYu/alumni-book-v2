/**
 * 同学录数据内容与隐私安全审计脚本
 *
 * 使用方法:
 *   npx tsx scripts/audit-content.ts          # 审计本地数据
 *   npx tsx scripts/audit-content.ts --remote # 审计远程 Cloudflare D1 数据
 */

import { execSync } from 'child_process'

const isRemote = process.argv.includes('--remote')
const mode = isRemote ? '--remote' : '--local'

console.log(`================================================`)
console.log(`  同学录内容与隐私安全审计中... [模式: ${isRemote ? '远程 (Remote)' : '本地 (Local)'}]`)
console.log(`================================================\n`)

try {
  // 1. 运行 D1 查询拉取学生列表
  const studentsCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT name, slug, avatar_url, edit_secret_hash, info FROM students"`
  
  let studentsOutput = ''
  try {
    studentsOutput = execSync(studentsCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (e: any) {
    console.error('❌ 无法执行 D1 数据查询，请确保数据库已初始化且本地迁移已完成。')
    console.error('提示: 本地开发可以执行 npx wrangler d1 migrations apply alumni-book-db --local')
    process.exit(1)
  }

  const studentsData = JSON.parse(studentsOutput)
  const students = studentsData[0]?.results || []

  console.log(`📊 共有 ${students.length} 位同学参与审计...\n`)
  let issuesCount = 0

  students.forEach((s: any) => {
    const name = s.name
    let info: any = {}
    try {
      info = JSON.parse(s.info || '{}')
    } catch {}

    // A. 审计编辑口令
    if (!s.edit_secret_hash) {
      console.warn(`[⚠️ 安全] 同学【${name}】(slug: ${s.slug}) 未设置自助编辑口令！存在被冒用篡改的风险。`);
      issuesCount++
    }

    // B. 审计隐私可见度
    const visibility = info.visibility || {}
    const sensitive: Record<string, string> = {
      phone: '手机',
      wechat: '微信',
      qq: 'QQ',
      email: '邮箱',
      address: '常住地',
      weibo: '微博',
    }
    const publicFields: string[] = []
    for (const [key, label] of Object.entries(sensitive)) {
      if (visibility[key] === 'public' && info[key]) {
        publicFields.push(label)
      }
    }
    if (publicFields.length > 0) {
      console.warn(`[⚠️ 隐私] 同学【${name}】的敏感联系方式 [${publicFields.join(', ')}] 被设为了“公开”，有泄露风险，建议改为“仅同学可见”。`);
      issuesCount++
    }

    // C. 审计基本资料完整度
    if (!s.avatar_url) {
      console.log(`[ℹ️ 信息] 同学【${name}】未上传头像。`)
    }
    if (!info.motto) {
      console.log(`[ℹ️ 信息] 同学【${name}】未填写座右铭 (motto)。`)
    }
  })

  // 2. 审计未审核留言
  const msgCmd = `npx wrangler d1 execute alumni-book-db ${mode} --config workers/api/wrangler.toml --json --command="SELECT COUNT(*) as count FROM messages WHERE is_approved = 0"`
  const msgOutput = execSync(msgCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  const msgData = JSON.parse(msgOutput)
  const pendingCount = msgData[0]?.results[0]?.count || 0

  if (pendingCount > 0) {
    console.warn(`\n[⚠️ 运营] 当前有 ${pendingCount} 条留言处于待审核状态，正在堆积。`);
    issuesCount++
  } else {
    console.log(`\n✅ 暂无积压的待审核留言。`)
  }

  console.log(`\n================================================`)
  if (issuesCount > 0) {
    console.log(`🚨 审计结束：共发现 ${issuesCount} 项安全、隐私或运营建议。请尽快登录管理后台处理。`)
  } else {
    console.log(`🎉 审计结束：未发现安全或隐私隐患，表现完美！`)
  }
  console.log(`================================================`)

} catch (e: any) {
  console.error('❌ 审计执行发生错误:', e.message || e)
}
