import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  legacyChatMigrationStatements,
  generateChatMigrationReport,
  assertChatMigrationReport
} from './lib/chatMigration.js';

// 支持在 ESM 模式下获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MockD1Database {
  private isLocal: boolean;
  
  constructor(isLocal: boolean) {
    this.isLocal = isLocal;
  }

  prepare(sql: string) {
    return {
      bind: (...args: any[]) => {
        let boundSql = sql;
        for (const arg of args) {
          const valStr = arg === null || arg === undefined 
            ? 'NULL' 
            : typeof arg === 'string' 
              ? `'${arg.replace(/'/g, "''")}'` 
              : String(arg);
          boundSql = boundSql.replace('?', valStr);
        }
        return {
          all: async () => {
            return this.executeCommand(boundSql);
          },
          first: async () => {
            const res = await this.executeCommand(boundSql);
            return res.results?.[0] || null;
          }
        };
      },
      all: async () => {
        return this.executeCommand(sql);
      },
      first: async () => {
        const res = await this.executeCommand(sql);
        const results = res.results || [];
        return results[0] || null;
      }
    };
  }

  private async executeCommand(sql: string) {
    const localFlag = this.isLocal ? '--local' : '';
    const cleanSql = sql.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    // 转义双引号以适用于命令行 --command
    const escapedSql = cleanSql.replace(/"/g, '\\"');
    
    const cmd = `pnpm --filter worker exec wrangler d1 execute alumni-book-db --command="${escapedSql}" ${localFlag} --json`;
    const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    
    const startIdx = stdout.indexOf('[');
    const endIdx = stdout.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      throw new Error(`Failed to parse D1 output: ${stdout}`);
    }
    const jsonStr = stdout.substring(startIdx, endIdx + 1);
    const data = JSON.parse(jsonStr);
    return data[0] || { results: [] };
  }
}

async function runMigration() {
  const args = process.argv.slice(2);
  const isRemote = args.includes('--remote');
  const isLocal = !isRemote;
  const localFlag = isLocal ? '--local' : '';

  const db = new MockD1Database(isLocal);

  try {
    // 1. 迁移执行前：收集源数据库状态和数据总数
    const beforeReport = await generateChatMigrationReport(db);

    // 2. 将生成的静态 SQL 语句批量写入临时文件，并通过 wrangler 在真实数据库上执行
    const tempSqlFile = resolve(__dirname, 'temp-migration-chat.sql');
    writeFileSync(tempSqlFile, legacyChatMigrationStatements.join('\n;\n') + '\n;', 'utf-8');

    const executeCmd = `pnpm --filter worker exec wrangler d1 execute alumni-book-db --file="${tempSqlFile}" ${localFlag}`;
    execSync(executeCmd, { stdio: 'inherit' });

    // 执行完毕后立即清空删除临时文件，防止残留
    try {
      unlinkSync(tempSqlFile);
    } catch {
      // 忽略文件不存在等无关异常
    }

    // 3. 迁移执行后：重新采集并拉取目标表的真实计数值及 Anomalies 数量
    const afterReport = await generateChatMigrationReport(db);

    // 4. 对执行后的报表做严格强一致性断言校验
    assertChatMigrationReport(afterReport); // 如果有 Anomalies，直接抛错退出

    // 校验私信消息的总条数是否在迁移后达到了和源表完全吻合的期望数量 (防 INSERT OR IGNORE 因非预期原因丢漏消息)
    if (afterReport.directMessages !== afterReport.sourcePrivateMessages) {
      throw new Error(
        `Migration verification failed: Source private messages (${afterReport.sourcePrivateMessages}) and migrated direct messages (${afterReport.directMessages}) count mismatch!`
      );
    }

    // 5. 校验通过，控制台只在末尾输出标准的 JSON 迁移报告以供外部集成读取
    console.log(JSON.stringify(afterReport, null, 2));
    process.exit(0);

  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error('Fatal error during migration runner:', err);
  process.exit(1);
});
