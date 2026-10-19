import type { Battle } from '../game/Battle';
import { Perf } from '../game/PerformanceManager';
import type { SoldierTypeId } from '../data/types';
import type { Soldier } from './EnemyPool';

// 波次生成器：受同屏士兵上限约束，超出部分进入队列，等待场上数量下降后再陆续登场

interface Pending {
  x: number;
  z: number;
  radius: number;
  type: SoldierTypeId;
  team: 0 | 1;
  tag: number;
}

export class EnemySpawner {
  private queue: Pending[] = [];
  private acc = 0;

  constructor(private b: Battle) {}

  get pending(): number {
    return this.queue.length;
  }

  pendingTag(tag: number): number {
    let n = 0;
    for (const q of this.queue) if (q.tag === tag) n++;
    return n;
  }

  spawnGroup(x: number, z: number, radius: number, units: Array<[SoldierTypeId, number]>, team: 0 | 1, tag = 0): void {
    for (const [type, n] of units) for (let i = 0; i < n; i++) this.queue.push({ x, z, radius, type, team, tag });
    this.b.fx.dust(this.b.env.findSpawn(x, z, 1), radius * 0.6, 10);
  }

  private spawnOne(q: Pending): Soldier | null {
    const b = this.b;
    const p = b.env.findSpawn(q.x, q.z, q.radius);
    const faction = q.team === 1 ? b.level.enemy : b.level.ally;
    const mult = q.team === 1 ? { hp: b.diffCfg.enemyHp, atk: 1 } : { hp: 1, atk: 1 };
    const s = b.pool.spawn(q.type, q.team, p.x, p.z, faction, mult);
    if (!s) return null;
    s.tag = q.tag;
    s.facing = Math.atan2(b.player.pos.x - p.x, b.player.pos.z - p.z);
    return s;
  }

  update(dt: number): void {
    if (!this.queue.length) return;
    this.acc += dt;
    if (this.acc < 0.05) return;
    this.acc = 0;
    const cap = Perf.profile.maxSoldiers;
    // 每次最多生成 4 个，避免单帧卡顿
    for (let k = 0; k < 4 && this.queue.length; k++) {
      const q = this.queue[0];
      const alive = this.b.pool.count;
      // 友军单独限额，避免挤占敌军数量
      if (q.team === 1 && alive >= cap) return;
      if (q.team === 0 && this.b.pool.countTeam(0) >= 16) {
        this.queue.shift();
        continue;
      }
      this.queue.shift();
      this.spawnOne(q);
    }
  }

  clear(): void {
    this.queue.length = 0;
  }
}
