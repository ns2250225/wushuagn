import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { distantArmies, factionChar } from './common';

// 成都：城墙、宫殿、街道、石阶
export function build(env: Environment, lv: LevelDef): void {
  env.lighting = { sky: 0xd0e0f0, ground: 0x5a5a50, sun: 0xfff4e0, sunIntensity: 2.2, ambient: 1.1, fog: 0xb8c4cc, fogNear: 40, fogFar: 150, sunDir: [0.3, 1, -0.4] };
  env.skyTop = 0x5a7ab8;
  env.skyBottom = 0xd8e4ee;
  env.ground('cobble', 0xd0d0d0);
  env.groundPatch('marble', 0, 10, 16, 140, 0.02, 0xe8e0d0);
  env.border('stone', 0.2);
  env.clouds(20);
  const ec = factionChar(lv.enemy.name);
  const shu = lv.ally.flag;

  // 外城墙（玩家身后）
  env.wall('wallDark', -40, -61, -7, -61, 8, 2, true);
  env.wall('wallDark', 7, -61, 40, -61, 8, 2, true);
  for (let x = -6; x <= 6; x++) for (let y = 6; y < 9; y++) env.block('wallDark', x, y, -61);

  // 街道两侧民居
  for (const side of [-1, 1]) {
    for (const z of [-44, -30, -16, -2, 12]) {
      env.house(side * 32, z, 8, 8, z % 4 === 0 ? 'planks' : 'brick', 'roof', 4);
      env.flag(side * 26, z + 3, shu, '蜀', 5);
    }
  }
  for (const z of [-50, -40, -24, -8, 6]) {
    env.brazier(-10, z);
    env.brazier(10, z);
  }

  // 内城墙与城门（敌军攻城车正在撞击）
  env.wall('brick', -40, 28, -7, 28, 7, 2, true);
  env.wall('brick', 7, 28, 40, 28, 7, 2, true);
  for (const x of [-7, 7]) for (let y = 0; y < 10; y++) env.block('red', x, y, 28);
  for (let x = -8; x <= 8; x++) for (let z = 26; z <= 30; z++) env.block('roof', x, 10, z);
  env.destructible('tower1', 'tower', -14, 21);
  env.destructible('tower2', 'tower', 14, 21);
  env.fireAt(-20, 7.5, 28, 1);
  env.smokeAt(-20, 9, 28);
  env.fireAt(24, 7.5, 28, 1);
  env.smokeAt(24, 9, 28);
  for (const x of [-22, 22]) env.flag(x, 18, lv.enemy.flag, ec, 7);

  // 宫殿前石阶与广场
  for (let i = 0; i < 3; i++) for (let x = -10 + i; x <= 10 - i; x++) env.block('marble', x, i, 56 + i * 1.2, 1, 1, 1.2);
  env.collider(0, 58, 21, 4, 2);
  env.palace(0, 65, 22, 6);
  for (const x of [-16, 16]) {
    env.flag(x, 50, shu, '汉', 8);
    env.brazier(x * 0.6, 46);
  }
  env.house(-28, 52, 8, 10, 'marble', 'roofGold', 5);
  env.house(28, 52, 8, 10, 'marble', 'roofGold', 5);
  env.tree(-16, 38, 6);
  env.tree(16, 38, 6);
  env.tree(-26, 38, 5);
  env.tree(26, 38, 5);
  distantArmies(env, lv);
}
