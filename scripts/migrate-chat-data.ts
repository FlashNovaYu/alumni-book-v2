import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { legacyChatMigrationStatements, assertChatMigrationReport } from './lib/chatMigration';

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
        return res.results?.[0] || null;
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
  // 解析命令行参数
  const args = process.argv.slice(2);
  const isRemote = args.includes('--remote');
  const isLocal = !isRemote;
  const localFlag = isLocal ? '--local' : '';

  const db = new MockD1Database(isLocal);

  try {
    // 1. 生成迁移 SQL 和 Report
    const { statements, report } = await legacyChatMigrationStatements(db);

    // 2. 打印 JSON 报告
    console.log(JSON.stringify(report, null, 2));

    // 3. 校验 report 合法性
    assertChatMigrationReport(report);

    // 如果没有要迁移的数据，直接成功返回
    if (statements.length === 0) {
      process.exit(0);
    }

    // 4. 将生成的 SQL 语句批量写入临时文件，并通过 wrangler 执行
    const tempSqlFile = resolve(__dirname, 'temp-migration-chat.sql');
    writeFileSync(tempSqlFile, statements.join('\n;\n') + '\n;', 'utf-8');

    const executeCmd = `pnpm --filter worker exec wrangler d1 execute alumni-book-db --file="${tempSqlFile}" ${localFlag}`;
    execSync(executeCmd, { stdio: 'inherit' });

    // 删除临时文件
    unlinkSync(tempSqlFile);

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
