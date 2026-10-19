import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';
import { magicCircleTexture } from '../scene/textures';
import type { CharacterRig } from '../characters/CharacterFactory';
import { ParticlePool } from './ParticlePool';
import { ScreenShake } from './ScreenShake';
import { arcGeometry } from './SlashEffect';

// 特效管理器：方块剑气、冲击波、能量柱、法阵、攻击预警、发射器、残影与爆炸等，全部对象池复用

type FxUpdate = (o: FxObj, k: number, dt: number) => void;

interface FxObj {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  active: boolean;
  data: Record<string, number>;
  upd: FxUpdate | null;
  follow?: THREE.Vector3 | null;
}

class MeshPool {
  items: FxObj[] = [];
  constructor(
    private scene: THREE.Scene,
    private size: number,
    private make: () => { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial },
  ) {
    for (let i = 0; i < size; i++) this.items.push(this.create());
  }
  private create(): FxObj {
    const { geo, mat } = this.make();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    return { mesh, mat, life: 0, max: 1, active: false, data: {}, upd: null };
  }
  get(): FxObj {
    let best: FxObj | null = null;
    for (const it of this.items) {
      if (!it.active) {
        best = it;
        break;
      }
      if (!best || it.life < best.life) best = it;
    }
    const o = best!;
    o.active = true;
    o.mesh.visible = true;
    o.mesh.rotation.set(0, 0, 0);
    o.mesh.scale.set(1, 1, 1);
    o.mesh.position.set(0, 0, 0);
    o.follow = null;
    o.data = {};
    return o;
  }
  update(dt: number): void {
    for (const o of this.items) {
      if (!o.active) continue;
      o.life -= dt;
      if (o.life <= 0) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      if (o.follow) o.mesh.position.x = o.follow.x, o.mesh.position.z = o.follow.z;
      o.upd?.(o, 1 - o.life / o.max, dt);
    }
  }
  clear(): void {
    for (const o of this.items) {
      o.active = false;
      o.mesh.visible = false;
    }
  }
}

export interface Emitter {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  rate: number;
  acc: number;
  color: number;
  color2: number;
  size: number;
  spread: number;
  kind: 'glow' | 'fire' | 'dragon' | 'smoke' | 'spark';
  alive: boolean;
  wave: number;
  t: number;
}

export interface TelegraphHandle {
  done: boolean;
  remove(): void;
}

const _v = new THREE.Vector3();
const additive = (color = 0xffffff, opacity = 1, map?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: map ?? null, vertexColors: false });

