import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { BossDef, HitKind } from '../data/types';
import { buildCharacter, type CharacterRig } from '../characters/CharacterFactory';
import { AnimationController, type ActionName } from '../characters/AnimationController';
import { WeaponTrail } from '../effects/SlashEffect';
import { defReduce } from '../combat/DamageSystem';
import type { TelegraphHandle } from '../effects/EffectManager';
import { lerpAngle } from './EnemyAI';

// Boss / 敌方武将：独立血条、阶段、攻击模式、明显的前摇与范围提示、可反击的破绽时机

type BState = 'intro' | 'chase' | 'act' | 'recover' | 'stagger' | 'down' | 'dead';

interface Step {
  t: number;
  fn: () => void;
}

const POISE: Record<HitKind, number> = { light: 1, heavy: 3, launch: 5, quake: 4, finisher: 18 };

export class BossController {
  def: BossDef;
  name: string;
  rig: CharacterRig;
  anim: AnimationController;
  trail: WeaponTrail | null = null;
  pos = new THREE.Vector3();
  facing = Math.PI;
  hp: number;
  maxHp: number;
  atk: number;
  defense: number;
  spd: number;
  alive = true;
  active = true;
  state: BState = 'intro';
  st = 0;
  enraged = false;
  poise = 0;
  poiseMax: number;
  burn = 0;
  vulnerable = 0;
  private steps: Step[] = [];
  private actT = 0;
  private actDur = 0;
  private cd: Record<string, number> = {};
  private thinkT = 1;
  private tele: TelegraphHandle[] = [];
  private flashT = 0;
  private vel = new THREE.Vector3();
  private dashing = 0;
  private dashDir = new THREE.Vector3();
  private dashHit = false;
  private spinning = 0;
  private spinAcc = 0;
  private leap: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null = null;
  private lastFinal = -99;
  private time = 0;
  private hpMul: number;
  onDefeated: ((b: BossController) => void) | null = null;

  constructor(private b: Battle, def: BossDef, x: number, z: number, mirror: boolean) {
    this.def = def;
    this.name = (mirror ? '幻影·' : '') + def.name;
    this.hpMul = b.diffCfg.enemyHp;
    this.maxHp = this.hp = Math.round(def.hp * this.hpMul * 0.8);
    // 难度攻击倍率在玩家受伤时统一结算
    this.atk = def.atk;
    this.defense = def.def;
    this.spd = def.spd;
    this.poiseMax = def.tier === 'boss' ? 45 : 28;
    this.rig = buildCharacter(def.look, def.weaponType, { weaponGlow: def.tier === 'boss' ? def.color : undefined, tint: mirror ? 0x301030 : undefined });
    this.rig.root.scale.multiplyScalar(def.tier === 'boss' ? 1.12 : 1.05);
    this.anim = new AnimationController(this.rig, def.weaponType);
    b.sm.scene.add(this.rig.root);
    this.pos.set(x, 0, z);
    if (this.rig.weaponR) {
      this.trail = new WeaponTrail(b.sm.scene, this.rig.weaponR);
      this.trail.setColor(def.color);
    }
    // 登场演出
    this.state = 'intro';
    this.st = 0;
    this.anim.play('roar', 1.4);
    for (const m of def.moves) this.cd[m] = 2 + Math.random() * 3;
  }

  get radius(): number {
    return 0.8;
  }

  get phaseLabel(): string {
    if (!this.alive) return '';
    if (this.vulnerable > 0) return '破绽！';
    return this.enraged ? '狂暴' : '';
  }

  stagger(t: number): void {
    if (!this.alive || this.state === 'intro' || this.state === 'dead') return;
    this.cancelAct();
    this.state = 'stagger';
    this.st = -t;
    this.anim.play('hit', 0.4);
  }

