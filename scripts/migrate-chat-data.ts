import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  legacyChatMigrationStatements,
  generateChatMigrationReport,
  assertChatMigrationReport,
  verifyChatMigrationTargets
} from './lib/chatMigration.js';
import { resolveMigrationTarget, type MigrationTarget } from './lib/migrationTarget.js';

// 支持在 ESM 模式下获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MockD1Database {
  private target: MigrationTarget;
  
  constructor(target: MigrationTarget) {
    this.target = target;
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
    const cleanSql = sql.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    // 转义双引号以适用于命令行 --command
    const escapedSql = cleanSql.replace(/"/g, '\\"');
    
    const cmd = `pnpm --filter worker exec wrangler d1 execute alumni-book-db --command="${escapedSql}" ${this.target} --json`;
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
  const target = resolveMigrationTarget(args);
  const db = new MockD1Database(target);
  let tempSqlFile: string | null = null;

  try {
    // 1. 迁移执行前：收集源数据库状态和数据总数
    const beforeReport = await generateChatMigrationReport(db);

    // 2. 将生成的静态 SQL 语句批量写入临时文件，并通过 wrangler 在真实数据库上执行
    tempSqlFile = resolve(__dirname, 'temp-migration-chat.sql');
    writeFileSync(tempSqlFile, legacyChatMigrationStatements.join('\n;\n') + '\n;', 'utf-8');

    const executeCmd = `pnpm --filter worker exec wrangler d1 execute alumni-book-db --file="${tempSqlFile}" ${target}`;
    execSync(executeCmd, { stdio: 'pipe' });

    // 3. 迁移执行后：重新采集并拉取目标表的真实计数值及 Anomalies 数量
    const afterReport = await generateChatMigrationReport(db);

    // 4. 对执行后的报表做严格强一致性断言校验
    assertChatMigrationReport(afterReport);
    if (
      beforeReport.sourcePrivateThreads !== afterReport.sourcePrivateThreads ||
      beforeReport.sourcePrivateMessages !== afterReport.sourcePrivateMessages
    ) {
      throw new Error('Migration verification failed: source data changed during migration');
    }

    const targets = await verifyChatMigrationTargets(db);
    const missingTargets = [
      ['direct conversations', targets.missingDirectConversations, targets.expectedDirectConversations],
      ['direct messages', targets.missingDirectMessages, targets.expectedDirectMessages],
      ['notifications', targets.missingNotifications, targets.expectedNotifications],
    ].filter(([, missing]) => missing > 0);
    if (missingTargets.length > 0) {
      throw new Error(`Migration verification failed: ${missingTargets.map(([kind, missing, expected]) => `${kind} missing ${missing}/${expected}`).join(', ')}`);
    }

    // 5. 校验通过，控制台只在末尾输出标准的 JSON 迁移报告以供外部集成读取
    console.log(JSON.stringify(afterReport, null, 2));
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (tempSqlFile) {
      try {
        unlinkSync(tempSqlFile);
      } catch {
        // 忽略临时文件不存在等无关异常
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  runMigration().catch((err) => {
    console.error('Fatal error during migration runner:', err);
    process.exitCode = 1;
  });
}
