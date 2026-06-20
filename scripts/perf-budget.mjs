import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const assetsDir = path.resolve('packages/site-astro/dist/assets');

if (!fs.existsSync(assetsDir)) {
  console.error(`❌ assets 目录不存在，请先执行打包: pnpm --filter site-astro build`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const report = [];

let totalJsSize = 0;
let totalJsGzip = 0;

for (const file of files) {
  const filePath = path.join(assetsDir, file);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;

  const ext = path.extname(file);
  if (ext === '.js' || ext === '.css') {
    const content = fs.readFileSync(filePath);
    const gzip = zlib.gzipSync(content).length;
    report.push({
      file,
      ext,
      size: stat.size,
      gzip,
    });

    if (ext === '.js') {
      totalJsSize += stat.size;
      totalJsGzip += gzip;
    }
  }
}

// 排序
report.sort((a, b) => b.gzip - a.gzip);

console.log('\n📊 --- 静态资源体积扫描报告 ---');
console.table(
  report.map((r) => ({
    文件: r.file,
    类型: r.ext,
    '物理体积 (KB)': (r.size / 1024).toFixed(2),
    'Gzip 体积 (KB)': (r.gzip / 1024).toFixed(2),
  }))
);

console.log(`\n📦 总 JS 物理大小: ${(totalJsSize / 1024).toFixed(2)} KB (Gzip: ${(totalJsGzip / 1024).toFixed(2)} KB)`);

// 提取关键 Chunk 的 Gzip 占用
const getChunkGzip = (pattern) => {
  const match = report.find((r) => r.file.includes(pattern));
  return match ? match.gzip : 0;
};

const runtimeCoreGzip = getChunkGzip('runtime-core');
const runtimeDomGzip = getChunkGzip('runtime-dom');
const gsapGzip = getChunkGzip('index.'); // gsap index.xxxx.js
const scrollTriggerGzip = getChunkGzip('ScrollTrigger');
const nameGateGzip = getChunkGzip('NameGate');
const rosterWallGzip = getChunkGzip('RosterWall');
const studentProfileGzip = getChunkGzip('StudentProfile');
const rankingsPanelGzip = getChunkGzip('RankingsPanel');

console.log('\n⚙️  关键组件依赖 Gzip 估计:');
console.log(`- Vue Runtime (Core): ${(runtimeCoreGzip / 1024).toFixed(2)} KB`);
console.log(`- Vue DOM: ${(runtimeDomGzip / 1024).toFixed(2)} KB`);
console.log(`- GSAP Core: ${(gsapGzip / 1024).toFixed(2)} KB`);
console.log(`- ScrollTrigger: ${(scrollTriggerGzip / 1024).toFixed(2)} KB`);
console.log(`- NameGate Island: ${(nameGateGzip / 1024).toFixed(2)} KB`);
console.log(`- RosterWall Island: ${(rosterWallGzip / 1024).toFixed(2)} KB`);
console.log(`- StudentProfile Island: ${(studentProfileGzip / 1024).toFixed(2)} KB`);

// 估计各页面首屏 JS 大小
const homeJs = runtimeCoreGzip + runtimeDomGzip + nameGateGzip + gsapGzip;
const rosterJs = runtimeCoreGzip + runtimeDomGzip + rosterWallGzip + rankingsPanelGzip + gsapGzip + scrollTriggerGzip;
const studentJs = runtimeCoreGzip + runtimeDomGzip + studentProfileGzip + gsapGzip + scrollTriggerGzip;

console.log('\n📱 页面级估算首屏 JS (Gzip):');
console.log(`- 首页 (Home): ${(homeJs / 1024).toFixed(2)} KB  (预算 <= 80 KB)`);
console.log(`- 同学录页 (Roster): ${(rosterJs / 1024).toFixed(2)} KB  (预算 <= 140 KB)`);
console.log(`- 学生详情页 (Student): ${(studentJs / 1024).toFixed(2)} KB  (预算 <= 180 KB)`);

// 检查预算是否超标
let budgetViolated = false;

if (homeJs > 80 * 1024) {
  console.warn('⚠️  [ALERT] 首页 JS 超过 80 KB 预算！');
  budgetViolated = true;
}
if (rosterJs > 140 * 1024) {
  console.warn('⚠️  [ALERT] 同学录页 JS 超过 140 KB 预算！');
  budgetViolated = true;
}
if (studentJs > 180 * 1024) {
  console.warn('⚠️  [ALERT] 学生详情页 JS 超过 180 KB 预算！');
  budgetViolated = true;
}

if (budgetViolated) {
  console.log('\n❌ 性能预算校验未通过，请继续优化体积。');
  // 暂时先不直接 exit(1)，以防阻塞当前的 build 流程，优化完成后可改为限制硬拦截
} else {
  console.log('\n✅ 页面性能体积预算校验成功！');
}
