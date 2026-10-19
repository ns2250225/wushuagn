import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { camp, distantArmies, factionChar } from './common';

// 洛阳：城门、宫殿、石板路、军营
export function build(env: Environment, lv: LevelDef): void {
  env.lighting = { sky: 0xb0a0c8, ground: 0x4a3a40, sun: 0xffd0b0, sunIntensity: 1.9, ambient: 0.95, fog: 0x8a7a90, fogNear: 35, fogFar: 140, sunDir: [-0.5, 0.8, 0.3] };
  env.skyTop = 0x3a2a5a;
  env.skyBottom = 0xd8a0a0;
  env.ground('stone', 0xb0aaa8);
  env.groundPatch('cobble', 0, -10, 18, 110, 0.02);
  env.groundPatch('marble', 0, 50, 50, 36, 0.025, 0xd8d0c8);
  env.border('wallDark', 0.1);
  env.clouds(14);
  const ec = factionChar(lv.enemy.name);
  const ac = factionChar(lv.ally.name);

  // 联军入城处
  env.flag(-6, -58, lv.ally.flag, ac, 8);
  env.flag(6, -58, lv.ally.flag, ac, 8);

  // 军营
  camp(env, -26, -34, lv.enemy.cloth, ec, 3, 6);
  camp(env, 26, -34, lv.enemy.cloth, ec, 3, 6);
  env.house(-30, -10, 8, 10, 'wallDark', 'roof', 4);
  env.house(30, -10, 8, 10, 'wallDark', 'roof', 4);
  env.spikes(-14, -22, 6, 0.4);
  env.spikes(14, -22, 6, -0.4);
  for (const z of [-44, -28, -12]) {
    env.brazier(-11, z);
    env.brazier(11, z);
  }
  env.smokeAt(-30, 6, -10);
  env.fireAt(-30, 5, -10, 0.8);

  // 宫城墙与宫门（可破坏）
  env.wall('red', -40, 14, -7, 14, 8, 2, true);
  env.wall('red', 7, 14, 40, 14, 8, 2, true);
  for (let x = -40; x <= 40; x++) for (let z = 13; z <= 15; z++) if (x < -6 || x > 6) env.block('roof', x, 8, z);
  env.gate('gate', 0, 14, 12, 8, true, 4500);
  for (const x of [-7, 7]) for (let y = 0; y < 11; y++) env.block('gold', x, y, 14, 1.2, 1, 1.2);
  for (let x = -9; x <= 9; x++) for (let z = 12; z <= 16; z++) env.block('roofGold', x, 11, z);
  for (const x of [-18, -30, 18, 30]) env.flag(x, 11, lv.enemy.flag, ec, 7);

  // 内庭
  for (const x of [-18, 18]) {
    env.house(x * 1.4, 34, 8, 8, 'marble', 'roof', 5);
  }
  for (const z of [24, 40, 50]) {
    env.brazier(-9, z);
    env.brazier(9, z);
  }
  // 宫殿
  for (let i = 0; i < 2; i++) for (let x = -12 + i; x <= 12 - i; x++) env.block('marble', x, i, 61 + i, 1, 1, 1);
  env.collider(0, 61.5, 25, 2, 2);
  env.palace(0, 66, 26, 5);
  env.flag(-14, 56, lv.enemy.flag, '董', 10);
  env.flag(14, 56, lv.enemy.flag, '董', 10);
  distantArmies(env, lv);
}
