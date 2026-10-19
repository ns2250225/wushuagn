import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { camp, distantArmies, factionChar, rand, rocks, scatterTrees } from './common';

// 虎牢关：城墙、城门、营帐、拒马、战旗
export function build(env: Environment, lv: LevelDef): void {
  const r = rand(190);
  env.lighting = { sky: 0xd8e0ff, ground: 0x6a5a40, sun: 0xffe2b8, sunIntensity: 2.4, ambient: 1.0, fog: 0xd8c8b0, fogNear: 45, fogFar: 170, sunDir: [-0.4, 1, 0.5] };
  env.skyTop = 0x6a8ad0;
  env.skyBottom = 0xf0d8b0;
  env.ground('grassTop');
  env.groundPatch('path', 0, -9, 10, 106);
  env.groundPatch('cobble', 0, 58, 80, 24, 0.02);
  env.border('grass', 0.7);
  env.clouds(26);

  const ally = lv.ally.flag;
  const enemy = lv.enemy.flag;
  const ac = factionChar(lv.ally.name);
  const ec = factionChar(lv.enemy.name);

  // 联军营地
  env.tent(-14, -56, lv.ally.cloth, 0);
  env.tent(14, -56, lv.ally.cloth, 0);
  env.tent(-24, -50, lv.ally.cloth, 0.4);
  env.tent(24, -50, lv.ally.cloth, -0.4);
  for (const x of [-8, 8]) env.flag(x, -50, ally, ac, 7);
  env.brazier(-6, -46);
  env.brazier(6, -46);

  const onRoad = (x: number, z: number) => Math.abs(x) < 8 || (z > -4 && z < 4) || z > 40;
  scatterTrees(env, r, 26, -38, 38, -46, -6, (x, z) => onRoad(x, z) || Math.abs(x) < 12);
  rocks(env, r, 10, -36, 36, -40, -8, (x, z) => Math.abs(x) < 10);

  // 拒马防线 z=0：栅栏 + 三处可破坏拒马
  env.wall('planks', -40, 0, -19, 0, 2, 1, true);
  env.wall('planks', -9, 0, -5, 0, 2, 1, true);
  env.wall('planks', 5, 0, 9, 0, 2, 1, true);
  env.wall('planks', 19, 0, 40, 0, 2, 1, true);
  env.destructible('jm1', 'barricade', -14, 0, { w: 8 });
  env.destructible('jm2', 'barricade', 0, 0, { w: 8 });
  env.destructible('jm3', 'barricade', 14, 0, { w: 8 });
  env.flag(-7, 1, enemy, ec, 6);
  env.flag(7, 1, enemy, ec, 6);

  // 董卓军营寨
  camp(env, -26, 20, lv.enemy.cloth, ec, 4, 7);
  camp(env, 26, 20, lv.enemy.cloth, ec, 4, 7);
  env.spikes(-12, 12, 6, 0.3);
  env.spikes(12, 12, 6, -0.3);
  env.spikes(-16, 36, 6, 0);
  env.spikes(16, 36, 6, 0);
  for (const x of [-30, -18, 18, 30]) env.flag(x, 38, enemy, ec, 7);
  env.brazier(-5, 30);
  env.brazier(5, 30);

  // 虎牢关城墙与城门
  env.wall('brick', -40, 45, -6, 45, 9, 3, true);
  env.wall('brick', 6, 45, 40, 45, 9, 3, true);
  env.gate('gate', 0, 45, 10, 8, false);
  // 城门楼
  for (let x = -6; x <= 6; x++) for (let z = 44; z <= 46; z++) env.block('brick', x, 8, z);
  for (let x = -7; x <= 7; x++) for (let z = 43; z <= 47; z++) env.block('brick', x, 9, z);
  for (const x of [-6, -2, 2, 6]) for (let y = 10; y <= 12; y++) env.block('red', x, y, 45);
  for (let x = -8; x <= 8; x++) for (let z = 42; z <= 48; z++) env.block('roof', x, 13, z);
  for (let x = -6; x <= 6; x++) for (let z = 43; z <= 47; z++) env.block('roof', x, 14, z);
  env.block('roofGold', -8, 14, 42);
  env.block('roofGold', 8, 14, 42);
  env.block('roofGold', -8, 14, 48);
  env.block('roofGold', 8, 14, 48);
  for (const x of [-20, -32, 20, 32]) {
    env.fill('wallDark', x - 2, 9, 44, x + 2, 12, 46, true);
    for (let xx = x - 3; xx <= x + 3; xx++) for (let zz = 43; zz <= 47; zz++) env.block('roof', xx, 13, zz);
  }
  for (const x of [-14, -26, 14, 26, -38, 38]) env.flag(x, 47, enemy, ec, 13);
  env.brazier(-8, 41);
  env.brazier(8, 41);

  // 关内
  env.house(-24, 60, 10, 8, 'planks', 'roof', 4);
  env.house(24, 60, 10, 8, 'planks', 'roof', 4);
  env.brazier(-8, 54);
  env.brazier(8, 54);
  env.brazier(-8, 64);
  env.brazier(8, 64);
  env.flag(0, 68, enemy, '吕', 9);

  distantArmies(env, lv);
}
