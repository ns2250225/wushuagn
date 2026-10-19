import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { camp, distantArmies, factionChar, rand, rocks } from './common';

// 官渡：平原、粮仓、营寨、战壕
export function build(env: Environment, lv: LevelDef): void {
  const r = rand(200);
  env.lighting = { sky: 0xe8e0c0, ground: 0x7a6a40, sun: 0xfff0c8, sunIntensity: 2.5, ambient: 1.05, fog: 0xd8d0a8, fogNear: 50, fogFar: 175, sunDir: [0.3, 1, 0.6] };
  env.skyTop = 0x7aa0d8;
  env.skyBottom = 0xe8e0c0;
  env.ground('grassTop', 0xd8d090);
  env.groundPatch('dirt', 0, -20, 70, 40, 0.01, 0xe0d0b0);
  env.groundPatch('path', 0, 20, 12, 80, 0.02);
  env.border('grass', 0.3);
  env.clouds(22);
  const ec = factionChar(lv.enemy.name);
  const ac = factionChar(lv.ally.name);

  // 我军阵地
  env.tent(-10, -56, lv.ally.cloth);
  env.tent(10, -56, lv.ally.cloth);
  env.flag(0, -58, lv.ally.flag, ac, 8);

  // 战壕：两侧土垒，中间留出通道
  for (const z of [-36, -14]) {
    for (const [a, b] of [[-38, -6], [6, 38]] as [number, number][]) {
      for (let x = a; x <= b; x++) {
        env.block('dirt', x, 0, z - 1);
        env.block('mud', x, 0, z + 1, 1, 0.5, 1);
        if (x % 3 === 0) env.block('planks', x, 1, z - 1, 0.3, 0.8, 0.3);
      }
      env.collider((a + b) / 2, z - 1, b - a + 1, 1, 1);
    }
    env.groundPatch('mud', 0, z, 80, 1.2, 0.02);
  }
  rocks(env, r, 12, -36, 36, -50, -4, (x) => Math.abs(x) < 8);

  // 乌巢营寨：栅栏围墙
  env.wall('log', -34, 0, -6, 0, 3, 1, true);
  env.wall('log', 6, 0, 34, 0, 3, 1, true);
  env.wall('log', -34, 0, -34, 44, 3, 1, true);
  env.wall('log', 34, 0, 34, 44, 3, 1, true);
  for (const x of [-6, 6]) for (let y = 0; y < 5; y++) env.block('log', x, y, 0);
  env.flag(-8, -1, lv.enemy.flag, ec, 7);
  env.flag(8, -1, lv.enemy.flag, ec, 7);

  // 粮仓
  env.destructible('granary1', 'granary', -18, 10);
  env.destructible('granary2', 'granary', 18, 10);
  env.destructible('granary3', 'granary', -12, 24);
  env.destructible('granary4', 'granary', 12, 24);
  for (const [x, z] of [[-24, 16], [24, 16], [-24, 30], [24, 30]]) {
    env.fill('hay', x - 1, 0, z - 1, x + 1, 1, z + 1);
    env.collider(x, z, 3, 3, 2);
  }
  camp(env, -24, 40, lv.enemy.cloth, ec, 3, 5);
  camp(env, 24, 46, lv.enemy.cloth, ec, 3, 5);
  env.brazier(-4, 14);
  env.brazier(4, 14);
  env.brazier(-4, 30);
  env.brazier(4, 30);

  // 袁绍本阵
  env.wall('planks', -20, 50, -6, 50, 2, 1, true);
  env.wall('planks', 6, 50, 20, 50, 2, 1, true);
  env.house(0, 64, 14, 8, 'planks', 'roofGold', 4);
  for (const x of [-12, 12, -20, 20]) env.flag(x, 54, lv.enemy.flag, '袁', 9);
  env.brazier(-8, 56);
  env.brazier(8, 56);

  distantArmies(env, lv);
}
