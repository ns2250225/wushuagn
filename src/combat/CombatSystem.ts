import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { HitKind } from '../data/types';
import { ELEMENT_INFO } from '../data/items';
import type { Soldier } from '../enemies/EnemyPool';
import type { BossController } from '../enemies/BossController';
import type { Destructible } from '../scene/Environment';
import { AttackHitbox, type HitArea } from './AttackHitbox';

// 战斗系统：玩家攻击的命中结算、暴击、武器属性触发、连击与无双能量、打击感反馈（顿帧 / 震屏 / 振动）

const _p = new THREE.Vector3();
const KIND_SHAKE: Record<HitKind, number> = { light: 0.06, heavy: 0.16, launch: 0.22, quake: 0.3, finisher: 0.5 };

export class CombatSystem {
  hitbox: AttackHitbox;
  private chainBuf: Soldier[] = [];

  constructor(private b: Battle) {
    this.hitbox = new AttackHitbox(b);
  }

  playerDamage(mult: number): { dmg: number; crit: boolean } {
    const pl = this.b.player;
    const crit = Math.random() < pl.critRate();
    const dmg = pl.attackPower() * mult * (crit ? 1.6 : 1) * (0.92 + Math.random() * 0.16);
    return { dmg, crit };
  }

  // 玩家范围攻击：一次攻击可同时命中多个目标
  playerArea(area: HitArea, mult: number, kind: HitKind, color: number, opts: { sfx?: boolean; shake?: number } = {}): number {
    const res = this.hitbox.query(area, 1);
    let hits = 0;
    for (const s of res.soldiers) {
      const { dmg, crit } = this.playerDamage(mult);
      this.applyHitToSoldier(s, dmg, kind, s.pos.x - area.x, s.pos.z - area.z, color, crit);
      hits++;
    }
    for (const bo of res.bosses) {
      const { dmg, crit } = this.playerDamage(mult);
      this.applyHitToBoss(bo, dmg, kind, color, crit);
      hits++;
    }
    for (const d of res.destructibles) {
      this.hitDestructible(d, this.playerDamage(mult).dmg);
      hits++;
    }
    if (hits > 0) {
      if (opts.sfx !== false) Audio.play(kind === 'light' ? 'hit' : 'hitHeavy', Math.min(1, 0.5 + hits * 0.05));
      const sh = opts.shake ?? KIND_SHAKE[kind];
      this.b.fx.shake.add(sh * Math.min(1.6, 0.7 + hits * 0.05));
      if (kind !== 'light') this.b.hitstop(kind === 'finisher' ? 0.09 : 0.045);
      if (kind !== 'light') this.b.vibrate(kind === 'finisher' ? 60 : 25);
    }
    return hits;
  }

  applyHitToSoldier(s: Soldier, dmg: number, kind: HitKind, dirX: number, dirZ: number, color: number, crit = false): void {
    if (!s.active || s.dying) return;
    const b = this.b;
    const pl = b.player;
    const el = pl.element;
    // 风属性：轻攻击有几率变为击退
    if (el === 'wind' && kind === 'light' && Math.random() < 0.3) kind = 'heavy';
    if (el === 'slash' && Math.random() < 0.1) {
      dmg += s.hp * 0.25;
      b.fx.hitSpark(_p.copy(s.pos).setY(1.4), ELEMENT_INFO.slash.color, 10, 6);
    }
    const r = b.damage.damageSoldier(s, dmg, kind, dirX, dirZ, { fromPlayer: true, crit, color: crit ? 0xffd040 : undefined });
    _p.set(s.pos.x, 1.1 + s.y, s.pos.z);
    if (!r.blocked) b.fx.hitSpark(_p, color, kind === 'light' ? 6 : 10, kind === 'light' ? 4 : 7);
    if (r.dealt > 0) {
      b.combo.hit(1);
      pl.addMusou((r.killed ? 2.2 : 1.1) * b.combo.musouMul());
      if (pl.lifesteal > 0) pl.heal(r.dealt * pl.lifesteal);
    }
    if (r.killed) {
      Audio.play('kill', 0.4);
      b.fx.debris(_p, s.palette.armor, 4, 3);
    }
    // 属性触发
    if (s.active && !s.dying) {
      if (el === 'fire' && Math.random() < 0.2) {
        s.burn = 3;
        s.burnDmg = pl.attackPower() * 0.12;
      } else if (el === 'ice' && Math.random() < 0.2) {
        s.freeze = 2;
        b.fx.hitSpark(_p, ELEMENT_INFO.ice.color, 6, 2);
      }
    }
    if (el === 'thunder' && Math.random() < 0.15) this.chainLightning(s, dmg * 0.5);
  }

  private chainLightning(from: Soldier, dmg: number): void {
    const b = this.b;
    const near = b.pool.query(from.pos.x, from.pos.z, 6, 1, this.chainBuf).slice(0, 4);
    const a = from.pos.clone().setY(1.2);
    Audio.play('thunder', 0.4);
    for (const s of near) {
      if (s === from) continue;
      const c = s.pos.clone().setY(1.2);
      b.fx.lightning(a, c, ELEMENT_INFO.thunder.color);
      b.damage.damageSoldier(s, dmg, 'light', s.pos.x - from.pos.x, s.pos.z - from.pos.z, { fromPlayer: true, color: ELEMENT_INFO.thunder.color });
      b.combo.hit(1);
    }
  }

  applyHitToBoss(bo: BossController, dmg: number, kind: HitKind, color: number, crit = false): void {
    const b = this.b;
    if (!bo.alive) return;
    if (b.player.element === 'slash' && Math.random() < 0.1) dmg += bo.maxHp * 0.015;
    const dealt = bo.takeDamage(dmg, kind, b.player.pos, true);
    if (dealt <= 0) return;
    b.hud.damageNumber(bo.pos, dealt, crit, crit ? 0xffd040 : 0xffa0a0);
    _p.set(bo.pos.x, 1.4, bo.pos.z);
    b.fx.hitSpark(_p, color, 10, 6);
    b.combo.hit(1);
    b.player.addMusou(1.0 * b.combo.musouMul());
    if (b.player.lifesteal > 0) b.player.heal(dealt * b.player.lifesteal);
    const el = b.player.element;
    if (el === 'thunder' && Math.random() < 0.15) b.fx.lightning(_p.clone().setY(6), _p, ELEMENT_INFO.thunder.color);
    if (el === 'fire' && Math.random() < 0.2) bo.burn = 3;
  }

  hitDestructible(d: Destructible, dmg: number): void {
    const b = this.b;
    if (!d.alive) return;
    const destroyed = b.env.damageDestructible(d, dmg, b.fx);
    b.hud.damageNumber(d.pos.clone().setY(2), Math.round(dmg), false, 0xffe0a0);
    Audio.play('hitHeavy', 0.3);
    if (destroyed) {
      Audio.play('break', 1);
      b.fx.shake.add(0.4);
      b.onDestructibleDestroyed(d);
    }
  }
}
