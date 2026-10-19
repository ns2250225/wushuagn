import type { Environment } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { distantArmies, factionChar, rand, rocks, scatterTrees } from './common';

// 长坂坡：山坡、道路、树林、村庄、长坂桥
export function build(env: Environment, lv: LevelDef): void {
  const r = rand(208);
  env.lighting = { sky: 0xffd8b0, ground: 0x5a4a30, sun: 0xffb070, sunIntensity: 2.1, ambient: 1.0, fog: 0xe0b890, fogNear: 40, fogFar: 150, sunDir: [0.8, 0.7, -0.2] };
  env.skyTop = 0x8a6ab0;
  env.skyBottom = 0xffc890;
  env.ground('grassTop', 0xe8f0c8);
  env.groundPatch('path', 0, -10, 8, 104);
  env.groundPatch('dirt', 0, 6, 26, 20, 0.02);
  env.border('grass', 1.2);
  env.clouds(18);
  const ec = factionChar(lv.enemy.name);

  // 山坡台地（地图两侧阶梯状方块山丘）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x0 = side * (31 + i * 2);
      for (let z = -50 + i * 6; z <= 30 - i * 4; z++) {
        for (let w = 0; w < 2; w++) {
          for (let y = 0; y <= i; y++) env.block(y === i ? 'grassBlock' : 'dirt', x0 + side * w, y, z);
        }
      }
    }
    env.collider(side * 36, -10, 10, 80, 2);
  }

  // 树林
  const avoid = (x: number, z: number) => Math.abs(x) < 7 || (Math.abs(x) < 16 && z > -6 && z < 18) || z > 38 || Math.abs(x) > 29;
  scatterTrees(env, r, 50, -28, 28, -46, 36, avoid);
  rocks(env, r, 8, -26, 26, -40, 30, avoid);

  // 村庄（糜夫人所在）
  env.house(-12, 12, 6, 6, 'planks', 'roof', 3);
  env.house(12, 12, 6, 6, 'planks', 'roof', 3);
  env.house(-12, -2, 6, 5, 'planks', 'roof', 3);
  env.house(12, -2, 6, 5, 'planks', 'roof', 3);
  env.fill('cobble', -2, 0, 14, 2, 0, 16);
  env.collider(0, 15, 5, 3, 1);
  env.fill('planks', -1, 1, 15, 1, 1, 15);
  env.fireAt(-12, 3.6, 12, 0.8);
  env.smokeAt(-12, 5, 12);
  env.fireAt(12, 3.4, -2, 0.6);
  env.smokeAt(12, 5, -2);

  // 河流与长坂桥
  env.water(0, 44, 140, 5, -0.3);
  env.groundPatch('mud', 0, 44, 140, 7, 0.005);
  env.collider(-22.5, 44, 35, 4, 0.6);
  env.collider(22.5, 44, 35, 4, 0.6);
  for (let x = -4; x <= 4; x++) for (let z = 41; z <= 47; z++) env.block('planks', x, 0, z, 1, 0.3, 1);
  for (let z = 41; z <= 47; z++) {
    env.block('log', -5, 0, z, 0.4, 1.2, 0.4);
    env.block('log', 5, 0, z, 0.4, 1.2, 0.4);
  }
  env.collider(-5, 44, 0.6, 7, 1.2);
  env.collider(5, 44, 0.6, 7, 1.2);

  // 桥北曹军阵地
  for (const x of [-20, -10, 10, 20]) env.flag(x, 52, lv.enemy.flag, ec, 7);
  env.tent(-24, 60, lv.enemy.cloth, 0);
  env.tent(24, 60, lv.enemy.cloth, 0);
  env.spikes(-14, 50, 6, 0);
  env.spikes(14, 50, 6, 0);
  env.brazier(-6, 58);
  env.brazier(6, 58);
  env.flag(0, 66, lv.enemy.flag, '张', 8);
  scatterTrees(env, r, 10, -36, 36, 50, 68, (x, z) => Math.abs(x) < 20);

  distantArmies(env, lv);
}
