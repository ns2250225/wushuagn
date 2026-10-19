import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { HitKind } from '../data/types';
import { SState, type Soldier } from '../enemies/EnemyPool';

// 伤害系统：防御减免、盾牌格挡、霸体、受击反应（硬直 / 击退 / 击飞 / 击倒）与击杀结算

export interface DamageOpts {
  fromPlayer?: boolean;
  crit?: boolean;
  color?: number;
  dot?: boolean;
  noReact?: boolean;
}

export interface DamageResult {
  dealt: number;
  killed: boolean;
  blocked: boolean;
}

const RES: DamageResult = { dealt: 0, killed: false, blocked: false };

export function defReduce(dmg: number, def: number): number {
  return dmg * (100 / (100 + Math.max(0, def)));
}

export class DamageSystem {
  constructor(private b: Battle) {}

  damageSoldier(s: Soldier, raw: number, kind: HitKind, dirX: number, dirZ: number, o: DamageOpts): DamageResult {
    RES.dealt = 0;
    RES.killed = false;
    RES.blocked = false;
    if (!s.active || s.dying) return RES;
    const t = s.type;
    let dmg = defReduce(raw, s.def);
    // 刀盾兵正面格挡轻攻击
    const dl = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / dl, nz = dirZ / dl;
    if (t.shield && kind === 'light' && !o.dot && s.state !== SState.Knockdown && s.state !== SState.Hit) {
      const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
      if (fx * -nx + fz * -nz > 0.4 && Math.random() < 0.5) {
        dmg *= 0.25;
        RES.blocked = true;
        this.b.fx.hitSpark(s.pos.clone().setY(1.2), 0xffffff, 6, 3);
        Audio.play('block', 0.5);
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    s.hp -= dmg;
    s.flash = 0.12;
    RES.dealt = dmg;
    if (o.fromPlayer) this.b.hud.damageNumber(s.pos, dmg, !!o.crit, o.color);
    if (s.hp <= 0) {
      s.hp = 0;
      s.dying = true;
      RES.killed = true;
      this.react(s, kind === 'light' ? 'heavy' : kind, nx, nz, true);
      this.b.onSoldierKilled(s, !!o.fromPlayer);
      return RES;
    }
    if (!RES.blocked && !o.noReact && !o.dot) this.react(s, kind, nx, nz, false);
    return RES;
  }

  react(s: Soldier, kind: HitKind, nx: number, nz: number, dying: boolean): void {
    const t = s.type;
    const armor = dying ? 0 : t.superArmor;
    if (s.state === SState.Attack && s.type.mounted) s.chargeT = 0;
    s.chargeT = 0;
    switch (kind) {
      case 'light':
        if (Math.random() < armor) return;
        if (s.state === SState.Knockdown && s.y > 0) {
          // 空中追击：维持浮空
          s.vy = Math.max(s.vy, 4);
          return;
        }
        s.state = SState.Hit;
        s.st = 0;
        s.hitstun = 0.32;
        s.vel.set(nx * 1.8, 0, nz * 1.8);
        break;
      case 'heavy':
        if (Math.random() < armor * 0.6) return;
        s.state = SState.Knockback;
        s.st = 0;
        s.vel.set(nx, 0, nz).multiplyScalar(t.superArmor > 0.5 ? 4 : 8);
        break;
      case 'launch':
      case 'finisher': {
        if (!dying && Math.random() < armor * 0.3) {
          s.state = SState.Knockback;
          s.st = 0;
          s.vel.set(nx * 5, 0, nz * 5);
          return;
        }
        const k = kind === 'finisher' ? 1.4 : 1;
        s.state = SState.Knockdown;
        s.st = 0;
        s.vy = (8 + Math.random() * 3) * k * (t.superArmor > 0.5 ? 0.6 : 1);
        s.y = Math.max(s.y, 0.05);
        s.vel.set(nx, 0, nz).multiplyScalar((3 + Math.random() * 2) * k);
        s.fall = -0.3;
        break;
      }
      case 'quake':
        if (!dying && Math.random() < armor * 0.3) return;
        s.state = SState.Knockdown;
        s.st = 0;
        s.vy = 4;
        s.y = Math.max(s.y, 0.05);
        s.vel.set(nx * 2, 0, nz * 2);
        break;
    }
  }

  soldierHitsSoldier(a: Soldier, t: Soldier): void {
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
    // 友军对敌伤害有所削弱，保证玩家仍是主力
    const mul = a.team === 0 ? 0.5 : 0.7;
    this.damageSoldier(t, a.atk * mul * 2.2, 'light', dx, dz, {});
    Audio.play('hit', 0.15);
  }
}
