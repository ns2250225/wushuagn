import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import { GameState } from '../game/GameState';
import { SKILLS } from '../data/heroes';
import { ELEMENT_INFO } from '../data/items';
import type { Element, HeroDef, HitKind, MoveDef, Stats } from '../data/types';
import { buildCharacter, type CharacterRig } from './CharacterFactory';
import { AnimationController } from './AnimationController';
import { WeaponTrail } from '../effects/SlashEffect';
import { defReduce } from '../combat/DamageSystem';
import type { ActiveSkill } from '../combat/SkillSystem';
import type { InputState } from '../controls/InputManager';
import { lerpAngle } from '../enemies/EnemyAI';
import { SState } from '../enemies/EnemyPool';

// 玩家武将控制：移动、普攻连段、重攻击 / 蓄力、闪避（无敌帧 + 体力）、技能、无双、受击与倒地

type PState = 'move' | 'attack' | 'charge' | 'skill' | 'musou' | 'dodge' | 'hit' | 'down' | 'getup' | 'dead' | 'victory';

const SWING_TILT: Partial<Record<string, number>> = { slashR: 0.25, slashL: -0.25, overhead: Math.PI / 2, uppercut: -Math.PI / 2, cross: 0.8, slam: Math.PI / 2, leapThrust: Math.PI / 2 };

export class PlayerController {
  hero: HeroDef;
  rig: CharacterRig;
  anim: AnimationController;
  trails: WeaponTrail[] = [];
  stats: Stats;
  element: Element;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0;
  hp: number;
  maxHp: number;
  musou = 0;
  state: PState = 'move';
  st = 0;
  alive = true;
  inputDir = new THREE.Vector3();
  skillCd = [0, 0];
  skillMax = [0, 0];
  dodgeCharges = 2;
  dodgeMax = 2;
  private dodgeRegen = 0;
  private dodgeDir = new THREE.Vector3();
  // 攻击
  private move: MoveDef | null = null;
  private moveMult = 1;
  private moveT = 0;
  private moveDur = 1;
  private hitIdx = 0;
  comboIdx = 0;
  private comboWindow = 0;
  private queued = false;
  private queuedHeavy = false;
  private heavyHeld = 0;
  private chargeLv = 0;
  private skill: ActiveSkill | null = null;
  private hurtFlash = 0;
  private invulnT = 0;
  private grabbed: import('../enemies/EnemyPool').Soldier | null = null;
  // 增益
  atkBuff = { mul: 1, t: 0 };
  defBuff = { mul: 1, t: 0 };
  tyrantT = 0;
  orbitT = 0;
  private orbitAcc = 0;
  lifesteal = 0;
  damageTaken = 0;
  private stepAcc = 0;

  constructor(private b: Battle, hero: HeroDef, x: number, z: number) {
    this.hero = hero;
    const st = GameState.computeStats(hero);
    this.stats = st;
    this.element = st.element as Element;
    this.maxHp = this.hp = Math.round(st.hp);
    const glow = this.element !== 'none' ? ELEMENT_INFO[this.element].color : undefined;
    this.rig = buildCharacter(hero.look, hero.weaponType, { weaponGlow: glow });
    this.anim = new AnimationController(this.rig, hero.weaponType);
    b.sm.scene.add(this.rig.root);
    this.pos.set(x, 0, z);
    this.rig.root.position.copy(this.pos);
    for (const w of [this.rig.weaponR, this.rig.weaponL]) {
      if (!w) continue;
      const t = new WeaponTrail(b.sm.scene, w);
      t.setColor(glow ?? hero.color);
      this.trails.push(t);
    }
    this.skillMax = hero.skills.map((s) => SKILLS[s]?.cd ?? 8);
  }

  // ---------- 属性 ----------
  attackPower(): number {
    let a = this.stats.atk * this.atkBuff.mul;
    if (this.tyrantT > 0) a *= 1.2;
    return a;
  }
  critRate(): number {
    return this.stats.crit + (this.tyrantT > 0 ? 0.25 : 0);
  }
  rangeMul(): number {
    return this.stats.range;
  }
  get invuln(): boolean {
    return this.invulnT > 0 || this.state === 'musou' || this.state === 'getup' || this.state === 'dead' || this.state === 'victory' || (this.state === 'dodge' && this.st < 0.32) || !!this.skill?.invuln;
  }
  get color(): number {
    return this.element !== 'none' ? ELEMENT_INFO[this.element].color : this.hero.color;
  }

