import { Audio } from '../audio/AudioManager';
import { Perf } from '../game/PerformanceManager';
import type { Battle } from '../game/Battle';
import { SState, type Soldier } from './EnemyPool';

// 士兵 AI：有限状态机（Idle / MoveToTarget / Attack / Hit / Knockback / Knockdown / Recover / Dead）
// 远处士兵降低更新频率（分组激活），近处执行完整战斗逻辑

const GRAVITY = 26;

export class EnemyAI {
  private frame = 0;
  private sepBuf: Soldier[] = [];

  constructor(private b: Battle) {}

  update(dt: number): void {
    const b = this.b;
    this.frame++;
    const pool = b.pool;
    pool.rebuildGrid();
    const interval = Perf.profile.farUpdateInterval;
    // 统计当前正在攻击玩家的士兵（攻击令牌）
    let attackers = 0;
    for (const s of pool.active) if (s.state === SState.Attack && s.targetKind === 'player') attackers++;
    b.attackersOnPlayer = attackers;
    const list = pool.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s.active) continue;
      const busy = s.state !== SState.Idle && s.state !== SState.Move;
      if (s.lod === 1 && !busy) {
        s.updAcc += dt;
        if ((this.frame + s.frameSlot) % interval !== 0) {
          // 远处士兵仅做简单位移插值
          if (s.state === SState.Move) {
            const px = s.pos.x, pz = s.pos.z;
            this.simpleMove(s, dt);
            this.b.env.resolve(s.pos, px, pz, s.radius);
          }
          continue;
        }
        this.step(s, s.updAcc);
        s.updAcc = 0;
      } else {
        this.step(s, dt);
        s.updAcc = 0;
      }
    }
  }

  private simpleMove(s: Soldier, dt: number): void {
    if (!s.target) return;
    const dx = s.target.pos.x - s.pos.x;
    const dz = s.target.pos.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < s.type.range * 1.5) return;
    s.pos.x += (dx / d) * s.spd * dt;
    s.pos.z += (dz / d) * s.spd * dt;
    s.walkPhase += dt * s.spd * 2.2;
  }

  private step(s: Soldier, dt: number): void {
    const b = this.b;
    s.st += dt;
    s.flash = Math.max(0, s.flash - dt);
    s.attackCd -= dt;
    s.fear = Math.max(0, s.fear - dt);
    if (s.freeze > 0) {
      s.freeze -= dt;
      dt *= 0.35;
    }
    if (s.burn > 0) {
      s.burn -= dt;
      if (Math.floor((s.burn + dt) * 2) !== Math.floor(s.burn * 2) && !s.dying) {
        b.damage.damageSoldier(s, s.burnDmg, 'light', 0, 0, { dot: true });
        b.fx.fire(s.pos.clone().setY(1), 3, 0.3);
      }
    }
    s.prevX = s.pos.x;
    s.prevZ = s.pos.z;
    switch (s.state) {
      case SState.Idle:
      case SState.Move:
        this.think(s, dt);
        break;
      case SState.Attack:
        this.attack(s, dt);
        break;
      case SState.Hit:
        s.moveAmt = 0;
        s.pos.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
        if (s.st >= s.hitstun) this.toMove(s);
        break;
      case SState.Knockback:
        s.moveAmt = 0;
        s.pos.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
        if (s.vel.lengthSq() < 0.5 || s.st > 0.6) {
          if (s.dying) this.die(s);
          else this.toMove(s);
        }
        break;
      case SState.Knockdown: {
        s.moveAmt = 0;
        if (s.grabbed) break;
        if (s.y > 0 || s.vy > 0) {
          s.vy -= GRAVITY * dt;
          s.y += s.vy * dt;
          s.fall = Math.max(-1.55, s.fall - dt * 6);
          s.pos.addScaledVector(s.vel, dt);
          if (s.y <= 0) {
            s.y = 0;
            s.vy = 0;
            s.vel.multiplyScalar(0.3);
            b.fx.dust(s.pos, 0.6, 3);
            s.downTime = 0;
          }
        } else {
          s.fall = Math.max(-1.55, s.fall - dt * 8);
          s.pos.addScaledVector(s.vel, dt);
          s.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
          s.downTime += dt;
          if (s.dying) {
            if (s.downTime > 0.15) this.die(s);
          } else if (s.downTime > 0.9) {
            s.state = SState.Recover;
            s.st = 0;
          }
        }
        break;
      }
      case SState.Recover:
        s.fall = Math.min(0, s.fall + dt * 3.5);
        if (s.st > 0.5) {
          s.fall = 0;
          this.toMove(s);
        }
        break;
      case SState.Dead:
        if (s.st > 0.75) {
          b.fx.dissolve(s.pos, s.palette.armor, 0.6);
          b.pool.release(s);
        }
        return;
    }
    b.env.resolve(s.pos, s.prevX, s.prevZ, s.radius);
  }

  die(s: Soldier): void {
    s.state = SState.Dead;
    s.st = 0;
    s.fall = -1.55;
    s.vel.set(0, 0, 0);
  }

  private toMove(s: Soldier): void {
    s.state = SState.Move;
    s.st = 0;
    s.struck = false;
  }

  // 选择目标
  private pickTarget(s: Soldier): void {
    const b = this.b;
    if (s.team === 1) {
      const p = b.player;
      const dp = p.alive ? s.pos.distanceToSquared(p.pos) : 1e9;
      let best: any = p.alive ? p : null;
      let kind: Soldier['targetKind'] = p.alive ? 'player' : null;
      let bd = dp;
      // 保护目标
      for (const n of b.npcs) {
        if (!n.alive) continue;
        const d = s.pos.distanceToSquared(n.pos) * (s.prefersNpc ? 0.4 : 1.2);
        if (d < bd) {
          bd = d;
          best = n;
          kind = 'npc';
        }
      }
      if (dp > 100) {
        const a = b.pool.nearest(s.pos.x, s.pos.z, 9, 0);
        if (a && s.pos.distanceToSquared(a.pos) < bd) {
          best = a;
          kind = 'soldier';
        }
      }
      s.target = best;
      s.targetKind = kind;
    } else {
      // 友军：攻击最近敌人，否则跟随玩家
      const e = b.pool.nearest(s.pos.x, s.pos.z, 26, 1);
      if (e) {
        s.target = e;
        s.targetKind = 'soldier';
      } else {
        let boss = null as any;
        for (const bo of b.bosses) if (bo.alive && bo.active && s.pos.distanceToSquared(bo.pos) < 400) boss = bo;
        if (boss) {
          s.target = boss;
          s.targetKind = 'boss';
        } else {
          s.target = b.player;
          s.targetKind = null;
        }
      }
    }
  }

  private think(s: Soldier, dt: number): void {
    const b = this.b;
    if (!s.target || !s.target.alive || Math.random() < dt * 0.8) this.pickTarget(s);
    const tg = s.target;
    if (!tg) {
      s.moveAmt = 0;
      return;
    }
    const dx = tg.pos.x - s.pos.x;
    const dz = tg.pos.z - s.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const t = s.type;
    if (s.fear > 0) {
      // 被震慑：后退
      s.pos.x -= (dx / d) * s.spd * 0.4 * dt;
      s.pos.z -= (dz / d) * s.spd * 0.4 * dt;
      s.moveAmt = 0.3;
      s.walkPhase += dt * 4;
      return;
    }
    // 骑兵冲锋
    if (t.mounted && s.team === 1) {
      this.cavalry(s, dt, dx, dz, d);
      return;
    }
    if (s.state === SState.Idle) {
      if (d < 45 || s.team === 0) s.state = SState.Move;
      else {
        s.moveAmt = 0;
        return;
      }
    }
    const aggro = b.diffCfg.aggro;
    const range = s.targetKind === null ? 4 : t.range;
    const want = s.targetKind === null ? 4 : t.weapon === 'bow' ? Math.min(range * 0.75, 12) : range * 0.85;
    let mx = 0, mz = 0;
    if (d > want) {
      mx = dx / d;
      mz = dz / d;
    } else if (t.weapon === 'bow' && d < 5) {
      mx = -dx / d;
      mz = -dz / d;
    } else if (s.targetKind === 'player' && d < want) {
      // 包围：绕目标侧移
      const side = (s.id % 2 ? 1 : -1) * 0.5;
      mx = (-dz / d) * side;
      mz = (dx / d) * side;
    }
    // 分离：避免士兵重叠
    const near = b.pool.query(s.pos.x, s.pos.z, 1.2, -1, this.sepBuf);
    for (const o of near) {
      if (o === s) continue;
      const ox = s.pos.x - o.pos.x;
      const oz = s.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz) || 0.01;
      const push = (1.2 - od) / 1.2;
      mx += (ox / od) * push * 1.2;
      mz += (oz / od) * push * 1.2;
    }
    const ml = Math.hypot(mx, mz);
    const sp = s.spd * (s.targetKind === null && d > 10 ? 1.6 : 1);
    if (ml > 0.05) {
      s.pos.x += (mx / Math.max(1, ml)) * sp * dt;
      s.pos.z += (mz / Math.max(1, ml)) * sp * dt;
      s.moveAmt = Math.min(1, ml);
      s.walkPhase += dt * sp * 2.2;
    } else s.moveAmt = Math.max(0, s.moveAmt - dt * 4);
    // 朝向目标
    const yaw = Math.atan2(dx, dz);
    s.facing = lerpAngle(s.facing, yaw, Math.min(1, dt * 8));
    // 发起攻击
    if (s.targetKind && d <= range + 0.3 && s.attackCd <= 0) {
      if (s.targetKind === 'player') {
        const maxTok = Math.round((t.weapon === 'bow' ? 4 : 3) * aggro);
        if (b.attackersOnPlayer >= maxTok || !b.player.alive) {
          s.attackCd = 0.3 + Math.random() * 0.5;
          return;
        }
        b.attackersOnPlayer++;
      }
      s.state = SState.Attack;
      s.st = 0;
      s.struck = false;
    }
  }

  private cavalry(s: Soldier, dt: number, dx: number, dz: number, d: number): void {
    const b = this.b;
    s.state = SState.Move;
    if (s.chargeT > 0) {
      s.chargeT -= dt;
      const sp = s.spd * 1.1;
      s.pos.addScaledVector(s.chargeDir, sp * dt);
      s.moveAmt = 1;
      s.walkPhase += dt * 10;
      s.facing = Math.atan2(s.chargeDir.x, s.chargeDir.z);
      if (!s.chargeHit && s.targetKind && d < 1.8) {
        s.chargeHit = true;
        this.hitTarget(s, s.atk, 'heavy');
      }
      if (s.chargeT <= 0) s.attackCd = 1.5;
      return;
    }
    if (d > 7 && s.attackCd <= 0) {
      s.chargeT = Math.min(2.2, (d + 8) / (s.spd * 1.1));
      s.chargeHit = false;
      s.chargeDir.set(dx / d, 0, dz / d);
      Audio.play('drum', 0.4);
      return;
    }
    // 掉头 / 拉开距离
    const away = d < 7;
    const mx = away ? -dz / d : dx / d;
    const mz = away ? dx / d : dz / d;
    s.pos.x += mx * s.spd * 0.6 * dt;
    s.pos.z += mz * s.spd * 0.6 * dt;
    s.moveAmt = 0.7;
    s.walkPhase += dt * 6;
    s.facing = lerpAngle(s.facing, Math.atan2(mx, mz), Math.min(1, dt * 5));
  }

  private attack(s: Soldier, dt: number): void {
    const t = s.type;
    s.moveAmt = 0;
    const tg = s.target;
    if (!s.struck && tg) {
      const yaw = Math.atan2(tg.pos.x - s.pos.x, tg.pos.z - s.pos.z);
      s.facing = lerpAngle(s.facing, yaw, Math.min(1, dt * 5));
    }
    if (!s.struck && s.st >= t.windup) {
      s.struck = true;
      if (t.weapon === 'bow') {
        if (tg) this.b.projectiles.arrow(s, tg.pos);
      } else if (tg) {
        const dx = tg.pos.x - s.pos.x;
        const dz = tg.pos.z - s.pos.z;
        const d = Math.hypot(dx, dz);
        const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
        const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        if (d <= t.range + 0.6 && dot > 0.3) this.hitTarget(s, s.atk, s.type.id === 'heavy' || s.type.id === 'elite' ? 'heavy' : 'light');
        Audio.play('swing', 0.25);
      }
      // 精英兵：附带范围冲击
      if (t.id === 'elite') {
        this.b.fx.ring(s.pos, 0.5, 3, 0xffd040, 0.35);
        const p = this.b.player;
        if (p.alive && p.pos.distanceTo(s.pos) < 3) p.takeDamage(s.atk * 0.6, 'heavy', s.pos);
      }
    }
    if (s.st >= t.windup + 0.45) {
      s.state = SState.Move;
      s.st = 0;
      s.attackCd = t.attackCd * (0.8 + Math.random() * 0.4) / this.b.diffCfg.aggro;
    }
  }

  private hitTarget(s: Soldier, dmg: number, kind: 'light' | 'heavy'): void {
    const b = this.b;
    const tg = s.target as any;
    if (!tg) return;
    switch (s.targetKind) {
      case 'player':
        b.player.takeDamage(dmg, kind, s.pos);
        break;
      case 'npc':
        tg.takeDamage(dmg * 0.6);
        break;
      case 'soldier':
        b.damage.soldierHitsSoldier(s, tg);
        break;
      case 'boss':
        tg.takeDamage(dmg * 0.3, 'light', s.pos, false);
        break;
    }
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
