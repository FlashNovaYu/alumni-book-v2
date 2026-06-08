/**
 * D1 数据库自动化备份脚本
 *
 * 使用方法:
 *   npx tsx scripts/backup-d1.ts          # 备份本地数据库
 *   npx tsx scripts/backup-d1.ts --remote # 备份远程 Cloudflare D1 数据库
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const isRemote = process.argv.includes('--remote')
const now = new Date()
const timestamp = now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, '0') +
  String(now.getDate()).padStart(2, '0') + '_' +
  String(now.getHours()).padStart(2, '0') +
  String(now.getMinutes()).padStart(2, '0') +
  String(now.getSeconds()).padStart(2, '0')

const filename = `backup_${timestamp}_${isRemote ? 'remote' : 'local'}.sql`
const backupDir = resolve(__dirname, '../backups')

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true })
}

const outputPath = join(backupDir, filename)
const cmd = `npx wrangler d1 export alumni-book-db ${isRemote ? '--remote' : '--local'} --config workers/api/wrangler.toml --output="${outputPath}"`

console.log(`================================================`)
console.log(`  D1 数据库备份中... [模式: ${isRemote ? '远程 (Remote)' : '本地 (Local)'}]`)
console.log(`  目标路径: ${outputPath}`)
console.log(`  执行指令: ${cmd}`)
console.log(`================================================\n`)

try {
  execSync(cmd, { stdio: 'inherit' })
  console.log(`\n✅ 备份完成！备份文件已成功写入。`)
} catch (e: any) {
  console.error(`\n❌ 备份失败:`, e.message || e)
  console.error('提示: 请确保已在本地安装 wrangler 且通过 npx wrangler login 登录了 Cloudflare 账户，以及本地环境已进行了 migrations。')
  process.exit(1)
}