  addMusou(x: number): void {
    if (this.state === 'musou') return;
    const before = this.musou;
    this.musou = Math.min(100, this.musou + x * this.stats.musou);
    if (before < 100 && this.musou >= 100) {
      Audio.play('charge', 0.6);
      this.b.hud.toast('无双能量已满！', 'good');
    }
  }
  heal(x: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + x);
  }
  buffAtk(mul: number, t: number): void {
    this.atkBuff.mul = Math.max(this.atkBuff.t > 0 ? this.atkBuff.mul : 1, mul);
    this.atkBuff.t = Math.max(this.atkBuff.t, t);
  }
  buffDef(mul: number, t: number): void {
    this.defBuff.mul = mul;
    this.defBuff.t = Math.max(this.defBuff.t, t);
  }
  buffTyrant(t: number): void {
    this.tyrantT = t;
  }

  // 沿朝向位移（带碰撞）
  dash(speed: number, dt: number, yaw = this.facing): void {
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += Math.sin(yaw) * speed * dt;
    this.pos.z += Math.cos(yaw) * speed * dt;
    this.b.env.resolve(this.pos, px, pz, 0.5);
  }

  // ---------- 受击 ----------
  takeDamage(raw: number, kind: HitKind, from: THREE.Vector3): void {
    if (!this.alive || this.invuln) return;
    const def = this.stats.def * (this.defBuff.t > 0 ? this.defBuff.mul : 1);
    const dmg = Math.max(1, Math.round(defReduce(raw * this.b.diffCfg.enemyAtk, def)));
    this.hp -= dmg;
    this.damageTaken += dmg;
    this.hurtFlash = 0.15;
    this.addMusou(2.5);
    this.b.hud.hurt();
    this.b.hud.damageNumber(this.pos, dmg, false, 0xff4040);
    this.b.fx.hitSpark(this.pos.clone().setY(1.3), 0xff4040, 6, 4);
    this.b.fx.shake.add(kind === 'light' ? 0.12 : 0.3);
    this.b.vibrate(kind === 'light' ? 20 : 50);
    Audio.play('hurt', 0.7);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    // 霸体：重攻击、蓄力、技能期间不被打断
    const armored = (this.state === 'attack' && this.move && (this.move.kind !== 'light' || this.moveMult > 1.2)) || this.state === 'charge' || (this.state === 'skill' && this.skill?.superArmor);
    if (armored && kind !== 'finisher') return;
    const big = kind === 'launch' || kind === 'quake' || kind === 'finisher' || (kind === 'heavy' && raw > this.maxHp * 0.08);
    this.endAttack();
    this.skill = null;
    this.facing = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    if (big) {
      this.state = 'down';
      this.st = 0;
      this.anim.play('knockdown', 0.5);
      this.vel.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(6);
    } else {
      this.state = 'hit';
      this.st = 0;
      this.anim.play('hit', 0.3);
      this.vel.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize().multiplyScalar(2.5);
    }
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.st = 0;
    this.endAttack();
    this.skill = null;
    this.anim.play('knockdown', 0.6);
    this.b.onPlayerDeath();
  }

  victory(): void {
    if (!this.alive) return;
    this.endAttack();
    this.skill = null;
    this.state = 'victory';
    this.anim.play('victory', 0.8);
  }

  // ---------- 主更新 ----------
  update(dt: number, inp: InputState, camYaw: number): void {
    this.st += dt;
    // 输入方向（摄像机相对）
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    this.inputDir.set(fx * inp.moveY - fz * inp.moveX, 0, fz * inp.moveY + fx * inp.moveX);
    if (this.inputDir.lengthSq() > 1) this.inputDir.normalize();
    // 计时器
    for (let i = 0; i < 2; i++) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
    if (this.atkBuff.t > 0 && (this.atkBuff.t -= dt) <= 0) this.atkBuff.mul = 1;
    if (this.defBuff.t > 0 && (this.defBuff.t -= dt) <= 0) this.defBuff.mul = 1;
    this.tyrantT = Math.max(0, this.tyrantT - dt);
    this.lifesteal = this.tyrantT > 0 ? 0.06 : 0;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.dodgeCharges < this.dodgeMax) {
      this.dodgeRegen += dt;
      if (this.dodgeRegen >= 1.1) {
        this.dodgeRegen = 0;
        this.dodgeCharges++;
      }
    }
    if (this.orbitT > 0) this.updateOrbit(dt);
    if (inp.held.heavy) this.heavyHeld += dt;

    const prevX = this.pos.x, prevZ = this.pos.z;
    if (this.alive && this.state !== 'victory') this.handleInput(inp);

    switch (this.state) {
      case 'move':
        this.updateMove(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'charge':
        this.updateCharge(dt, inp);
        break;
      case 'skill':
      case 'musou':
        if (this.skill) {
          if (this.skill.moveMul > 0 && this.inputDir.lengthSq() > 0.01) {
            const sp = this.stats.spd * this.skill.moveMul;
            this.pos.addScaledVector(this.inputDir, sp * dt);
            this.facing = lerpAngle(this.facing, Math.atan2(this.inputDir.x, this.inputDir.z), Math.min(1, dt * 6));
          }
          if (this.skill.update(dt)) {
            this.skill = null;
            this.state = 'move';
            this.st = 0;
          }
        } else this.state = 'move';
        this.trailEmit(this.state === 'skill' || this.state === 'musou');
        break;
      case 'dodge': {
        const k = this.st / 0.4;
        const sp = 13 * (1 - k * 0.6);
        this.pos.addScaledVector(this.dodgeDir, sp * dt);
        if (this.st > 0.15 && this.st - dt <= 0.15) this.b.fx.ghost(this.rig, this.color, 0.3);
        if (this.st >= 0.4) {
          this.state = 'move';
          this.st = 0;
        }
        break;
      }
      case 'hit':
        this.pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
        if (this.st >= 0.32) this.state = 'move';
        break;
      case 'down':
        this.pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
        if (this.st >= 0.9) {
          this.state = 'getup';
          this.st = 0;
          this.anim.play('getup', 0.5);
        }
        break;
      case 'getup':
        if (this.st >= 0.5) {
          this.state = 'move';
          this.st = 0;
          this.invulnT = 0.6;
        }
        break;
      case 'dead':
      case 'victory':
        break;
    }
    this.b.env.resolve(this.pos, prevX, prevZ, 0.5);
    // 应用到模型
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    const spd = this.state === 'move' ? Math.hypot(this.vel.x, this.vel.z) : 0;
    this.anim.speed01 = Math.min(1, spd / 7);
    this.anim.update(dt);
    const f = this.hurtFlash > 0 ? 0.8 : this.state === 'charge' ? 0.15 + Math.sin(this.st * 30) * 0.1 : this.state === 'musou' ? 0.25 : 0;
    this.rig.flash(f, this.hurtFlash > 0 ? 0xff3030 : this.color);
    for (const t of this.trails) t.update(dt, this.trailOn);
    // 霸气光环
    if (this.atkBuff.t > 0) this.b.fx.aura(this.pos, 0xff4030, 0.6, 2.2);
    if (this.tyrantT > 0) this.b.fx.aura(this.pos, 0x8030ff, 0.6, 2.2);
    if (this.musou >= 100 && Math.random() < 0.4) this.b.fx.aura(this.pos, this.hp < this.maxHp * 0.25 ? 0xff2020 : 0xffd040, 0.5, 2.2);
  }

  private trailOn = false;
  private trailEmit(on: boolean): void {
    this.trailOn = on;
  }

  private canAct(): boolean {
    return this.state === 'move' || (this.state === 'attack' && this.moveT / this.moveDur > 0.55);
  }

  private handleInput(inp: InputState): void {
    const pr = inp.pressed;
    // 无双
    if (pr.has('musou') && this.musou >= 100 && (this.canAct() || this.state === 'attack' || this.state === 'hit' || this.state === 'charge')) {
      this.startMusou();
      return;
    }
    // 闪避（可取消攻击后摇）
    if (pr.has('dodge') && this.dodgeCharges > 0 && (this.canAct() || (this.state === 'attack' && this.hitIdx > 0) || this.state === 'charge')) {
      this.startDodge();
      return;
    }
    // 技能
    for (let i = 0; i < 2; i++) {
      const key = i === 0 ? 'skill1' : 'skill2';
      if (pr.has(key) && this.skillCd[i] <= 0 && (this.canAct() || this.state === 'attack' || this.state === 'charge')) {
        this.startSkill(i);
        return;
      }
    }
    if (pr.has('lock')) this.b.toggleLock();
    // 重攻击：按下开始计时，短按 = 重击，长按 = 蓄力
    if (pr.has('heavy')) this.heavyHeld = 0;
    if (inp.held.heavy && this.heavyHeld > 0.28 && this.canAct()) {
      this.endAttack();
      this.state = 'charge';
      this.st = 0;
      this.chargeLv = 0;
      this.anim.play('windup', 0.3);
      Audio.play('charge', 0.5);
      return;
    }
    if (inp.released.has('heavy') && this.heavyHeld <= 0.28 && this.state !== 'charge') {
      if (this.canAct()) this.startMove(this.hero.heavy, 1);
      else if (this.state === 'attack') this.queuedHeavy = true;
    }
    // 普通攻击（按住可连续出招）
    if (pr.has('attack') || inp.held.attack) {
      // 闪避后段可直接衔接普通攻击
      if (this.state === 'move' || (this.state === 'dodge' && this.st > 0.26)) {
        if (this.comboWindow <= 0) this.comboIdx = 0;
        this.startMove(this.hero.combo[this.comboIdx], 1);
      } else if (this.state === 'attack' && this.moveT / this.moveDur > 0.3) this.queued = true;
    }
  }

  private autoFace(): void {
    const lock = this.b.lockTarget;
    if (lock && lock.alive) {
      this.facing = Math.atan2(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z);
      return;
    }
    if (this.inputDir.lengthSq() > 0.05) {
      this.facing = Math.atan2(this.inputDir.x, this.inputDir.z);
      return;
    }
    // 自动瞄准最近敌人
    const t = this.b.nearestEnemy(this.pos, 6);
    if (t) this.facing = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
  }

  startMove(m: MoveDef, mult: number): void {
    this.endAttack();
    this.autoFace();
    this.state = 'attack';
    this.st = 0;
    this.move = m;
    this.moveMult = mult;
    this.moveT = 0;
    this.moveDur = m.dur / this.stats.aspd;
    this.hitIdx = 0;
    this.queued = false;
    this.queuedHeavy = false;
    if (m.swing === 'flurry') this.anim.playFlurry(this.moveDur, Math.max(3, m.hits.length));
    else this.anim.play(m.swing, this.moveDur);
    Audio.play(m.kind === 'light' ? (m.swing === 'thrust' || m.swing === 'flurry' ? 'thrust' : 'swing') : 'swingHeavy', 0.7);
  }

  private endAttack(): void {
    if (this.grabbed) {
      this.grabbed.grabbed = false;
      this.grabbed = null;
    }
    this.move = null;
    this.trailOn = false;
  }

  private updateMove(dt: number): void {
    this.comboWindow -= dt;
    const target = this.inputDir;
    const spd = this.stats.spd * (this.atkBuff.t > 0 ? 1.05 : 1);
    this.vel.x += (target.x * spd - this.vel.x) * Math.min(1, dt * 12);
    this.vel.z += (target.z * spd - this.vel.z) * Math.min(1, dt * 12);
    this.pos.addScaledVector(this.vel, dt);
    if (target.lengthSq() > 0.01) {
      const lock = this.b.lockTarget;
      const yaw = lock && lock.alive && lock.pos.distanceTo(this.pos) < 12 ? Math.atan2(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z) : Math.atan2(target.x, target.z);
      this.facing = lerpAngle(this.facing, yaw, Math.min(1, dt * 14));
      this.stepAcc += dt * Math.hypot(this.vel.x, this.vel.z);
      if (this.stepAcc > 2.2) {
        this.stepAcc = 0;
        this.b.fx.dust(this.pos, 0.3, 2);
      }
    }
    this.trailOn = false;
  }

  private updateAttack(dt: number): void {
    const m = this.move;
    if (!m) {
      this.state = 'move';
      return;
    }
    this.moveT += dt;
    const k = this.moveT / this.moveDur;
    // 前冲
    if (m.lunge && k < 0.6) this.dash((m.lunge / (this.moveDur * 0.6)), dt);
    this.vel.multiplyScalar(0.8);
    // 张飞抓取：抓起前方敌人举过头顶后摔下
    if (m.swing === 'grab') this.updateGrab(k);
    while (this.hitIdx < m.hits.length && k >= m.hits[this.hitIdx]) {
      this.doHit(m, this.hitIdx === m.hits.length - 1);
      this.hitIdx++;
    }
    this.trailOn = k > 0.15 && k < 0.85;
    const last = m.hits[m.hits.length - 1] ?? 0.5;
    // 连段衔接
    if (this.queuedHeavy && k > last + 0.05) {
      this.queuedHeavy = false;
      this.startMove(this.hero.heavy, 1);
      return;
    }
    if (this.queued && k > Math.max(last + 0.05, 0.62)) {
      const isCombo = this.hero.combo.includes(m);
      this.comboIdx = isCombo ? (this.comboIdx + 1) % this.hero.combo.length : 0;
      this.startMove(this.hero.combo[this.comboIdx], 1);
      return;
    }
    if (k >= 1) {
      const isCombo = this.hero.combo.includes(m);
      if (isCombo) this.comboIdx = (this.comboIdx + 1) % this.hero.combo.length;
      else this.comboIdx = 0;
      this.comboWindow = 0.5;
      this.endAttack();
      this.state = 'move';
      this.st = 0;
    }
  }

  private updateGrab(k: number): void {
    if (!this.grabbed && k > 0.22 && k < 0.4) {
      const t = this.b.pool.nearest(this.pos.x + Math.sin(this.facing) * 1.5, this.pos.z + Math.cos(this.facing) * 1.5, 2.2, 1);
      if (t && t.type.superArmor < 0.75) {
        this.grabbed = t;
        t.grabbed = true;
        t.state = SState.Knockdown; // 被抓取时冻结 AI
        t.st = 0;
      }
    }
    const g = this.grabbed;
    if (g) {
      if (!g.active) {
        this.grabbed = null;
        return;
      }
      const lift = Math.min(1, Math.max(0, (k - 0.3) / 0.25));
      const down = Math.max(0, (k - 0.6) / 0.15);
      g.pos.set(this.pos.x + Math.sin(this.facing) * (0.8 + down * 0.8), 0, this.pos.z + Math.cos(this.facing) * (0.8 + down * 0.8));
      g.y = lift * 2.4 * (1 - Math.min(1, down));
      g.fall = -lift * 1.5;
      g.vel.set(0, 0, 0);
      g.state = SState.Knockdown;
      g.st = 0;
    }
  }

  private doHit(m: MoveDef, last: boolean): void {
    const b = this.b;
    const color = this.color;
    const mult = m.dmg * this.moveMult;
    const range = m.range * this.rangeMul() * (this.moveMult > 1 ? 1 + (this.moveMult - 1) * 0.3 : 1);
    if (m.projectile) {
      b.projectiles.ring(this.pos, this.facing, this.attackPower() * mult, m.range, this.pos, m.kind);
      Audio.play('swing', 0.6);
      return;
    }
    if (this.grabbed) {
      const g = this.grabbed;
      g.grabbed = false;
      g.y = 0;
      this.grabbed = null;
      b.combat.applyHitToSoldier(g, this.attackPower() * mult * 1.6, 'launch', Math.sin(this.facing), Math.cos(this.facing), color);
    }
    b.combat.playerArea({ x: this.pos.x, z: this.pos.z, yaw: this.facing, range, arc: m.arc }, mult, m.kind, color);
    const front = this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing) * range * 0.55, 0, Math.cos(this.facing) * range * 0.55));
    switch (m.fx) {
      case 'arc':
        b.fx.slash(this.pos, this.facing, range * 0.95, m.arc, color, { tilt: SWING_TILT[m.swing] ?? 0 });
        break;
      case 'thrust':
        b.fx.slash(this.pos, this.facing, range, 40, color, { tilt: 0, life: 0.15 });
        for (let i = 0; i < 6; i++) {
          const d = 0.8 + (i / 6) * range;
          b.fx.particles.spawn({ x: this.pos.x + Math.sin(this.facing) * d, y: 1.25, z: this.pos.z + Math.cos(this.facing) * d, vx: Math.sin(this.facing) * 8, vz: Math.cos(this.facing) * 8, life: 0.15, size: 0.12, color });
        }
        break;
      case 'ring':
        b.fx.slash(this.pos, this.facing, range, 360, color, { life: 0.25 });
        b.fx.ring(this.pos, 0.5, range, color, 0.3, 0.6);
        break;
      case 'quake':
        b.fx.shockwave(m.arc >= 359 ? this.pos : front, Math.min(range, 6), color);
        b.fx.groundCrack(m.arc >= 359 ? this.pos : front, range * 0.5);
        Audio.play('quake', 0.6);
        break;
    }
    if (m.wave && last) b.projectiles.wave(this.pos, this.facing, { dmg: this.attackPower() * mult * 0.7, kind: 'heavy', color, range: 12 + this.moveMult * 4, width: 1.6, size: 0.3 + (this.moveMult - 1) * 0.2 });
  }

  private updateCharge(dt: number, inp: InputState): void {
    this.chargeLv = Math.min(1, this.st / 1.0);
    this.b.fx.aura(this.pos, this.color, 0.8, 2.4);
    if (this.chargeLv >= 1 && this.st - dt < 1.0) {
      Audio.play('charge', 0.8);
      this.b.fx.ring(this.pos, 0.3, 2.5, this.color, 0.35, 0.5);
    }
    if (this.inputDir.lengthSq() > 0.05) this.facing = lerpAngle(this.facing, Math.atan2(this.inputDir.x, this.inputDir.z), Math.min(1, dt * 6));
    if (!inp.held.heavy) {
      const lv = this.chargeLv;
      this.state = 'move';
      this.startMove(this.hero.charge, 1 + lv * 0.9);
      if (lv >= 1) this.b.fx.flash('#ffffff', 0.2);
    }
  }

  private startDodge(): void {
    this.endAttack();
    this.skill = null;
    this.dodgeCharges--;
    this.dodgeRegen = 0;
    const d = this.inputDir.lengthSq() > 0.05 ? this.inputDir.clone().normalize() : new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    this.dodgeDir.copy(d);
    if (this.inputDir.lengthSq() > 0.05) this.facing = Math.atan2(d.x, d.z);
    this.state = 'dodge';
    this.st = 0;
    this.anim.play('dodge', 0.4);
    this.b.fx.ghost(this.rig, this.color, 0.3);
    this.b.fx.dust(this.pos, 0.5, 4);
    Audio.play('dodge');
    this.comboIdx = 0;
  }

  private startSkill(i: number): void {
    this.endAttack();
    this.autoFace();
    const id = this.hero.skills[i];
    this.skill = this.b.skills.create(id);
    this.skillCd[i] = this.skillMax[i];
    this.state = 'skill';
    this.st = 0;
    this.b.hud.skillName(SKILLS[id]?.name ?? '', this.color);
  }

  private startMusou(): void {
    this.endAttack();
    this.autoFace();
    const trueMusou = this.hp < this.maxHp * 0.25;
    this.musou = 0;
    this.skill = this.b.skills.create(this.hero.musou, trueMusou);
    this.state = 'musou';
    this.st = 0;
    this.b.stats.musouUsed++;
    if (trueMusou) this.b.hud.toast('真·无双乱舞！', 'warn');
  }

  private updateOrbit(dt: number): void {
    this.orbitT -= dt;
    this.orbitAcc += dt;
    const b = this.b;
    const c = 0xff90c0;
    const t = this.orbitT;
    for (let i = 0; i < 6; i++) {
      const a = t * 9 + (i / 6) * Math.PI * 2;
      b.fx.particles.spawn({ x: this.pos.x + Math.cos(a) * 2.4, y: 1.1, z: this.pos.z + Math.sin(a) * 2.4, life: 0.08, size: 0.32, color: i % 2 ? c : 0xffe080, spin: 0 });
    }
    if (this.orbitAcc >= 0.22) {
      this.orbitAcc = 0;
      b.combat.playerArea({ x: this.pos.x, z: this.pos.z, yaw: 0, range: 3.0, arc: 360, ignoreWalls: true }, 0.38, 'light', c, { sfx: false, shake: 0 });
    }
  }

  dispose(): void {
    this.rig.root.removeFromParent();
    this.rig.dispose();
    for (const t of this.trails) t.dispose();
  }
}
