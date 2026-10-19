import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';

// 关卡场景构建的通用工具

export function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 8) / 16777216;
  };
}

export function scatterTrees(env: Environment, r: () => number, n: number, x0: number, x1: number, z0: number, z1: number, avoid: (x: number, z: number) => boolean): void {
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + r() * (x1 - x0));
    const z = Math.round(z0 + r() * (z1 - z0));
    if (avoid(x, z)) continue;
    env.tree(x, z, 4 + Math.floor(r() * 3));
  }
}

export function rocks(env: Environment, r: () => number, n: number, x0: number, x1: number, z0: number, z1: number, avoid: (x: number, z: number) => boolean): void {
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + r() * (x1 - x0));
    const z = Math.round(z0 + r() * (z1 - z0));
    if (avoid(x, z)) continue;
    env.block('cobble', x, 0, z);
    if (r() < 0.5) env.block('stone', x + 1, 0, z);
    if (r() < 0.3) env.block('stone', x, 1, z);
    env.collider(x + 0.5, z, 2, 1, 1.2);
  }
}

export function camp(env: Environment, cx: number, cz: number, color: number, text: string, n = 4, spread = 10): void {
  const r = rand(Math.floor(cx * 7 + cz * 13 + 99));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    env.tent(Math.round(cx + Math.cos(a) * spread), Math.round(cz + Math.sin(a) * spread), color, a);
  }
  env.flag(Math.round(cx), Math.round(cz), color, text, 7, true);
  env.brazier(Math.round(cx + 3), Math.round(cz + 2));
}

// 地图外围远景大军
export function distantArmies(env: Environment, lv: LevelDef): void {
  const b = env.bounds;
  env.armyFormation(0, b.minZ - 24, 6, 30, lv.ally.cloth, 0);
  env.armyFormation(b.minX - 26, -10, 6, 18, lv.ally.cloth, Math.PI / 2);
  env.armyFormation(0, b.maxZ + 26, 6, 32, lv.enemy.cloth, Math.PI);
  env.armyFormation(b.maxX + 26, 20, 6, 18, lv.enemy.cloth, -Math.PI / 2);
}

export function factionChar(name: string): string {
  if (name.includes('董')) return '董';
  if (name.includes('曹') || name.includes('魏')) return '魏';
  if (name.includes('袁')) return '袁';
  if (name.includes('孙')) return '吴';
  if (name.includes('刘') || name.includes('蜀')) return '刘';
  return '义';
}
