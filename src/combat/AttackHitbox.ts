import * as THREE from 'three';
import type { Battle } from '../game/Battle';
import type { Soldier } from '../enemies/EnemyPool';
import type { BossController } from '../enemies/BossController';
import type { Destructible } from '../scene/Environment';

// 攻击判定：不依赖武器碰撞体，按「攻击区域 + 目标筛选」进行
// 1. 当前动作 → 2. 攻击范围 → 3. 获取范围内目标 → 4. 计算相对方向 → 5. 扇形 / 距离 / 遮挡判定

export interface HitArea {
  x: number;
  z: number;
  yaw: number;
  range: number;
  arc: number; // 度
  minRange?: number;
  ignoreWalls?: boolean;
}

export interface HitResult {
  soldiers: Soldier[];
  bosses: BossController[];
  destructibles: Destructible[];
}

export class AttackHitbox {
  private buf: Soldier[] = [];
  private res: HitResult = { soldiers: [], bosses: [], destructibles: [] };

  constructor(private b: Battle) {}

  private inSector(area: HitArea, px: number, pz: number, radius: number): boolean {
    const dx = px - area.x;
    const dz = pz - area.z;
    const d = Math.hypot(dx, dz);
    if (d - radius > area.range) return false;
    if (area.minRange !== undefined && d + radius < area.minRange) return false;
    if (area.arc >= 359 || d < 0.6) return true;
    const ang = Math.atan2(dx, dz) - area.yaw;
    const a = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    // 目标半径扩展角度容差
    const tol = Math.atan2(radius, Math.max(0.1, d));
    return a <= (area.arc * Math.PI) / 360 + tol;
  }

  query(area: HitArea, team: 0 | 1 = 1): HitResult {
    const r = this.res;
    r.soldiers.length = 0;
    r.bosses.length = 0;
    r.destructibles.length = 0;
    const env = this.b.env;
    for (const s of this.b.pool.query(area.x, area.z, area.range + 1, team, this.buf)) {
      if (!this.inSector(area, s.pos.x, s.pos.z, s.radius)) continue;
      if (!area.ignoreWalls && env.segmentBlocked(area.x, area.z, s.pos.x, s.pos.z)) continue;
      r.soldiers.push(s);
    }
    if (team === 1) {
      for (const bo of this.b.bosses) {
        if (!bo.alive || !bo.active) continue;
        if (!this.inSector(area, bo.pos.x, bo.pos.z, 0.8)) continue;
        r.bosses.push(bo);
      }
      for (const d of env.destructibles) {
        if (!d.alive) continue;
        if (!this.inSector(area, d.pos.x, d.pos.z, d.radius)) continue;
        r.destructibles.push(d);
      }
    }
    return r;
  }

  static facingVec(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }
}
