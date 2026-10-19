import type { Environment, Rect } from '../../scene/Environment';
import type { LevelDef } from '../../data/types';
import { distantArmies, factionChar, rand } from './common';

// 赤壁：水岸、战船、木制平台、火焰
export function build(env: Environment, lv: LevelDef): void {
  const r = rand(2080);
  env.lighting = { sky: 0xff9a60, ground: 0x3a2a30, sun: 0xffa060, sunIntensity: 2.0, ambient: 0.85, fog: 0x8a4a3a, fogNear: 35, fogFar: 140, sunDir: [-0.6, 0.6, 0.6] };
  env.skyTop = 0x2a1a3a;
  env.skyBottom = 0xff8040;
  const ec = factionChar(lv.enemy.name);

  env.water(0, 20, 400, 260, -0.5);
  // 江岸
  env.groundPatch('sand', 0, -48, 140, 68, 0.0);
  env.groundPatch('grassTop', 0, -70, 140, 30, 0.01, 0xc0c890);
  env.clouds(12);

  const shore: Rect = { x0: -40, z0: -62, x1: 40, z1: -14 };
  const plank: Rect = { x0: -3, z0: -15, x1: 3, z1: -11 };
  const shipC: Rect = { x0: -9, z0: -12, x1: 9, z1: 40 };
  const shipL: Rect = { x0: -26, z0: -6, x1: -12, z1: 30 };
  const shipR: Rect = { x0: 12, z0: -6, x1: 26, z1: 30 };
  const bridgeL: Rect = { x0: -13, z0: 11, x1: -8, z1: 17 };
  const bridgeR: Rect = { x0: 8, z0: 11, x1: 13, z1: 17 };
  const bridgeF: Rect = { x0: -3, z0: 39, x1: 3, z1: 45 };
  const flag: Rect = { x0: -12, z0: 44, x1: 12, z1: 68 };
  env.walkable = [shore, plank, shipC, shipL, shipR, bridgeL, bridgeR, bridgeF, flag];

  // 岸上联军营地
  for (const x of [-26, -14, 14, 26]) env.tent(x, -54, lv.ally.cloth, 0);
  for (const x of [-20, 20]) env.flag(x, -46, lv.ally.flag, '吴', 7);
  env.flag(0, -58, lv.ally.flag, '刘', 8);
  env.brazier(-5, -40);
  env.brazier(5, -40);
  for (let i = 0; i < 14; i++) {
    const x = Math.round(-36 + r() * 72);
    const z = Math.round(-60 + r() * 12);
    if (Math.abs(x) < 8) continue;
    env.tree(x, z, 4 + Math.floor(r() * 2));
  }
  // 码头木栈道
  for (let x = -3; x <= 3; x++) for (let z = -15; z <= -11; z++) env.block('planks', x, -0.3, z, 1, 0.3, 1);

  const ship = (rc: Rect, burning: boolean) => {
    const cx = (rc.x0 + rc.x1) / 2;
    const cz = (rc.z0 + rc.z1) / 2;
    const w = rc.x1 - rc.x0 + 1;
    const d = rc.z1 - rc.z0 + 1;
    env.groundPatch('planks', cx, cz, w, d, 0.02);
    // 船舷与船体
    for (let z = rc.z0 - 1; z <= rc.z1 + 1; z++) {
      for (const x of [rc.x0 - 1, rc.x1 + 1]) {
        env.block('darkPlanks', x, -1, z);
        env.block('darkPlanks', x, 0, z, 1, 0.8, 1);
      }
    }
    for (let x = rc.x0 - 1; x <= rc.x1 + 1; x++) {
      for (const z of [rc.z0 - 1, rc.z1 + 1]) {
        env.block('darkPlanks', x, -1, z);
        env.block('darkPlanks', x, 0, z, 1, 0.8, 1);
      }
    }
    for (let k = 0; k < 2; k++) {
      // 船首船尾翘起
      const z = k ? rc.z1 + 2 : rc.z0 - 2;
      for (let x = Math.round(cx - w / 4); x <= Math.round(cx + w / 4); x++) env.block('darkPlanks', x, 0, z, 1, 1.6, 1);
    }
    // 桅杆与帆
    for (const mz of [cz - d / 4, cz + d / 4]) {
      const mx = Math.round(cx);
      const zz = Math.round(mz);
      for (let y = 0; y < 10; y++) env.block('log', mx, y, zz, 0.5, 1, 0.5);
      env.collider(mx, zz, 0.8, 0.8, 10);
      for (let y = 4; y < 9; y++) for (let x = mx - 3; x <= mx + 3; x++) env.block('cloth', x, y, zz + 0.4, 1, 1, 0.12);
      if (burning) {
        env.fireAt(mx, 6, zz + 0.4, 1.2);
        env.smokeAt(mx, 9, zz);
      }
    }
    // 船舱
    const hx = Math.round(cx + w / 4);
    env.fill('planks', hx - 2, 0, rc.z1 - 4, hx + 2, 2, rc.z1 - 1, true);
    for (let x = hx - 3; x <= hx + 3; x++) for (let z = rc.z1 - 5; z <= rc.z1; z++) env.block('roof', x, 3, z);
    env.collider(hx, rc.z1 - 2.5, 5, 4, 4);
    if (burning) {
      for (let i = 0; i < 3; i++) env.fireAt(rc.x0 + r() * w, 0.3, rc.z0 + r() * d * 0.6, 0.7);
    }
  };
  ship(shipC, true);
  ship(shipL, true);
  ship(shipR, true);
  ship(flag, false);
  // 连接船只的木板桥
  for (const b of [bridgeL, bridgeR, bridgeF])
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) env.block('planks', x, -0.25, z, 1, 0.3, 1);

  env.destructible('chain1', 'chain', -19, 31.5, {});
  env.destructible('chain2', 'chain', 19, 31.5, {});
  env.destructible('chain3', 'chain', 0, 41.5, { rot: 0 });

  // 曹军旗舰
  for (const x of [-10, 10]) env.flag(x, 60, lv.enemy.flag, ec, 9);
  env.flag(0, 46, lv.enemy.flag, '曹', 10);
  env.brazier(-6, 50);
  env.brazier(6, 50);

  // 远处燃烧的船队
  for (let i = 0; i < 10; i++) {
    const x = (i % 2 ? 1 : -1) * (45 + r() * 40);
    const z = -10 + r() * 80;
    for (let xx = -3; xx <= 3; xx++) for (let zz = -6; zz <= 6; zz++) if (Math.abs(xx) === 3 || Math.abs(zz) === 6) env.block('darkPlanks', Math.round(x) + xx, -1, Math.round(z) + zz, 1, 1.4, 1);
    for (let y = 0; y < 8; y++) env.block('log', Math.round(x), y, Math.round(z), 0.5, 1, 0.5);
    env.fireAt(x, 2, z, 2);
    env.smokeAt(x, 6, z, 0x2a2a2a);
  }
  env.bounds = { minX: -40, maxX: 40, minZ: -62, maxZ: 70 };
  env.collider(0, -63, 84, 2, 10);
  distantArmies(env, lv);
}
