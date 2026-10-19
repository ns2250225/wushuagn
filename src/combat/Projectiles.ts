import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { HitKind } from '../data/types';
import type { Emitter } from '../effects/EffectManager';
import type { Soldier } from '../enemies/EnemyPool';

// 投射物：箭矢、剑气、环刃、火箭雨、Boss 能量波

export type ProjKind = 'arrow' | 'wave' | 'ring' | 'fireArrow' | 'orb';

export interface Projectile {
  kind: ProjKind;
  team: 0 | 1;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  radius: number;
  dmg: number;
  hitKind: HitKind;
  pierce: boolean;
  hits: Set<unknown>;
  color: number;
  emitter: Emitter | null;
  mesh: THREE.Object3D | null;
  gravity: number;
  fromPlayer: boolean;
  returnT: number;
  owner: THREE.Vector3 | null;
  explode: number;
  height: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();

export class ProjectileSystem {
  list: Projectile[] = [];
  private arrowMesh: THREE.InstancedMesh;
  private ringPool: THREE.Group[] = [];
  private headPool: THREE.Mesh[] = [];
  private buf: Soldier[] = [];

  constructor(private b: Battle, scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.9);
    this.arrowMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xd8c8a0 }), 160);
    this.arrowMesh.count = 0;
    this.arrowMesh.frustumCulled = false;
    scene.add(this.arrowMesh);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe080 });
    const box = new THREE.BoxGeometry(0.22, 0.05, 0.06);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const m = new THREE.Mesh(box, ringMat);
        m.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
        m.rotation.y = -a + Math.PI / 2;
        g.add(m);
      }
      g.visible = false;
      scene.add(g);
      this.ringPool.push(g);
    }
    const headGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.headPool.push(m);
    }
  }

  private base(kind: ProjKind, team: 0 | 1, pos: THREE.Vector3, vel: THREE.Vector3, dmg: number): Projectile {
    const p: Projectile = {
      kind, team, pos: pos.clone(), vel: vel.clone(), life: 2, radius: 0.5, dmg, hitKind: 'light', pierce: false,
      hits: new Set(), color: 0xffffff, emitter: null, mesh: null, gravity: 0, fromPlayer: false, returnT: 0, owner: null, explode: 0, height: 1.8,
    };
    this.list.push(p);
    return p;
  }

  arrow(s: Soldier, target: THREE.Vector3): void {
    const from = s.pos.clone().setY(1.5);
    const to = target.clone().setY(1.1);
    // 预判 + 散布
    to.x += (Math.random() - 0.5) * 1.2;
    to.z += (Math.random() - 0.5) * 1.2;
    const d = from.distanceTo(to);
    const speed = 22;
    const t = d / speed;
    const vel = to.sub(from).divideScalar(t);
    vel.y += 0.5 * 9 * t;
    const p = this.base('arrow', s.team, from, vel, s.atk);
    p.gravity = 9;
    p.life = t + 0.6;
    p.radius = 0.5;
    Audio.play('arrow', 0.5);
  }

  // 玩家剑气 / 刀气
  wave(origin: THREE.Vector3, yaw: number, opts: { speed?: number; dmg: number; kind?: HitKind; color: number; range?: number; width?: number; dragon?: boolean; team?: 0 | 1; size?: number }): Projectile {
    const speed = opts.speed ?? 20;
    const vel = new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    const p = this.base('wave', opts.team ?? 0, origin.clone().setY(1.1), vel, opts.dmg);
    p.life = (opts.range ?? 14) / speed;
    p.radius = opts.width ?? 1.6;
    p.pierce = true;
    p.hitKind = opts.kind ?? 'heavy';
    p.color = opts.color;
    p.fromPlayer = (opts.team ?? 0) === 0;
    p.emitter = this.b.fx.emitter({ pos: p.pos, vel, life: p.life, rate: opts.dragon ? 140 : 90, color: opts.color, color2: 0xffffff, size: opts.size ?? (opts.dragon ? 0.45 : 0.3), spread: p.radius * 0.9, kind: opts.dragon ? 'dragon' : 'glow', wave: opts.dragon ? 1.2 : 0 });
    const head = this.headPool.find((h) => !h.visible);
    if (head) {
      head.visible = true;
      (head.material as THREE.MeshBasicMaterial).color.set(opts.color);
      const sz = opts.size ?? 0.3;
      head.scale.set(p.radius * 1.6, sz * 2.4, sz * 2);
      head.rotation.set(0, yaw, 0);
      p.mesh = head;
    }
    return p;
  }

  // 环刃投掷（回旋）
  ring(origin: THREE.Vector3, yaw: number, dmg: number, range: number, owner: THREE.Vector3, kind: HitKind = 'light'): void {
    const speed = 18;
    const vel = new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    const p = this.base('ring', 0, origin.clone().setY(1.2), vel, dmg);
    p.life = 3;
    p.returnT = range / speed;
    p.radius = 1.1;
    p.pierce = true;
    p.hitKind = kind;
    p.color = 0xffe080;
    p.fromPlayer = true;
    p.owner = owner;
    const g = this.ringPool.find((r) => !r.visible);
    if (g) {
      g.visible = true;
      g.scale.setScalar(1.4);
      p.mesh = g;
    }
  }

  // 从天而降的火箭
  fireArrow(target: THREE.Vector3, dmg: number, delay = 0): void {
    const from = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 14 + delay * 20, -4));
    const vel = target.clone().sub(from).normalize().multiplyScalar(26);
    const p = this.base('fireArrow', 0, from, vel, dmg);
    p.life = 3;
    p.radius = 0;
    p.explode = 2.2;
    p.fromPlayer = true;
    p.hitKind = 'heavy';
    p.color = 0xff7020;
    p.emitter = this.b.fx.emitter({ pos: p.pos, vel, life: 3, rate: 40, color: 0xff7020, color2: 0xffd040, size: 0.25, spread: 0.2, kind: 'glow' });
  }

  // Boss 能量弹
  orb(origin: THREE.Vector3, yaw: number, dmg: number, color: number, speed = 14, range = 22): void {
    const vel = new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    const p = this.base('orb', 1, origin.clone().setY(1.1), vel, dmg);
    p.life = range / speed;
    p.radius = 1.1;
    p.hitKind = 'heavy';
    p.color = color;
    p.emitter = this.b.fx.emitter({ pos: p.pos, vel, life: p.life, rate: 80, color, color2: 0xffffff, size: 0.35, spread: 0.9, kind: 'glow' });
  }

  update(dt: number): void {
    const b = this.b;
    let nArrow = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      if (p.kind === 'ring' && p.owner) {
        p.returnT -= dt;
        if (p.returnT <= 0) {
          // 回旋返回
          _d.copy(p.owner).setY(1.2).sub(p.pos);
          const dist = _d.length();
          if (dist < 1 || p.life <= 0) {
            this.kill(i);
            continue;
          }
          p.vel.lerp(_d.normalize().multiplyScalar(22), Math.min(1, dt * 8));
          if (p.returnT < -0.05 && p.returnT + dt >= -0.05) p.hits.clear();
        }
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.emitter) p.emitter.pos.copy(p.pos);
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.kind === 'ring') p.mesh.rotation.y += dt * 25;
      }
      if (p.life <= 0) {
        this.kill(i);
        continue;
      }
      // 地面 / 墙体
      if (p.pos.y <= 0.05 || (p.kind !== 'wave' && p.kind !== 'ring' && b.env.segmentBlocked(p.pos.x - p.vel.x * dt, p.pos.z - p.vel.z * dt, p.pos.x, p.pos.z, 2.5) && p.pos.y < 3)) {
        if (p.explode > 0) this.explodeAt(p);
        this.kill(i);
        continue;
      }
      if (p.kind === 'fireArrow') continue;
      let consumed = false;
      if (p.team === 1) {
        const pl = b.player;
        if (pl.alive && !p.hits.has(pl) && Math.abs(p.pos.x - pl.pos.x) < p.radius + 0.4 && Math.abs(p.pos.z - pl.pos.z) < p.radius + 0.4 && p.pos.y < 2.4) {
          p.hits.add(pl);
          pl.takeDamage(p.dmg, p.hitKind, p.pos.clone().sub(p.vel));
          if (!p.pierce) consumed = true;
        }
        if (!consumed) {
          for (const n of b.npcs) {
            if (!n.alive || p.hits.has(n)) continue;
            if (n.pos.distanceTo(_s.set(p.pos.x, 0, p.pos.z)) < p.radius + 0.5) {
              p.hits.add(n);
              n.takeDamage(p.dmg * 0.6);
              if (!p.pierce) consumed = true;
              break;
            }
          }
        }
        if (!consumed && p.kind === 'arrow') {
          const a = b.pool.query(p.pos.x, p.pos.z, 0.6, 0, this.buf);
          if (a.length && p.pos.y < 2) {
            b.damage.damageSoldier(a[0], p.dmg * 0.5, 'light', p.vel.x, p.vel.z, {});
            consumed = true;
          }
        }
      } else {
        // 玩家方投射物
        const hitList = b.pool.query(p.pos.x, p.pos.z, p.radius + 0.5, 1, this.buf);
        for (const s of hitList) {
          if (p.hits.has(s)) continue;
          p.hits.add(s);
          if (p.fromPlayer) b.combat.applyHitToSoldier(s, p.dmg, p.hitKind, p.vel.x, p.vel.z, p.color);
          else b.damage.damageSoldier(s, p.dmg, p.hitKind, p.vel.x, p.vel.z, {});
          if (!p.pierce) {
            consumed = true;
            break;
          }
        }
        if (!consumed) {
          for (const bo of b.bosses) {
            if (!bo.alive || p.hits.has(bo)) continue;
            if (Math.hypot(bo.pos.x - p.pos.x, bo.pos.z - p.pos.z) < p.radius + 0.8) {
              p.hits.add(bo);
              if (p.fromPlayer) b.combat.applyHitToBoss(bo, p.dmg, p.hitKind, p.color);
              else bo.takeDamage(p.dmg, p.hitKind, p.pos, false);
              if (!p.pierce) consumed = true;
            }
          }
          if (p.fromPlayer)
            for (const d of b.env.destructibles) {
              if (!d.alive || p.hits.has(d)) continue;
              if (Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) < p.radius + d.radius) {
                p.hits.add(d);
                b.combat.hitDestructible(d, p.dmg);
              }
            }
        }
      }
      if (consumed) this.kill(i);
    }
    // 箭矢实例矩阵
    for (const p of this.list) {
      if (p.kind !== 'arrow') continue;
      if (nArrow >= 160) break;
      _q.setFromUnitVectors(_up, _d.copy(p.vel).normalize());
      _s.set(1, 1, 1);
      _m.compose(p.pos, _q, _s);
      this.arrowMesh.setMatrixAt(nArrow++, _m);
    }
    this.arrowMesh.count = nArrow;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
  }

  private explodeAt(p: Projectile): void {
    const b = this.b;
    const pos = p.pos.clone().setY(0);
    b.fx.explosion(pos, p.explode, 0xff6020, 0xffd040);
    Audio.play('explosion', 0.4);
    for (const s of b.pool.query(pos.x, pos.z, p.explode, 1, this.buf)) {
      b.combat.applyHitToSoldier(s, p.dmg, 'launch', s.pos.x - pos.x, s.pos.z - pos.z, 0xff7020);
      if (Math.random() < 0.4) s.burn = 2, (s.burnDmg = p.dmg * 0.1);
    }
    for (const bo of b.bosses) if (bo.alive && bo.pos.distanceTo(pos) < p.explode + 0.8) b.combat.applyHitToBoss(bo, p.dmg, 'heavy', 0xff7020);
  }

  private kill(i: number): void {
    const p = this.list[i];
    if (p.emitter) p.emitter.alive = false;
    if (p.mesh) p.mesh.visible = false;
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
  }

  clear(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.kill(i);
    this.arrowMesh.count = 0;
  }
}