export class EffectManager {
  particles: ParticlePool;
  shake = new ScreenShake();
  private slashes: MeshPool;
  private rings: MeshPool;
  private pillars: MeshPool;
  private circles: MeshPool;
  private teleCircle: MeshPool;
  private teleRect: MeshPool;
  private teleFill: MeshPool;
  private emitters: Emitter[] = [];
  private ghostMesh: THREE.InstancedMesh;
  private ghostLife: Float32Array;
  private ghostColor: Float32Array;
  private ghostCount = 0;
  private ghostMatrices: THREE.Matrix4[] = [];
  private lights: { l: THREE.PointLight; t: number; max: number; i: number }[] = [];
  onFlash: ((color: string, strength: number) => void) | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.particles = new ParticlePool(scene, 2400);
    this.slashes = new MeshPool(scene, 24, () => {
      const m = additive();
      m.vertexColors = true;
      return { geo: arcGeometry(180), mat: m };
    });
    const ringGeo = new THREE.RingGeometry(0.82, 1, 8, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new MeshPool(scene, 20, () => ({ geo: ringGeo, mat: additive() }));
    const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    this.pillars = new MeshPool(scene, 16, () => ({ geo: pillarGeo, mat: additive() }));
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    planeGeo.rotateX(-Math.PI / 2);
    this.circles = new MeshPool(scene, 6, () => ({ geo: planeGeo, mat: additive(0xffffff, 1, magicCircleTexture()) }));
    const circleGeo = new THREE.RingGeometry(0.94, 1, 24, 1);
    circleGeo.rotateX(-Math.PI / 2);
    this.teleCircle = new MeshPool(scene, 10, () => {
      const m = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      return { geo: circleGeo, mat: m };
    });
    const rectGeo = new THREE.PlaneGeometry(1, 1);
    rectGeo.rotateX(-Math.PI / 2);
    rectGeo.translate(0, 0, 0.5);
    this.teleRect = new MeshPool(scene, 8, () => {
      const m = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
      return { geo: rectGeo, mat: m };
    });
    const discGeo = new THREE.CircleGeometry(1, 24);
    discGeo.rotateX(-Math.PI / 2);
    this.teleFill = new MeshPool(scene, 10, () => {
      const m = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
      return { geo: discGeo, mat: m };
    });
    // 残影
    const GC = 700;
    this.ghostMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), additive(0xffffff, 0.6), GC);
    this.ghostMesh.frustumCulled = false;
    this.ghostMesh.count = 0;
    this.ghostMesh.setColorAt(0, new THREE.Color());
    this.ghostLife = new Float32Array(GC);
    this.ghostColor = new Float32Array(GC * 3);
    for (let i = 0; i < GC; i++) this.ghostMatrices.push(new THREE.Matrix4());
    scene.add(this.ghostMesh);
    // 固定数量的点光源，避免动态增删灯光导致着色器重编译
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      scene.add(l);
      this.lights.push({ l, t: 0, max: 1, i: 0 });
    }
  }

  // 距离相机越远，粒子越少
  density(p: THREE.Vector3): number {
    const d = this.camera.position.distanceTo(p);
    const f = d > 40 ? 0.35 : d > 25 ? 0.65 : 1;
    return Perf.profile.particleMul * f;
  }

  private n(base: number, p: THREE.Vector3): number {
    const v = base * this.density(p);
    return Math.max(1, Math.floor(v + Math.random()));
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.slashes.update(dt);
    this.rings.update(dt);
    this.pillars.update(dt);
    this.circles.update(dt);
    this.teleCircle.update(dt);
    this.teleRect.update(dt);
    this.teleFill.update(dt);
    this.shake.update(dt);
    this.updateEmitters(dt);
    this.updateGhosts(dt);
    for (const L of this.lights) {
      if (L.t <= 0) continue;
      L.t -= dt;
      L.l.intensity = Math.max(0, L.t / L.max) * L.i;
    }
  }

  clear(): void {
    this.particles.clear();
    this.slashes.clear();
    this.rings.clear();
    this.pillars.clear();
    this.circles.clear();
    this.teleCircle.clear();
    this.teleRect.clear();
    this.teleFill.clear();
    this.emitters.length = 0;
    this.ghostCount = 0;
    this.ghostMesh.count = 0;
    this.shake.reset();
    for (const L of this.lights) {
      L.t = 0;
      L.l.intensity = 0;
    }
  }

  flash(color: string, strength: number): void {
    this.onFlash?.(color, strength);
  }

  light(pos: THREE.Vector3, color: number, intensity: number, dur: number): void {
    if (!Perf.profile.shadows && Perf.profile.name === 'low') return;
    let L = this.lights[0];
    for (const x of this.lights) if (x.t < L.t) L = x;
    L.l.position.set(pos.x, pos.y + 1.5, pos.z);
    L.l.color.set(color);
    L.i = intensity * 30;
    L.l.intensity = L.i;
    L.t = L.max = dur;
  }

  // ---------- 网格类特效 ----------
  slash(pos: THREE.Vector3, yaw: number, radius: number, arcDeg: number, color: number, opts: { tilt?: number; y?: number; life?: number; spin?: number } = {}): void {
    const o = this.slashes.get();
    o.mesh.geometry = arcGeometry(Math.min(360, Math.max(60, arcDeg)));
    o.mesh.position.set(pos.x, (opts.y ?? 1.1) + pos.y, pos.z);
    o.mesh.rotation.order = 'YXZ';
    o.mesh.rotation.set(0, yaw, opts.tilt ?? 0);
    o.mat.color.set(color);
    o.mat.opacity = 1;
    o.life = o.max = opts.life ?? 0.22;
    o.data.r = radius;
    o.data.spin = opts.spin ?? 0;
    o.upd = (ob, k, dt) => {
      const s = ob.data.r * (0.85 + k * 0.3);
      ob.mesh.scale.set(s, s, s);
      ob.mesh.rotation.y += ob.data.spin * dt;
      ob.mat.opacity = 1 - k * k;
    };
    o.upd(o, 0, 0);
    // 沿弧线散布方块碎光
    const cnt = this.n(10, pos);
    const half = (arcDeg * Math.PI) / 360;
    for (let i = 0; i < cnt; i++) {
      const a = yaw + (Math.random() * 2 - 1) * half;
      const r = radius * (0.7 + Math.random() * 0.35);
      this.particles.spawn({
        x: pos.x + Math.sin(a) * r, y: (opts.y ?? 1.1) + pos.y + (Math.random() - 0.5) * 0.4, z: pos.z + Math.cos(a) * r,
        vx: Math.sin(a) * 2, vy: Math.random() * 1.5, vz: Math.cos(a) * 2, life: 0.3 + Math.random() * 0.2, size: 0.08 + Math.random() * 0.12, color,
      });
    }
  }

  ring(pos: THREE.Vector3, r0: number, r1: number, color: number, life = 0.5, y = 0.08, vertical = false): void {
    const o = this.rings.get();
    o.mesh.position.set(pos.x, pos.y + y, pos.z);
    if (vertical) o.mesh.rotation.set(Math.PI / 2, 0, 0);
    o.mat.color.set(color);
    o.life = o.max = life;
    o.data.r0 = r0;
    o.data.r1 = r1;
    o.upd = (ob, k) => {
      const e = 1 - (1 - k) * (1 - k);
      const r = ob.data.r0 + (ob.data.r1 - ob.data.r0) * e;
      ob.mesh.scale.set(r, r * (vertical ? 1 : 1), r);
      ob.mat.opacity = 1 - k;
    };
    o.upd(o, 0, 0);
  }

  pillar(pos: THREE.Vector3, radius: number, height: number, color: number, life = 0.6): void {
    const o = this.pillars.get();
    o.mesh.position.set(pos.x, pos.y, pos.z);
    o.mat.color.set(color);
    o.life = o.max = life;
    o.data.r = radius;
    o.data.h = height;
    o.upd = (ob, k, dt) => {
      const g = Math.min(1, k * 5);
      ob.mesh.scale.set(ob.data.r * (1 - k * 0.6), ob.data.h * g, ob.data.r * (1 - k * 0.6));
      ob.mesh.rotation.y += dt * 4;
      ob.mat.opacity = 1 - k;
    };
    o.upd(o, 0, 0);
  }

  magicCircle(pos: THREE.Vector3, radius: number, color: number, life = 1.5, follow?: THREE.Vector3): void {
    const o = this.circles.get();
    o.mesh.position.set(pos.x, pos.y + 0.06, pos.z);
    o.mat.color.set(color);
    o.life = o.max = life;
    o.data.r = radius;
    o.follow = follow ?? null;
    o.upd = (ob, k, dt) => {
      const g = Math.min(1, k * 6);
      const s = ob.data.r * g;
      ob.mesh.scale.set(s, 1, s);
      ob.mesh.rotation.y += dt * 1.5;
      ob.mat.opacity = k > 0.8 ? (1 - k) * 5 : 1;
    };
    o.upd(o, 0, 0);
  }

  // 攻击范围提示：圆形（外框 + 逐渐扩大的填充）
  telegraphCircle(pos: THREE.Vector3, radius: number, dur: number, color = 0xff2020): TelegraphHandle {
    const a = this.teleCircle.get();
    const b = this.teleFill.get();
    a.mesh.position.set(pos.x, 0.07, pos.z);
    b.mesh.position.set(pos.x, 0.06, pos.z);
    a.mesh.scale.set(radius, 1, radius);
    a.mat.color.set(color);
    b.mat.color.set(color);
    a.life = a.max = b.life = b.max = dur;
    a.upd = (ob, k) => (ob.mat.opacity = 0.5 + Math.sin(k * 30) * 0.3);
    b.upd = (ob, k) => {
      const s = radius * k;
      ob.mesh.scale.set(s, 1, s);
      ob.mat.opacity = 0.18 + k * 0.2;
    };
    b.upd(b, 0, 0);
    const h: TelegraphHandle = {
      done: false,
      remove: () => {
        a.life = 0.001;
        b.life = 0.001;
        h.done = true;
      },
    };
    return h;
  }

  // 直线 / 扇形攻击提示
  telegraphLine(pos: THREE.Vector3, yaw: number, length: number, width: number, dur: number, color = 0xff2020): TelegraphHandle {
    const a = this.teleRect.get();
    const b = this.teleRect.get();
    a.mesh.position.set(pos.x, 0.06, pos.z);
    b.mesh.position.set(pos.x, 0.07, pos.z);
    a.mesh.rotation.y = b.mesh.rotation.y = yaw;
    a.mesh.scale.set(width, 1, length);
    a.mat.color.set(color);
    b.mat.color.set(color);
    a.mat.opacity = 0.2;
    a.life = a.max = b.life = b.max = dur;
    a.upd = (ob, k) => (ob.mat.opacity = 0.15 + Math.sin(k * 30) * 0.08);
    b.upd = (ob, k) => {
      ob.mesh.scale.set(width, 1, Math.max(0.01, length * k));
      ob.mat.opacity = 0.35;
    };
    b.upd(b, 0, 0);
    const h: TelegraphHandle = {
      done: false,
      remove: () => {
        a.life = 0.001;
        b.life = 0.001;
        h.done = true;
      },
    };
    return h;
  }

  // ---------- 发射器（剑气、龙形能量、火焰） ----------
  emitter(opts: Partial<Emitter> & { pos: THREE.Vector3; vel?: THREE.Vector3 }): Emitter {
    const e: Emitter = {
      pos: opts.pos.clone(),
      vel: opts.vel ? opts.vel.clone() : new THREE.Vector3(),
      life: opts.life ?? 1,
      rate: opts.rate ?? 60,
      acc: 0,
      color: opts.color ?? 0xffffff,
      color2: opts.color2 ?? opts.color ?? 0xffffff,
      size: opts.size ?? 0.3,
      spread: opts.spread ?? 0.3,
      kind: opts.kind ?? 'glow',
      alive: true,
      wave: opts.wave ?? 0,
      t: 0,
    };
    this.emitters.push(e);
    return e;
  }

  private updateEmitters(dt: number): void {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.life -= dt;
      e.t += dt;
      if (e.life <= 0 || !e.alive) {
        e.alive = false;
        this.emitters.splice(i, 1);
        continue;
      }
      e.pos.addScaledVector(e.vel, dt);
      let ox = 0;
      if (e.wave) {
        // 龙形蜿蜒
        const side = Math.sin(e.t * 9) * e.wave;
        const len = Math.hypot(e.vel.x, e.vel.z) || 1;
        ox = side;
        _v.set(-e.vel.z / len, 0, e.vel.x / len).multiplyScalar(side);
      } else _v.set(0, 0, 0);
      e.acc += e.rate * dt * Perf.profile.particleMul;
      while (e.acc >= 1) {
        e.acc -= 1;
        const s = e.spread;
        const px = e.pos.x + _v.x + (Math.random() - 0.5) * s;
        const py = e.pos.y + (Math.random() - 0.5) * s + (e.wave ? Math.cos(e.t * 9) * 0.3 : 0);
        const pz = e.pos.z + _v.z + (Math.random() - 0.5) * s;
        switch (e.kind) {
          case 'fire':
            this.particles.spawn({ x: px, y: py, z: pz, vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5), life: 0.4 + Math.random() * 0.3, size: e.size * (0.6 + Math.random() * 0.6), color: Math.random() < 0.5 ? e.color : e.color2 });
            break;
          case 'smoke':
            this.particles.spawn({ x: px, y: py, z: pz, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 1.2 + Math.random(), size: e.size * (0.8 + Math.random()), color: e.color, glow: false, shrink: true });
            break;
          case 'dragon':
            this.particles.spawn({ x: px, y: py, z: pz, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: (Math.random() - 0.5) * 1.5, life: 0.35 + Math.random() * 0.3, size: e.size * (0.6 + Math.random() * 0.8), color: Math.random() < 0.7 ? e.color : e.color2 });
            break;
          case 'spark':
            this.particles.spawn({ x: px, y: py, z: pz, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 0.25, size: e.size * 0.5, color: e.color, gravity: 10 });
            break;
          default:
            this.particles.spawn({ x: px, y: py, z: pz, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, life: 0.25 + Math.random() * 0.2, size: e.size * (0.5 + Math.random() * 0.7), color: Math.random() < 0.75 ? e.color : e.color2 });
        }
      }
      void ox;
    }
  }

  // ---------- 残影 ----------
  ghost(rig: CharacterRig, color: number, life = 0.35): void {
    if (!Perf.profile.afterimages) return;
    rig.root.updateMatrixWorld(true);
    const c = new THREE.Color(color);
    const cap = this.ghostMatrices.length;
    if (!rig.root.visible) return;
    for (const bx of rig.ghostBoxes) {
      let i: number;
      if (this.ghostCount < cap) i = this.ghostCount++;
      else i = Math.floor(Math.random() * cap);
      this.ghostMatrices[i].multiplyMatrices(bx.parent.matrixWorld, bx.local);
      this.ghostLife[i] = life;
      this.ghostColor[i * 3] = c.r;
      this.ghostColor[i * 3 + 1] = c.g;
      this.ghostColor[i * 3 + 2] = c.b;
    }
  }

  private updateGhosts(dt: number): void {
    let n = this.ghostCount;
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.ghostLife[i] -= dt;
      if (this.ghostLife[i] <= 0) {
        n--;
        this.ghostMatrices[i].copy(this.ghostMatrices[n]);
        this.ghostLife[i] = this.ghostLife[n];
        this.ghostColor[i * 3] = this.ghostColor[n * 3];
        this.ghostColor[i * 3 + 1] = this.ghostColor[n * 3 + 1];
        this.ghostColor[i * 3 + 2] = this.ghostColor[n * 3 + 2];
        i--;
        continue;
      }
    }
    this.ghostCount = n;
    for (let i = 0; i < n; i++) {
      this.ghostMesh.setMatrixAt(i, this.ghostMatrices[i]);
      const k = Math.min(1, this.ghostLife[i] / 0.35) * 0.5;
      col.setRGB(this.ghostColor[i * 3] * k, this.ghostColor[i * 3 + 1] * k, this.ghostColor[i * 3 + 2] * k);
      this.ghostMesh.setColorAt(i, col);
    }
    this.ghostMesh.count = n;
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    if (this.ghostMesh.instanceColor) this.ghostMesh.instanceColor.needsUpdate = true;
  }

  // ---------- 粒子爆发 ----------
  hitSpark(p: THREE.Vector3, color: number, count = 8, power = 5): void {
    const n = this.n(count, p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = power * (0.4 + Math.random() * 0.8);
      this.particles.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s * Math.sqrt(1 - u * u), vy: u * s + 1.5, vz: Math.sin(a) * s * Math.sqrt(1 - u * u), life: 0.18 + Math.random() * 0.2, size: 0.06 + Math.random() * 0.1, color, gravity: 6, drag: 2 });
    }
    this.particles.spawn({ x: p.x, y: p.y, z: p.z, life: 0.08, size: 0.6, color: 0xffffff, spin: 0 });
  }

  debris(p: THREE.Vector3, color: number, count = 6, power = 4): void {
    const n = this.n(count, p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.3 + Math.random() * 0.8);
      this.particles.spawn({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + Math.random() * 0.6, z: p.z + (Math.random() - 0.5) * 0.5, vx: Math.cos(a) * s, vy: 3 + Math.random() * 4, vz: Math.sin(a) * s, life: 0.8 + Math.random() * 0.8, size: 0.12 + Math.random() * 0.16, color, gravity: 18, glow: false, bounce: true });
    }
  }

  // 方块化消散
  dissolve(p: THREE.Vector3, color: number, height = 1.6): void {
    const n = this.n(10, p);
    for (let i = 0; i < n; i++) {
      this.particles.spawn({ x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + Math.random() * height, z: p.z + (Math.random() - 0.5) * 0.7, vx: (Math.random() - 0.5) * 0.8, vy: 0.8 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.8, life: 0.6 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.14, color, drag: 1 });
    }
  }

  explosion(p: THREE.Vector3, radius: number, color: number, color2 = 0xffffff): void {
    const n = this.n(24 + radius * 6, p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = radius * (1 + Math.random() * 2.5);
      this.particles.spawn({ x: p.x, y: p.y + 0.6, z: p.z, vx: Math.cos(a) * s, vy: 2 + Math.random() * radius * 2, vz: Math.sin(a) * s, life: 0.4 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.4, color: Math.random() < 0.6 ? color : color2, gravity: 6, drag: 2.5 });
    }
    this.ring(p, 0.5, radius * 1.3, color, 0.5);
    this.ring(p, 0.3, radius, color2, 0.35, 0.12);
    this.light(p, color, 3, 0.4);
  }

  dust(p: THREE.Vector3, radius: number, count = 12, color = 0xb8a888): void {
    const n = this.n(count, p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.random();
      this.particles.spawn({ x: p.x + Math.cos(a) * r, y: 0.2, z: p.z + Math.sin(a) * r, vx: Math.cos(a) * 3, vy: 0.5 + Math.random() * 1.5, vz: Math.sin(a) * 3, life: 0.6 + Math.random() * 0.6, size: 0.25 + Math.random() * 0.35, color, glow: false, drag: 3 });
    }
  }

  groundCrack(p: THREE.Vector3, radius: number, color = 0x2a2018): void {
    const n = this.n(18 + radius * 3, p);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      this.particles.spawn({ x: p.x + Math.cos(a) * r, y: 0.03, z: p.z + Math.sin(a) * r, life: 1.2 + Math.random() * 0.8, size: 0.3 + Math.random() * 0.5, color, glow: false, flat: true, spin: 0 });
    }
    this.debris(p, 0x7a6a5a, 10, radius * 0.8);
  }

  fire(p: THREE.Vector3, count = 6, radius = 0.4): void {
    const n = this.n(count, p);
    for (let i = 0; i < n; i++) {
      this.particles.spawn({ x: p.x + (Math.random() - 0.5) * radius * 2, y: p.y + Math.random() * 0.3, z: p.z + (Math.random() - 0.5) * radius * 2, vx: (Math.random() - 0.5) * 0.6, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.6, life: 0.35 + Math.random() * 0.4, size: 0.14 + Math.random() * 0.2, color: Math.random() < 0.5 ? 0xff7020 : 0xffd040 });
    }
  }

  smoke(p: THREE.Vector3, color = 0x4a4a4a): void {
    if (Math.random() > this.density(p)) return;
    this.particles.spawn({ x: p.x + (Math.random() - 0.5), y: p.y, z: p.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.5, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.5, life: 2 + Math.random(), size: 0.5 + Math.random() * 0.6, color, glow: false });
  }

  // 立方体雷电：沿折线生成发光方块
  lightning(a: THREE.Vector3, b: THREE.Vector3, color = 0x9ad0ff): void {
    const segs = 6;
    let px = a.x, py = a.y, pz = a.z;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const j = i === segs ? 0 : 0.6;
      const nx = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j;
      const ny = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j;
      const nz = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j;
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        const u = k / steps;
        this.particles.spawn({ x: px + (nx - px) * u, y: py + (ny - py) * u, z: pz + (nz - pz) * u, life: 0.15 + Math.random() * 0.1, size: 0.12, color: k % 2 ? 0xffffff : color, spin: 0 });
      }
      px = nx; py = ny; pz = nz;
    }
    this.hitSpark(b, color, 5, 4);
  }

  aura(p: THREE.Vector3, color: number, radius = 0.6, height = 2): void {
    if (Math.random() > this.density(p)) return;
    const a = Math.random() * Math.PI * 2;
    this.particles.spawn({ x: p.x + Math.cos(a) * radius, y: p.y + Math.random() * height * 0.4, z: p.z + Math.sin(a) * radius, vy: 1.5 + Math.random() * 1.5, life: 0.5 + Math.random() * 0.3, size: 0.08 + Math.random() * 0.1, color });
  }

  shockwave(p: THREE.Vector3, radius: number, color: number): void {
    this.ring(p, 0.4, radius, color, 0.45);
    this.ring(p, 0.2, radius * 0.7, 0xffffff, 0.3, 0.1);
    this.dust(p, radius * 0.8, 14);
    const n = this.n(16, p);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.spawn({ x: p.x + Math.cos(a) * 0.5, y: 0.3, z: p.z + Math.sin(a) * 0.5, vx: Math.cos(a) * radius * 2.2, vy: 1, vz: Math.sin(a) * radius * 2.2, life: 0.4, size: 0.25, color, drag: 3 });
    }
  }
}