  takeDamage(raw: number, kind: HitKind, from: THREE.Vector3, fromPlayer: boolean): number {
    if (!this.alive || this.state === 'intro') return 0;
    let dmg = defReduce(raw, this.defense);
    if (this.vulnerable > 0) dmg *= 1.5;
    if (this.state === 'down') dmg *= 1.2;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flashT = 0.1;
    if (fromPlayer) this.b.stats.bossDamage += dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return dmg;
    }
    if (!fromPlayer) return dmg;
    // 强化阶段
    if (!this.enraged && this.def.tier === 'boss' && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      this.spd *= 1.2;
      this.b.hud.toast(`${this.name} 进入狂暴状态！`, 'warn');
      this.b.fx.ring(this.pos, 0.5, 8, this.def.color, 0.6);
      Audio.play('roar', 0.8);
      this.cancelAct();
      this.state = 'act';
      this.actT = 0;
      this.actDur = 1.2;
      this.steps = [];
      this.anim.play('roar', 1.2);
      return dmg;
    }
    // 削韧：积累到上限后硬直倒地
    if (this.state !== 'down') {
      this.poise += POISE[kind] * (this.vulnerable > 0 ? 2 : 1);
      if (this.poise >= this.poiseMax) {
        this.poise = 0;
        this.cancelAct();
        this.state = 'down';
        this.st = 0;
        this.anim.play('knockdown', 0.5);
        this.vel.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(5);
        this.b.hud.toast('敌将陷入硬直！', 'good');
      } else if (this.vulnerable > 0 && this.state !== 'stagger') {
        this.anim.play('hit', 0.3);
      }
    }
    return dmg;
  }

  private die(): void {
    this.alive = false;
    this.cancelAct();
    this.state = 'dead';
    this.st = 0;
    this.anim.play('knockdown', 0.9);
    this.b.fx.explosion(this.pos, 4, this.def.color);
    Audio.play('explosion');
    this.b.slowmo(0.25, 1.0);
    this.onDefeated?.(this);
  }

  private cancelAct(): void {
    for (const t of this.tele) t.remove();
    this.tele = [];
    this.steps = [];
    this.dashing = 0;
    this.spinning = 0;
    this.leap = null;
  }

  private get player() {
    return this.b.player;
  }

  private distToPlayer(): number {
    return Math.hypot(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z);
  }

  private yawToPlayer(): number {
    return Math.atan2(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z);
  }

  // 对玩家进行扇形判定
  private strike(range: number, arc: number, mult: number, kind: HitKind, at = this.pos, yaw = this.facing): void {
    const p = this.player;
    if (!p.alive) return;
    const dx = p.pos.x - at.x, dz = p.pos.z - at.z;
    const d = Math.hypot(dx, dz);
    if (d > range + 0.4) return;
    if (arc < 359 && d > 0.8) {
      let a = Math.atan2(dx, dz) - yaw;
      a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (a > (arc * Math.PI) / 360 + 0.2) return;
    }
    p.takeDamage(this.atk * mult, kind, at);
    // 也伤害附近友军
    for (const s of this.b.pool.query(at.x, at.z, range, 0)) this.b.damage.damageSoldier(s, this.atk * mult, kind, s.pos.x - at.x, s.pos.z - at.z, {});
  }

  private play(name: ActionName, dur: number): void {
    this.anim.play(name, dur);
  }

  private begin(dur: number, steps: Array<[number, () => void]>): void {
    this.state = 'act';
    this.actT = 0;
    this.actDur = dur;
    this.steps = steps.map(([t, fn]) => ({ t, fn })).sort((a, b) => a.t - b.t);
  }

  private recover(t: number): void {
    // 破绽：大招之后的可反击时机
    this.vulnerable = t;
  }

  private chooseMove(): void {
    const d = this.distToPlayer();
    const moves = this.def.moves.filter((m) => (this.cd[m] ?? 0) <= 0);
    const hpK = this.hp / this.maxHp;
    let pick: string | null = null;
    if (this.enraged && moves.includes('finalBurst') && hpK < 0.35 && this.time - this.lastFinal > 22) pick = 'finalBurst';
    else {
      const cand = moves.filter((m) => {
        if (m === 'finalBurst') return false;
        if (m === 'combo3') return d < 4.5;
        if (m === 'spinAoE') return d < 5;
        if (m === 'dashStrike' || m === 'waveShot' || m === 'pillars') return d > 4 && d < 18;
        if (m === 'slamAoE' || m === 'leapSlam') return d > 3 && d < 14;
        if (m === 'blink') return d > 5;
        if (m === 'summon') return this.b.pool.countTeam(1) < 20;
        return true;
      });
      if (cand.length) pick = cand[Math.floor(Math.random() * cand.length)];
    }
    if (!pick) return;
    const cdMul = this.enraged ? 0.65 : 1;
    const base: Record<string, number> = { combo3: 2.5, dashStrike: 6, slamAoE: 7, spinAoE: 6, waveShot: 5, leapSlam: 9, blink: 6, summon: 20, finalBurst: 25, pillars: 8 };
    this.cd[pick] = (base[pick] ?? 5) * cdMul;
    this.execute(pick);
  }

  private execute(m: string): void {
    const b = this.b;
    const fx = b.fx;
    const c = this.def.color;
    const sp = this.enraged ? 0.8 : 1;
    this.facing = this.yawToPlayer();
    switch (m) {
      case 'combo3': {
        const swings: Array<[ActionName, HitKind, number]> = [['slashR', 'light', 1.0], ['slashL', 'light', 1.0], ['overhead', 'heavy', 1.6]];
        const steps: Array<[number, () => void]> = [];
        swings.forEach(([sw, kind, mult], i) => {
          const t0 = i * 0.6 * sp;
          steps.push([t0, () => {
            this.facing = this.yawToPlayer();
            this.tele.push(fx.telegraphLine(this.pos, this.facing, 3.8, 3.4, 0.32 * sp, 0xff3020));
            this.play(sw, 0.6 * sp);
          }]);
          steps.push([t0 + 0.32 * sp, () => {
            this.strike(3.8, 150, mult, kind);
            fx.slash(this.pos, this.facing, 3.6, 150, c, { tilt: sw === 'overhead' ? Math.PI / 2 : 0.2 });
            Audio.play(kind === 'heavy' ? 'swingHeavy' : 'swing', 0.6);
          }]);
        });
        steps.push([1.9 * sp, () => this.recover(0.8)]);
        this.begin(2.1 * sp, steps);
        break;
      }
      case 'dashStrike': {
        const yaw = this.facing;
        this.play('windup', 0.7);
        this.tele.push(fx.telegraphLine(this.pos, yaw, 13, 2.6, 0.7 * sp));
        Audio.play('warning', 0.5);
        this.begin(2.4 * sp, [
          [0.7 * sp, () => {
            this.play('thrust', 0.55);
            this.dashing = 0.55;
            this.dashDir.set(Math.sin(yaw), 0, Math.cos(yaw));
            this.dashHit = false;
            Audio.play('thrust');
          }],
          [1.3 * sp, () => this.recover(1.2)],
        ]);
        break;
      }
      case 'slamAoE': {
        const to = this.player.pos.clone();
        this.play('slam', 1.3 * sp);
        this.tele.push(fx.telegraphCircle(to, 5, 0.85 * sp));
        Audio.play('warning', 0.5);
        this.leap = { from: this.pos.clone(), to, t: 0, dur: 0.78 * sp };
        this.begin(2.6 * sp, [
          [0.8 * sp, () => {
            this.strike(5, 360, 1.8, 'quake', to);
            fx.shockwave(to, 5, c);
            fx.groundCrack(to, 3);
            fx.shake.add(0.5);
            Audio.play('quake');
          }],
          [1.2 * sp, () => this.recover(1.5)],
        ]);
        break;
      }
      case 'spinAoE': {
        this.tele.push(fx.telegraphCircle(this.pos, 4.8, 0.8 * sp));
        this.play('windup', 0.8);
        Audio.play('warning', 0.5);
        this.begin(2.8 * sp, [
          [0.8 * sp, () => {
            this.spinning = 1.2;
            this.spinAcc = 0;
          }],
          [2.0 * sp, () => this.recover(1.0)],
        ]);
        break;
      }
      case 'waveShot': {
        this.play('windup', 0.6);
        this.tele.push(fx.telegraphLine(this.pos, this.facing, 18, 2.2, 0.6 * sp));
        this.begin(1.8 * sp, [
          [0.6 * sp, () => {
            this.play('slashR', 0.5);
            const n = this.enraged ? 3 : 1;
            for (let i = 0; i < n; i++) b.projectiles.orb(this.pos, this.facing + (i - (n - 1) / 2) * 0.3, this.atk * 1.3, c, 15, 22);
            fx.slash(this.pos, this.facing, 3, 150, c);
            Audio.play('swingHeavy');
          }],
          [1.2 * sp, () => this.recover(0.7)],
        ]);
        break;
      }
      case 'leapSlam': {
        const to = this.player.pos.clone();
        this.play('slam', 1.6 * sp);
        this.tele.push(fx.telegraphCircle(to, 7, 1.15 * sp));
        Audio.play('warning', 0.6);
        this.leap = { from: this.pos.clone(), to, t: 0, dur: 1.05 * sp };
        this.begin(3.2 * sp, [
          [1.1 * sp, () => {
            this.strike(7, 360, 2.4, 'launch', to);
            fx.explosion(to, 4, c);
            fx.shockwave(to, 7, c);
            fx.groundCrack(to, 4);
            fx.shake.add(0.7);
            Audio.play('explosion');
          }],
          [1.5 * sp, () => this.recover(1.8)],
        ]);
        break;
      }
      case 'blink': {
        const p = this.player;
        fx.ghost(this.rig, c, 0.4);
        fx.dissolve(this.pos, c, 2);
        const behind = new THREE.Vector3(p.pos.x - Math.sin(p.facing) * 2.5, 0, p.pos.z - Math.cos(p.facing) * 2.5);
        const px = this.pos.x, pz = this.pos.z;
        this.pos.copy(behind);
        b.env.resolve(this.pos, px, pz, 0.6);
        fx.dissolve(this.pos, c, 2);
        this.facing = this.yawToPlayer();
        Audio.play('wind', 0.6);
        this.tele.push(fx.telegraphLine(this.pos, this.facing, 3.6, 3, 0.45 * sp));
        this.play('windup', 0.45);
        this.begin(1.5 * sp, [
          [0.45 * sp, () => {
            this.play('cross', 0.5);
            this.strike(3.6, 140, 1.4, 'heavy');
            fx.slash(this.pos, this.facing, 3.4, 150, c, { tilt: 0.8 });
          }],
          [0.9 * sp, () => this.recover(0.8)],
        ]);
        break;
      }
      case 'summon': {
        this.play('raise', 1.0);
        Audio.play('horn');
        this.begin(1.4, [[0.6, () => {
          b.spawner.spawnGroup(this.pos.x, this.pos.z, 5, [['sword', 4], ['spear', 3], ['elite', this.enraged ? 1 : 0]], 1);
          b.hud.toast(`${this.name} 呼唤了援军！`, 'warn');
        }]]);
        break;
      }
      case 'pillars': {
        this.play('overhead', 1.2);
        const yaw = this.facing;
        const steps: Array<[number, () => void]> = [];
        for (let i = 1; i <= 5; i++) {
          const at = new THREE.Vector3(this.pos.x + Math.sin(yaw) * i * 3, 0, this.pos.z + Math.cos(yaw) * i * 3);
          steps.push([0.1 * i, () => this.tele.push(fx.telegraphCircle(at, 2.2, 0.7))]);
          steps.push([0.7 + 0.1 * i, () => {
            fx.pillar(at, 1.4, 7, c, 0.6);
            this.strike(2.2, 360, 1.5, 'launch', at);
            Audio.play('explosion', 0.3);
          }]);
        }
        steps.push([1.6, () => this.recover(1.0)]);
        this.begin(2.4, steps);
        break;
      }
      case 'finalBurst': {
        this.lastFinal = this.time;
        this.play('raise', 1.9);
        this.tele.push(fx.telegraphCircle(this.pos, 9.5, 1.9, 0xff0000));
        fx.magicCircle(this.pos, 9.5, c, 2.2);
        b.hud.toast(`${this.name} 正在蓄力终结攻击！快逃离范围！`, 'warn');
        Audio.play('charge', 1);
        Audio.play('warning', 1);
        this.begin(4.8, [
          [1.9, () => {
            this.strike(9.5, 360, 3.2, 'finisher');
            fx.explosion(this.pos, 7, c, 0xffffff);
            fx.shockwave(this.pos, 10, c);
            fx.pillar(this.pos, 3, 16, c, 0.9);
            fx.flash('#ff4040', 0.5);
            fx.shake.add(0.9);
            Audio.play('musouFinish', 0.9);
            this.play('roar', 0.6);
          }],
          [2.3, () => this.recover(2.5)],
        ]);
        break;
      }
    }
  }

  update(dt: number): void {
    const b = this.b;
    this.time += dt;
    this.st += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.vulnerable = Math.max(0, this.vulnerable - dt);
    for (const k in this.cd) this.cd[k] -= dt;
    if (this.burn > 0 && this.alive) {
      this.burn -= dt;
      if (Math.random() < dt * 2) {
        this.takeDamage(b.player.attackPower() * 0.15, 'light', this.pos, true);
        b.fx.fire(this.pos.clone().setY(1), 3, 0.4);
      }
    }
    this.tele = this.tele.filter((t) => !t.done);
    const px = this.pos.x, pz = this.pos.z;
    let moving = 0;
    switch (this.state) {
      case 'intro':
        if (this.st > 1.6) {
          this.state = 'chase';
          this.st = 0;
        }
        this.facing = lerpAngle(this.facing, this.yawToPlayer(), Math.min(1, dt * 3));
        break;
      case 'chase': {
        if (!this.player.alive) break;
        const d = this.distToPlayer();
        const yaw = this.yawToPlayer();
        this.facing = lerpAngle(this.facing, yaw, Math.min(1, dt * 6));
        if (d > 2.6) {
          const sp = this.spd * (d > 10 ? 1.25 : 1);
          this.pos.x += Math.sin(yaw) * sp * dt;
          this.pos.z += Math.cos(yaw) * sp * dt;
          moving = sp;
        }
        this.thinkT -= dt;
        if (this.thinkT <= 0) {
          this.thinkT = (this.enraged ? 0.5 : 0.85) + Math.random() * 0.6;
          this.chooseMove();
        }
        break;
      }
      case 'act': {
        this.actT += dt;
        while (this.steps.length && this.steps[0].t <= this.actT) this.steps.shift()!.fn();
        if (this.actT >= this.actDur) {
          this.state = 'chase';
          this.st = 0;
          this.thinkT = 0.4 + Math.random() * 0.5;
        }
        break;
      }
      case 'stagger':
        if (this.st >= 0) {
          this.state = 'chase';
          this.st = 0;
        }
        break;
      case 'down':
        this.pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
        this.vulnerable = Math.max(this.vulnerable, 0.1);
        if (this.st > 2.0 && this.anim.current !== 'getup') this.anim.play('getup', 0.6);
        if (this.st > 2.6) {
          this.state = 'chase';
          this.st = 0;
        }
        break;
      case 'dead':
        if (this.st > 2.5 && this.active) {
          this.active = false;
          b.fx.dissolve(this.pos, this.def.color, 2.2);
          b.fx.dissolve(this.pos, 0xffffff, 2.2);
          this.rig.root.visible = false;
        }
        break;
    }
    // 突进
    if (this.dashing > 0) {
      this.dashing -= dt;
      this.pos.addScaledVector(this.dashDir, 24 * dt);
      moving = 0;
      if (Math.random() < 0.5) b.fx.ghost(this.rig, this.def.color, 0.25);
      if (!this.dashHit && this.distToPlayer() < 2.2) {
        this.dashHit = true;
        this.player.takeDamage(this.atk * 2.0, 'launch', this.pos);
      }
    }
    // 旋转攻击
    if (this.spinning > 0) {
      this.spinning -= dt;
      this.spinAcc += dt;
      if (this.anim.current !== 'spin' || this.anim.actionT > 0.95) this.anim.play('spin', 0.3);
      if (this.spinAcc > 0.25) {
        this.spinAcc = 0;
        this.strike(4.8, 360, 0.7, 'light');
        b.fx.slash(this.pos, this.facing, 4.6, 360, this.def.color, { life: 0.2 });
        Audio.play('swingHeavy', 0.4);
      }
      if (this.player.alive) {
        const yaw = this.yawToPlayer();
        this.pos.x += Math.sin(yaw) * 2.5 * dt;
        this.pos.z += Math.cos(yaw) * 2.5 * dt;
      }
    }
    // 跳跃落点
    if (this.leap) {
      const L = this.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      this.pos.lerpVectors(L.from, L.to, k);
      if (k >= 1) this.leap = null;
    }
    b.env.resolve(this.pos, px, pz, 0.7);
    // 渲染
    this.rig.root.position.copy(this.pos);
    if (this.leap) this.rig.root.position.y = Math.sin(Math.min(1, this.leap.t / this.leap.dur) * Math.PI) * 3.5;
    this.rig.root.rotation.y = this.facing;
    this.anim.speed01 = Math.min(1, moving / 7);
    this.anim.update(dt);
    const f = this.flashT > 0 ? 0.7 : this.vulnerable > 0 ? 0.25 + Math.sin(this.time * 20) * 0.15 : this.enraged ? 0.18 : 0;
    this.rig.flash(f, this.flashT > 0 ? 0xffffff : this.vulnerable > 0 ? 0xffe040 : this.def.color);
    this.trail?.update(dt, this.state === 'act' || this.spinning > 0 || this.dashing > 0);
    if (this.enraged && this.alive) b.fx.aura(this.pos, this.def.color, 0.7, 2.6);
  }

  dispose(): void {
    this.cancelAct();
    this.rig.root.removeFromParent();
    this.rig.dispose();
    this.trail?.dispose();
  }
}
