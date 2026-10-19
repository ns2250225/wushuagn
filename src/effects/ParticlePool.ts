import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';

// 方块化粒子池：所有粒子均为立方体，使用 InstancedMesh 合批绘制，对象复用无频繁创建销毁

export interface ParticleOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life?: number;
  size?: number;
  color?: number;
  gravity?: number;
  drag?: number;
  glow?: boolean;
  spin?: number;
  shrink?: boolean;
  flat?: boolean;
  bounce?: boolean;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class ParticleBuffer {
  mesh: THREE.InstancedMesh;
  cap: number;
  count = 0;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; max: Float32Array; size: Float32Array;
  grav: Float32Array; drag: Float32Array; spin: Float32Array; rot: Float32Array;
  flags: Uint8Array; // 1 shrink, 2 flat, 4 bounce
  col: Float32Array;

  constructor(cap: number, material: THREE.Material) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(BOX, material, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f();
    this.grav = f(); this.drag = f(); this.spin = f(); this.rot = f();
    this.flags = new Uint8Array(cap);
    this.col = new Float32Array(cap * 3);
  }

  spawn(o: ParticleOpts, limit: number): void {
    let i: number;
    if (this.count < Math.min(this.cap, limit)) i = this.count++;
    else i = Math.floor(Math.random() * this.count); // 超限时替换随机旧粒子
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx ?? 0; this.vy[i] = o.vy ?? 0; this.vz[i] = o.vz ?? 0;
    this.life[i] = this.max[i] = o.life ?? 0.6;
    this.size[i] = o.size ?? 0.15;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = o.spin ?? (Math.random() - 0.5) * 8;
    this.rot[i] = Math.random() * 6;
    this.flags[i] = (o.shrink !== false ? 1 : 0) | (o.flat ? 2 : 0) | (o.bounce ? 4 : 0);
    _c.set(o.color ?? 0xffffff);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
  }

  update(dt: number, glow: boolean): void {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = 1 - this.drag[i] * dt;
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.flags[i] & 4 && this.py[i] < this.size[i] * 0.5) {
        this.py[i] = this.size[i] * 0.5;
        this.vy[i] = Math.abs(this.vy[i]) * 0.35;
        this.vx[i] *= 0.6; this.vz[i] *= 0.6;
        this.spin[i] *= 0.5;
      }
      this.rot[i] += this.spin[i] * dt;
    }
    this.count = n;
    const mesh = this.mesh;
    for (let i = 0; i < n; i++) {
      const k = this.life[i] / this.max[i];
      let s = this.size[i];
      if (this.flags[i] & 1) s *= glow ? 0.3 + 0.7 * k : Math.min(1, k * 3);
      if (this.flags[i] & 2) {
        _e.set(0, this.rot[i], 0);
        _s.set(s, s * 0.15, s);
      } else {
        _e.set(this.rot[i], this.rot[i] * 0.7, 0);
        _s.set(s, s, s);
      }
      _q.setFromEuler(_e);
      _p.set(this.px[i], this.py[i], this.pz[i]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const f = glow ? Math.min(1, k * 1.6) : 1;
      _c.setRGB(this.col[i * 3] * f, this.col[i * 3 + 1] * f, this.col[i * 3 + 2] * f);
      mesh.setColorAt(i, _c);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private copy(from: number, to: number): void {
    if (from === to) return;
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.size[to] = this.size[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.spin[to] = this.spin[from];
    this.rot[to] = this.rot[from]; this.flags[to] = this.flags[from];
    this.col[to * 3] = this.col[from * 3]; this.col[to * 3 + 1] = this.col[from * 3 + 1]; this.col[to * 3 + 2] = this.col[from * 3 + 2];
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }
}

export class ParticlePool {
  glow: ParticleBuffer;
  solid: ParticleBuffer;

  constructor(scene: THREE.Scene, cap = 2400) {
    const gm = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sm = new THREE.MeshLambertMaterial({});
    this.glow = new ParticleBuffer(cap, gm);
    this.solid = new ParticleBuffer(Math.floor(cap / 2), sm);
    this.glow.mesh.renderOrder = 5;
    scene.add(this.glow.mesh, this.solid.mesh);
  }

  spawn(o: ParticleOpts): void {
    const limit = Perf.profile.maxParticles;
    if (o.glow === false) this.solid.spawn(o, limit / 2);
    else this.glow.spawn(o, limit);
  }

  update(dt: number): void {
    this.glow.update(dt, true);
    this.solid.update(dt, false);
  }

  get active(): number {
    return this.glow.count + this.solid.count;
  }

  clear(): void {
    this.glow.clear();
    this.solid.clear();
  }

  dispose(): void {
    this.glow.mesh.removeFromParent();
    this.solid.mesh.removeFromParent();
  }
}
