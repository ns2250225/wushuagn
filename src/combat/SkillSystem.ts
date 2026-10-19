import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { HitKind } from '../data/types';
import type { PlayerController } from '../characters/PlayerController';
import { SState } from '../enemies/EnemyPool';
import type { Emitter } from '../effects/EffectManager';

// 技能系统：每名武将 2 个特殊技能 + 1 个无双终结技，全部为脚本化时间轴演出

export interface ActiveSkill {
  id: string;
  t: number;
  dur: number;
  superArmor: boolean;
  invuln: boolean;
  moveMul: number; // 技能期间允许的移动速度比例
  update(dt: number): boolean;
}

type Ev = [number, () => void];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

class Timeline implements ActiveSkill {
  t = 0;
  private i = 0;
  constructor(
    public id: string,
    public dur: number,
    private events: Ev[],
    private tick: ((t: number, dt: number) => void) | null,
    public superArmor = true,
    public invuln = false,
    public moveMul = 0,
  ) {
    this.events.sort((a, b) => a[0] - b[0]);
  }
  update(dt: number): boolean {
    this.t += dt;
    while (this.i < this.events.length && this.events[this.i][0] <= this.t) this.events[this.i++][1]();
    this.tick?.(this.t, dt);
    return this.t >= this.dur;
  }
}

// 周期触发器
function every(interval: number, fn: () => void): (t: number, dt: number) => void {
  let acc = 0;
  return (_t, dt) => {
    acc += dt;
    while (acc >= interval) {
      acc -= interval;
      fn();
    }
  };
}

export class SkillSystem {
  constructor(private b: Battle) {}

  private get p(): PlayerController {
    return this.b.player;
  }

