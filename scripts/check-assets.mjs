// 资源缺失检查工具：读取 ASSET_MANIFEST.md 中引用的本地文件 / 目录并检查是否存在
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(join(root, 'ASSET_MANIFEST.md'), 'utf8');

const refs = new Set();
for (const m of manifest.matchAll(/`((?:src|public)\/[^`]+)`/g)) {
  for (const part of m[1].split(',')) refs.add(part.trim());
}

function expand(p) {
  if (!p.includes('*')) return [p];
  const dir = p.slice(0, p.lastIndexOf('/'));
  const pattern = new RegExp('^' + p.slice(p.lastIndexOf('/') + 1).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  const abs = join(root, dir);
  if (!existsSync(abs)) return [p];
  return readdirSync(abs).filter((f) => pattern.test(f)).map((f) => `${dir}/${f}`);
}

let missing = 0;
let ok = 0;
for (const r of refs) {
  const files = expand(r);
  if (!files.length) {
    console.log(`✗ 未匹配任何文件: ${r}`);
    missing++;
    continue;
  }
  for (const f of files) {
    if (existsSync(join(root, f))) ok++;
    else {
      console.log(`✗ 缺失: ${f}`);
      missing++;
    }
  }
}

// 检查 public/assets 下的外部资源是否都已登记
const assetsDir = join(root, 'public', 'assets');
if (existsSync(assetsDir)) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(assetsDir)) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    if (!manifest.includes(rel)) {
      console.log(`! 未登记到清单: ${rel}`);
      missing++;
    }
  }
}

console.log(`\n资源检查完成：${ok} 个存在，${missing} 个问题。`);
process.exit(missing ? 1 : 0);
