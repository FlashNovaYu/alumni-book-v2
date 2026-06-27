import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const distDir = path.resolve('packages/site-astro/dist');

if (!fs.existsSync(distDir)) {
  console.error(`❌ dist 目录不存在，请先执行打包: pnpm --filter site-astro build`);
  process.exit(1);
}

// 辅助函数：提取 HTML 关联的入口 JS 文件（包括 <script src>，component-url 和 link rel="modulepreload"）
function getPageEntryScripts(htmlPath) {
  if (!fs.existsSync(htmlPath)) return [];
  const content = fs.readFileSync(htmlPath, 'utf-8');
  const scripts = [];
  
  // script src
  const srcMatches = content.matchAll(/src="([^"]+\.js)"/g);
  for (const match of srcMatches) {
    scripts.push(match[1]);
  }
  
  // component-url
  const componentMatches = content.matchAll(/component-url="([^"]+\.js)"/g);
  for (const match of componentMatches) {
    scripts.push(match[1]);
  }
  
  // modulepreload href
  const preloadMatches = content.matchAll(/href="([^"]+\.js)"/g);
  for (const match of preloadMatches) {
    scripts.push(match[1]);
  }
  
  // 转换成绝对物理路径并去重
  return Array.from(new Set(
    scripts
      .map(src => {
        const cleanSrc = src
          .replace(/^\/alumni-book-v2/, '')
          .replace(/^\/+/, '');
        return path.resolve(distDir, cleanSrc);
      })
      .filter(p => p.startsWith(distDir) && fs.existsSync(p))
  ));
}

// 辅助函数：递归提取 JS 的全部依赖链
function getRecursiveImports(entryJsPath, visited = new Set()) {
  if (visited.has(entryJsPath)) return visited;
  visited.add(entryJsPath);
  
  if (!fs.existsSync(entryJsPath)) return visited;
  const content = fs.readFileSync(entryJsPath, 'utf-8');
  
  // 静态 import
  const importRegex = /import\s+(?:[\w*\s{},]+from\s+)?['"](\.\/[^'"]+\.js)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importedPath = path.resolve(path.dirname(entryJsPath), match[1]);
    getRecursiveImports(importedPath, visited);
  }
  
  // Vite mapDeps preload
  const mapDepsRegex = /m\.f\s*=\s*(\[[^\]]+\])/g;
  const mapDepsMatch = mapDepsRegex.exec(content);
  if (mapDepsMatch) {
    try {
      const depsArray = JSON.parse(mapDepsMatch[1].replace(/'/g, '"'));
      for (const dep of depsArray) {
        const depPath = path.resolve(distDir, dep);
        getRecursiveImports(depPath, visited);
      }
    } catch (e) {
      // ignore
    }
  }
  
  return visited;
}

// 预算设定
const pagesBudget = {
  '/': {
    name: '首页 (Home)',
    html: 'index.html',
    maxInitialJsGzipKb: 55,
    forbiddenAssets: ['ScrollTrigger', 'gsap'],
  },
  '/timeline/': {
    name: '时光轴 (Timeline)',
    html: 'timeline/index.html',
    maxInitialJsGzipKb: 45,
    forbiddenAssets: ['ScrollTrigger', 'gsap'],
  },
  '/roster/': {
    name: '同学录 (Roster)',
    html: 'roster/index.html',
    maxInitialJsGzipKb: 95,
    forbiddenAssets: ['ScrollTrigger', 'gsap'],
  },
  '/student/template/': {
    name: '学生详情页 (Student Template)',
    html: 'student/template/index.html',
    maxInitialJsGzipKb: 145,
    forbiddenAssets: [],
  }
};

let budgetViolated = false;

console.log('\n📊 --- 页面级首屏 JS 真实体积及依赖审计 ---');

for (const [pagePath, config] of Object.entries(pagesBudget)) {
  const htmlFilePath = path.join(distDir, config.html);
  if (!fs.existsSync(htmlFilePath)) {
    console.log(`- ⚠️ 页面 ${config.name} 对应的 HTML 不存在，跳过。`);
    continue;
  }
  
  const entries = getPageEntryScripts(htmlFilePath);
  const allDeps = new Set();
  for (const entry of entries) {
    getRecursiveImports(entry, allDeps);
  }
  
  let pageJsTotalSize = 0;
  let pageJsTotalGzip = 0;
  const filesList = [];
  const hitForbidden = [];
  
  for (const file of allDeps) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file);
    const size = content.length;
    const gzip = zlib.gzipSync(content).length;
    
    pageJsTotalSize += size;
    pageJsTotalGzip += gzip;
    
    const fileBasename = path.basename(file);
    filesList.push({ name: fileBasename, size, gzip });
    
    // 检查禁用资源
    const jsText = content.toString('utf-8');
    for (const token of config.forbiddenAssets) {
      if (jsText.includes(token)) {
        hitForbidden.push({ file: fileBasename, token });
      }
    }
  }
  
  const totalGzipKb = (pageJsTotalGzip / 1024).toFixed(2);
  const statusOk = pageJsTotalGzip <= config.maxInitialJsGzipKb * 1024 && hitForbidden.length === 0;
  
  console.log(`\n📄 页面: ${config.name} (${pagePath})`);
  console.log(`- HTML 入口 js 数量: ${entries.length}，依赖链合计 JS 数量: ${allDeps.size}`);
  console.log(`- 首屏 JS 合计大小: ${(pageJsTotalSize / 1024).toFixed(2)} KB (Gzip: ${totalGzipKb} KB)`);
  console.log(`- 页面预算限制: Gzip <= ${config.maxInitialJsGzipKb} KB`);
  
  if (pageJsTotalGzip > config.maxInitialJsGzipKb * 1024) {
    console.warn(`❌ [ALERT] 超过 Gzip 体积预算！实际: ${totalGzipKb} KB, 预算: ${config.maxInitialJsGzipKb} KB`);
    budgetViolated = true;
  }
  
  if (hitForbidden.length > 0) {
    console.warn(`❌ [ALERT] 违规包含禁止依赖！`);
    for (const hit of hitForbidden) {
      console.warn(`  - 文件 ${hit.file} 中包含禁止标记: '${hit.token}'`);
    }
    budgetViolated = true;
  }
  
  if (statusOk) {
    console.log(`✅ 该页面预算审计通过。`);
  }
  
  // 打印详细文件列表
  if (process.env.DEBUG || budgetViolated) {
    console.log(`  细节依赖列表:`);
    filesList.forEach(f => {
      console.log(`    * ${f.name} (大小: ${(f.size/1024).toFixed(2)}KB, Gzip: ${(f.gzip/1024).toFixed(2)}KB)`);
    });
  }
}

if (budgetViolated) {
  console.error('\n❌ 性能预算校验未通过，请检查上述页面依赖链。');
  process.exit(1);
} else {
  console.log('\n✅ 所有页面首屏体积及禁用依赖审计全部成功！');
}