  // ---- 工具 ----
  private area(range: number, arc: number, mult: number, kind: HitKind, color: number, o: { yawOff?: number; at?: THREE.Vector3; walls?: boolean } = {}): number {
    const p = this.p;
    const at = o.at ?? p.pos;
    return this.b.combat.playerArea({ x: at.x, z: at.z, yaw: p.facing + (o.yawOff ?? 0), range: range * p.rangeMul(), arc, ignoreWalls: o.walls }, mult, kind, color);
  }
  private ahead(d: number, out = _v): THREE.Vector3 {
    const p = this.p;
    return out.set(p.pos.x + Math.sin(p.facing) * d, 0, p.pos.z + Math.cos(p.facing) * d);
  }
  private finisherFx(radius: number, color: number, at?: THREE.Vector3): void {
    const b = this.b;
    const pos = (at ?? this.p.pos).clone();
    b.fx.explosion(pos, radius * 0.7, color, 0xffffff);
    b.fx.shockwave(pos, radius, color);
    b.fx.ring(pos, 1, radius * 1.4, 0xffffff, 0.7, 0.2);
    b.fx.pillar(pos, radius * 0.25, 14, color, 0.8);
    b.fx.groundCrack(pos, radius * 0.6);
    b.fx.flash('#ffffff', 0.7);
    b.fx.shake.add(0.8);
    b.vibrate(120);
    Audio.play('musouFinish', 1);
    b.slowmo(0.3, 0.45);
  }
  private musouStart(color: number, radius = 6): void {
    const b = this.b;
    const p = this.p;
    p.anim.play('raise', 0.9);
    b.fx.magicCircle(p.pos, radius, color, 2.6, p.pos);
    b.fx.flash('#' + color.toString(16).padStart(6, '0'), 0.35);
    b.cam.focus(1.0, 6.5, 0.9);
    Audio.play('musou', 1);
    b.hud.banner(p.hero.name + ' · ' + this.b.skillName(p.hero.musou), color);
  }
  private chargeTick(color: number): (t: number, dt: number) => void {
    return (t) => {
      if (t > 0.9) return;
      const p = this.p;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 2;
        this.b.fx.particles.spawn({ x: p.pos.x + Math.cos(a) * r, y: 0.3 + Math.random() * 2.5, z: p.pos.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2, vy: 1, vz: -Math.sin(a) * r * 2, life: 0.45, size: 0.15, color });
      }
      this.b.fx.aura(p.pos, color, 0.7, 2.4);
    };
  }
  private fearAround(r: number, time: number): void {
    for (const s of this.b.pool.query(this.p.pos.x, this.p.pos.z, r, 1)) {
      s.fear = time;
      if (s.state === SState.Move || s.state === SState.Idle || s.state === SState.Attack) {
        s.state = SState.Hit;
        s.st = 0;
        s.hitstun = 0.6;
        s.vel.set(0, 0, 0);
      }
    }
  }
  private ring2(color: number, r: number): void {
    this.b.fx.ring(this.p.pos, 0.5, r, color, 0.45);
  }

  create(id: string, trueMusou = false): ActiveSkill {
    const b = this.b;
    const p = this.p;
    const fx = b.fx;
    const M = trueMusou ? 1.5 : 1;
    const anim = (n: Parameters<typeof p.anim.play>[0], d: number) => p.anim.play(n, d);
    switch (id) {
      // ================= 赵云 =================
      case 'zy_dash': {
        const c = 0x8fd0ff;
        const hitT = every(0.09, () => this.area(2.8, 140, 0.55, 'light', c));
        const ghost = every(0.06, () => fx.ghost(p.rig, c));
        anim('thrust', 0.9);
        Audio.play('thrust');
        return new Timeline(id, 0.9, [
          [0.72, () => {
            this.area(3.8, 150, 1.9, 'launch', c);
            fx.slash(p.pos, p.facing, 3.5, 150, c, { tilt: Math.PI / 2 });
            this.ring2(c, 4);
            Audio.play('hitHeavy');
          }],
        ], (t, dt) => {
          if (t > 0.08 && t < 0.7) {
            p.dash(17, dt);
            hitT(t, dt);
            ghost(t, dt);
            fx.particles.spawn({ x: p.pos.x + Math.sin(p.facing) * 2, y: 1.3, z: p.pos.z + Math.cos(p.facing) * 2, life: 0.25, size: 0.3, color: c });
          }
        });
      }
      case 'zy_whirl': {
        const c = 0xbfe8ff;
        const hit = every(0.2, () => this.area(3.8, 360, 0.45, 'light', c, { walls: true }));
        let spinT = 0;
        Audio.play('wind');
        return new Timeline(id, 2.2, [[2.0, () => {
          this.area(4.4, 360, 1.5, 'launch', c);
          fx.ring(p.pos, 1, 5, c, 0.4);
          Audio.play('hitHeavy');
        }]], (t, dt) => {
          spinT -= dt;
          if (spinT <= 0) {
            anim('spin', 0.36);
            spinT = 0.36;
            Audio.play('swing', 0.5);
          }
          hit(t, dt);
          for (let i = 0; i < 4; i++) {
            const a = t * 12 + (i / 4) * Math.PI * 2;
            const r = 2.4 + Math.sin(t * 5 + i) * 0.6;
            fx.particles.spawn({ x: p.pos.x + Math.cos(a) * r, y: 0.6 + (i % 2) * 0.8, z: p.pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 6, vy: 0.5, vz: Math.cos(a) * 6, life: 0.25, size: 0.15 + (i % 3) * 0.1, color: i % 2 ? c : 0xffffff });
          }
        }, true, false, 0.55);
      }
      case 'zy_musou': {
        const c = 0x6ab8ff;
        this.musouStart(c, 6);
        const tick = this.chargeTick(c);
        const dragon = (yo: number) => () => {
          anim('thrust', 0.4);
          b.projectiles.wave(p.pos, p.facing + yo, { dmg: p.attackPower() * 1.7 * M, kind: 'launch', color: c, range: 22, width: 2.2, dragon: true, speed: 18, size: 0.55 });
          this.area(4.5, 110, 1.0 * M, 'heavy', c);
          fx.slash(p.pos, p.facing + yo, 4, 110, c);
          Audio.play('wind');
          fx.shake.add(0.2);
        };
        return new Timeline(id, 3.4, [
          [0.95, dragon(-0.25)],
          [1.35, dragon(0.25)],
          [1.75, dragon(0)],
          [2.3, () => anim('spin', 0.5)],
          [2.75, () => {
            this.area(8.5, 360, 3.0 * M, 'finisher', c, { walls: true });
            this.finisherFx(8, c);
          }],
        ], tick, true, true);
      }
      // ================= 关羽 =================
      case 'gy_sweep': {
        const c = 0x50ff90;
        anim('slashR', 0.8);
        return new Timeline(id, 0.8, [
          [0.42, () => {
            this.area(5.4, 230, 2.2, 'heavy', c);
            fx.slash(p.pos, p.facing, 5.2, 230, c, { life: 0.35 });
            for (const yo of [-0.45, 0, 0.45]) b.projectiles.wave(p.pos, p.facing + yo, { dmg: p.attackPower() * 0.9, kind: 'heavy', color: c, range: 9, width: 1.4 });
            Audio.play('swingHeavy');
            fx.shake.add(0.2);
          }],
        ], null);
      }
      case 'gy_cyclone': {
        const c = 0x60ffa0;
        const hit = every(0.18, () => this.area(4.4, 360, 0.5, 'light', c, { walls: true }));
        let spinT = 0;
        return new Timeline(id, 2.4, [[2.25, () => {
          this.area(4.8, 360, 1.6, 'launch', c);
          fx.ring(p.pos, 1, 5.5, c, 0.4);
        }]], (t, dt) => {
          spinT -= dt;
          if (spinT <= 0) {
            anim('spin', 0.32);
            spinT = 0.32;
            Audio.play('swingHeavy', 0.5);
          }
          hit(t, dt);
          if (p.inputDir.lengthSq() < 0.01) p.dash(2.5, dt);
          if (Math.floor(t * 10) !== Math.floor((t - dt) * 10)) fx.ring(p.pos, 3.5, 4.4, c, 0.18, 0.9);
        }, true, false, 0.6);
      }
      case 'gy_musou': {
        const c = 0x30ff70;
        this.musouStart(c, 6.5);
        const tick = this.chargeTick(c);
        return new Timeline(id, 3.3, [
          [0.95, () => anim('overhead', 0.6)],
          [1.25, () => {
            b.projectiles.wave(p.pos, p.facing, { dmg: p.attackPower() * 3.0 * M, kind: 'launch', color: c, range: 26, width: 3.6, dragon: true, speed: 20, size: 0.8 });
            this.area(5, 90, 2.0 * M, 'quake', c);
            for (let i = 1; i <= 5; i++) b.schedule(i * 0.12, () => {
              const at = this.ahead(i * 4.5, new THREE.Vector3());
              fx.groundCrack(at, 2.5);
              fx.shockwave(at, 3, c);
            });
            Audio.play('explosion', 0.6);
            fx.shake.add(0.5);
          }],
          [2.1, () => {
            anim('slashR', 0.5);
            this.area(6, 240, 1.4 * M, 'heavy', c);
            fx.slash(p.pos, p.facing, 6, 240, c, { life: 0.4 });
          }],
          [2.7, () => {
            const at = this.ahead(5, new THREE.Vector3());
            this.area(7.5, 360, 3.0 * M, 'finisher', c, { at, walls: true });
            this.finisherFx(7.5, c, at);
          }],
        ], tick, true, true);
      }
      // ================= 张飞 =================
      case 'zf_quake': {
        const c = 0xffa040;
        anim('slam', 1.1);
        return new Timeline(id, 1.1, [
          [0.64, () => {
            this.area(6.6, 360, 2.1, 'quake', c, { walls: true });
            fx.shockwave(p.pos, 6.6, c);
            fx.groundCrack(p.pos, 4);
            fx.shake.add(0.6);
            b.vibrate(50);
            Audio.play('quake');
          }],
        ], (t, dt) => {
          if (t > 0.15 && t < 0.6) p.dash(4, dt);
        });
      }
      case 'zf_roar': {
        const c = 0xff5030;
        anim('roar', 1.1);
        return new Timeline(id, 1.1, [
          [0.22, () => {
            this.fearAround(11, 3.5);
            p.buffAtk(1.5, 10);
            fx.ring(p.pos, 0.5, 11, c, 0.6, 1.2);
            fx.ring(p.pos, 0.5, 8, 0xffd040, 0.5, 0.3);
            fx.shake.add(0.4);
            Audio.play('roar');
            for (const bo of b.bosses) if (bo.alive && bo.pos.distanceTo(p.pos) < 10) bo.stagger(0.6);
          }],
        ], (t) => {
          if (t > 0.2 && t < 0.9) fx.aura(p.pos, c, 0.8, 2.6);
        }, true, false);
      }
      case 'zf_musou': {
        const c = 0xff8030;
        this.musouStart(c, 6);
        const slam = (r: number) => () => {
          anim('slam', 0.6);
          b.schedule(0.33, () => {
            this.area(r, 360, 1.5 * M, 'quake', c, { walls: true });
            fx.shockwave(p.pos, r, c);
            fx.groundCrack(p.pos, r * 0.6);
            fx.shake.add(0.45);
            Audio.play('quake');
          });
        };
        return new Timeline(id, 3.7, [
          [0.3, () => {
            Audio.play('roar');
            this.fearAround(10, 2);
          }],
          [0.95, slam(5.5)],
          [1.6, slam(6.5)],
          [2.25, slam(7.5)],
          [2.95, () => anim('spin', 0.6)],
          [3.2, () => {
            this.area(9, 360, 3.4 * M, 'finisher', c, { walls: true });
            this.finisherFx(9, c);
          }],
        ], (t, dt) => {
          this.chargeTick(c)(t, dt);
          if ((t > 0.95 && t < 1.25) || (t > 1.6 && t < 1.9) || (t > 2.25 && t < 2.55)) p.dash(5, dt);
        }, true, true);
      }
      // ================= 吕布 =================
      case 'lb_flurry': {
        const c = 0xff4050;
        p.anim.playFlurry(1.0, 8);
        const hit = every(0.1, () => {
          this.area(4.6, 110, 0.6, 'light', c);
          fx.slash(p.pos, p.facing + (Math.random() - 0.5) * 0.8, 4.2, 70, c, { tilt: (Math.random() - 0.5) * 1.5, life: 0.12 });
          Audio.play('thrust', 0.6);
        });
        return new Timeline(id, 1.0, [[0.9, () => {
          this.area(4.8, 150, 1.8, 'launch', c);
          fx.slash(p.pos, p.facing, 4.8, 150, c, { tilt: Math.PI / 2 });
        }]], (t, dt) => {
          if (t < 0.85) hit(t, dt);
          if (t < 0.6) p.dash(2.5, dt);
        });
      }
      case 'lb_whirl': {
        const c = 0xff2040;
        const hit = every(0.15, () => this.area(5, 360, 0.5, 'light', c, { walls: true }));
        let spinT = 0;
        return new Timeline(id, 2.6, [[2.45, () => {
          this.area(5.6, 360, 2.0, 'launch', c);
          fx.explosion(p.pos, 4, c);
          Audio.play('explosion', 0.6);
        }]], (t, dt) => {
          spinT -= dt;
          if (spinT <= 0) {
            anim('spin', 0.3);
            spinT = 0.3;
            Audio.play('swingHeavy', 0.4);
          }
          hit(t, dt);
          // 吸引周围敌人
          for (const s of b.pool.query(p.pos.x, p.pos.z, 9, 1)) {
            if (s.type.superArmor > 0.7) continue;
            _w.set(p.pos.x - s.pos.x, 0, p.pos.z - s.pos.z);
            const d = _w.length();
            if (d > 2) s.pos.addScaledVector(_w.normalize(), Math.min(d - 2, 7 * dt));
          }
          for (let i = 0; i < 5; i++) {
            const a = -t * 10 + (i / 5) * Math.PI * 2;
            const r = 1 + ((t * 3 + i * 0.7) % 4);
            fx.particles.spawn({ x: p.pos.x + Math.cos(a) * r, y: 0.3 + r * 0.4, z: p.pos.z + Math.sin(a) * r, vx: Math.sin(a) * 4, vy: 1.5, vz: -Math.cos(a) * 4, life: 0.3, size: 0.2, color: i % 2 ? c : 0x200008 });
          }
        }, true, false, 0.6);
      }
      case 'lb_musou': {
        const c = 0xff2030;
        this.musouStart(c, 7);
        const swing = (n: 'slashR' | 'slashL' | 'cross' | 'spin', arc: number) => () => {
          anim(n, 0.36);
          this.area(6.2, arc, 1.15 * M, 'heavy', c, { walls: true });
          fx.slash(p.pos, p.facing, 6, arc, c, { life: 0.3, tilt: n === 'cross' ? 0.7 : n === 'slashL' ? -0.25 : 0.25 });
          Audio.play('swingHeavy');
          fx.shake.add(0.2);
        };
        return new Timeline(id, 3.9, [
          [0.9, swing('slashR', 220)],
          [1.25, swing('slashL', 220)],
          [1.6, swing('cross', 200)],
          [1.95, swing('spin', 360)],
          [2.3, swing('slashR', 240)],
          [2.65, swing('spin', 360)],
          [3.15, () => {
            // 全屏范围冲击波
            this.area(20, 360, 3.2 * M, 'finisher', c, { walls: true });
            this.finisherFx(9, c);
            fx.ring(p.pos, 2, 22, c, 0.9, 0.3);
            fx.ring(p.pos, 2, 18, 0xffffff, 0.7, 1.2);
          }],
        ], (t, dt) => {
          this.chargeTick(c)(t, dt);
          if (t > 0.9 && t < 2.8) p.dash(3, dt);
        }, true, true);
      }
      // ================= 刘备 =================
      case 'lbei_light': {
        const c = 0xffe080;
        anim('raise', 1.0);
        return new Timeline(id, 1.0, [[0.35, () => {
          p.heal(p.maxHp * 0.3);
          this.area(5.5, 360, 0.8, 'heavy', c, { walls: true });
          fx.pillar(p.pos, 2.5, 12, c, 1.0);
          fx.ring(p.pos, 0.5, 9, c, 0.6);
          b.buffAllies(p.pos, 14);
          Audio.play('levelup');
        }]], (t) => {
          if (t < 0.9) fx.aura(p.pos, c, 1.2, 3);
        }, true, false);
      }
      case 'lbei_dance': {
        const c = 0x60ffc0;
        const hit = every(0.12, () => {
          this.area(3.2, 170, 0.6, 'light', c);
          fx.slash(p.pos, p.facing, 2.8, 150, c, { tilt: (Math.random() - 0.5) * 1.6, life: 0.14 });
          Audio.play('swing', 0.6);
        });
        const ghost = every(0.08, () => fx.ghost(p.rig, c));
        anim('cross', 1.0);
        return new Timeline(id, 1.0, [[0.82, () => {
          for (const yo of [-0.3, 0.3]) b.projectiles.wave(p.pos, p.facing + yo, { dmg: p.attackPower() * 1.4, kind: 'heavy', color: c, range: 12, width: 1.5 });
          fx.slash(p.pos, p.facing, 3.5, 160, c, { tilt: 0.8 });
          fx.slash(p.pos, p.facing, 3.5, 160, c, { tilt: -0.8 });
        }]], (t, dt) => {
          if (t < 0.7) {
            p.dash(10, dt);
            hit(t, dt);
            ghost(t, dt);
          }
        });
      }
      case 'lbei_musou': {
        const c = 0x40ffb0;
        const c2 = 0xffe080;
        this.musouStart(c, 6);
        let em1: Emitter | null = null;
        let em2: Emitter | null = null;
        const hit = every(0.22, () => this.area(5.8, 360, 0.75 * M, 'light', c, { walls: true }));
        return new Timeline(id, 3.4, [
          [0.8, () => {
            em1 = fx.emitter({ pos: p.pos, life: 2.0, rate: 120, color: c, color2: 0xffffff, size: 0.45, spread: 0.5, kind: 'dragon' });
            em2 = fx.emitter({ pos: p.pos, life: 2.0, rate: 120, color: c2, color2: 0xffffff, size: 0.45, spread: 0.5, kind: 'dragon' });
            anim('spin', 0.5);
          }],
          [1.6, () => anim('cross', 0.5)],
          [2.2, () => anim('spin', 0.5)],
          [2.85, () => {
            this.area(8.5, 360, 3.0 * M, 'finisher', c, { walls: true });
            this.finisherFx(8.5, c);
          }],
        ], (t, dt) => {
          this.chargeTick(c)(t, dt);
          if (t > 0.8 && t < 2.8 && em1 && em2) {
            hit(t, dt);
            const a = t * 5;
            em1.pos.set(p.pos.x + Math.cos(a) * 4, 1 + Math.sin(t * 7) * 0.6, p.pos.z + Math.sin(a) * 4);
            em2.pos.set(p.pos.x + Math.cos(a + Math.PI) * 4, 1 + Math.cos(t * 7) * 0.6, p.pos.z + Math.sin(a + Math.PI) * 4);
          }
        }, true, true);
      }
      // ================= 孙尚香 =================
      case 'ssx_orbit': {
        anim('spin', 0.45);
        p.orbitT = 6.5;
        Audio.play('wind');
        return new Timeline(id, 0.45, [], null, false, false, 0.8);
      }
      case 'ssx_rain': {
        const c = 0xff7020;
        anim('throw', 0.8);
        const target = this.ahead(8, new THREE.Vector3());
        b.fx.telegraphCircle(target, 4.5, 0.6, 0xffa040);
        return new Timeline(id, 0.8, [[0.4, () => {
          Audio.play('arrow');
          for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 4.5;
            const pt = new THREE.Vector3(target.x + Math.cos(a) * r, 0, target.z + Math.sin(a) * r);
            b.schedule(0.1 + i * 0.05, () => b.projectiles.fireArrow(pt, p.attackPower() * 0.9));
          }
          fx.ring(target, 0.5, 4.5, c, 0.5);
        }]], null, false);
      }
      case 'ssx_musou': {
        const c = 0xff70b0;
        this.musouStart(c, 6);
        let k = 0;
        const thr = every(0.12, () => {
          const yaw = p.facing + k * 0.9;
          k++;
          b.projectiles.ring(p.pos, yaw, p.attackPower() * 0.9 * M, 9, p.pos, 'heavy');
          Audio.play('swing', 0.4);
        });
        let spinT = 0;
        return new Timeline(id, 3.3, [[2.8, () => {
          this.area(7.5, 360, 2.8 * M, 'finisher', c, { walls: true });
          this.finisherFx(7.5, c);
        }]], (t, dt) => {
          this.chargeTick(c)(t, dt);
          if (t > 0.7 && t < 2.5) {
            thr(t, dt);
            spinT -= dt;
            if (spinT <= 0) {
              anim('spin', 0.35);
              spinT = 0.35;
            }
          }
        }, true, true);
      }
      // ================= 曹操 =================
      case 'cc_pillar': {
        const c = 0xa060ff;
        anim('overhead', 1.1);
        const ev: Ev[] = [];
        [3, 5.5, 8, 10.5, 13].forEach((d, i) => {
          ev.push([0.5 + i * 0.1, () => {
            const at = this.ahead(d, new THREE.Vector3());
            fx.pillar(at, 1.4, 7, c, 0.6);
            fx.ring(at, 0.3, 2.4, c, 0.35);
            fx.debris(at, 0x3a2a5a, 5, 4);
            this.area(2.4, 360, 1.5, 'launch', c, { at });
            Audio.play('explosion', 0.3);
          }]);
        });
        return new Timeline(id, 1.1, ev, null);
      }
      case 'cc_tyrant': {
        const c = 0x8030ff;
        anim('raise', 0.9);
        return new Timeline(id, 0.9, [[0.3, () => {
          p.buffTyrant(10);
          fx.ring(p.pos, 0.5, 7, c, 0.6, 0.2);
          fx.pillar(p.pos, 1.2, 6, c, 0.7);
          this.fearAround(7, 2);
          Audio.play('roar', 0.7);
        }]], (t) => {
          if (t < 0.85) fx.aura(p.pos, c, 0.9, 2.6);
        }, true, false);
      }
      case 'cc_musou': {
        const c = 0x9050ff;
        this.musouStart(c, 7);
        const four = (n: 'slashR' | 'slashL' | 'cross' | 'spin', off: number) => () => {
          anim(n, 0.36);
          for (let i = 0; i < 4; i++) b.projectiles.wave(p.pos, p.facing + off + (i * Math.PI) / 2, { dmg: p.attackPower() * 1.2 * M, kind: 'heavy', color: c, range: 14, width: 1.6 });
          this.area(4.5, 360, 1.0 * M, 'heavy', c);
          fx.slash(p.pos, p.facing + off, 4.2, 360, c, { life: 0.3 });
          Audio.play('swingHeavy');
        };
        return new Timeline(id, 3.7, [
          [0.85, four('slashR', 0)],
          [1.25, four('slashL', Math.PI / 4)],
          [1.65, four('cross', 0)],
          [2.05, four('spin', Math.PI / 4)],
          [2.4, () => fx.magicCircle(p.pos, 9, c, 1.0)],
          [3.05, () => {
            this.area(9.5, 360, 3.3 * M, 'finisher', c, { walls: true });
            this.finisherFx(9.5, c);
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              fx.pillar(new THREE.Vector3(p.pos.x + Math.cos(a) * 6, 0, p.pos.z + Math.sin(a) * 6), 0.8, 8, c, 0.8);
            }
          }],
        ], this.chargeTick(c), true, true);
      }
    }
    return new Timeline(id, 0.3, [], null);
  }
}
