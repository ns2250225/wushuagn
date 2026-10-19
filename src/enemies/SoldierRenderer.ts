import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';
import { pixelNoiseTexture } from '../scene/textures';
import { SState, type EnemyPool, type Soldier } from './EnemyPool';

// 士兵实例化渲染：所有士兵的所有身体部件合并到一个 InstancedMesh（单次绘制调用）
// 近处使用完整分段模型与动画，远处切换为简化 LOD 模型

const PARTS_FULL = 18;
const _root = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _o = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _w = new THREE.Color(1, 1, 1);
const _ice = new THREE.Color(0.6, 0.9, 1);
const _fire = new THREE.Color(1, 0.5, 0.2);
const _dark = new THREE.Color(0.15, 0.15, 0.15);
const _red = new THREE.Color(1, 0.15, 0.1);
const _v = new THREE.Vector3();
const STACK: THREE.Matrix4[] = Array.from({ length: 24 }, () => new THREE.Matrix4());
let sp = 0;
// 预分配矩阵栈，避免每帧大量创建对象
function mul(a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 {
  const m = STACK[sp++ % STACK.length];
  return m.multiplyMatrices(a, b);
}

function tr(out: THREE.Matrix4, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  out.makeRotationFromEuler(_e);
  out.elements[12] = px;
  out.elements[13] = py;
  out.elements[14] = pz;
  return out;
}

export class SoldierRenderer {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private cap: number;
  private camPos = new THREE.Vector3();
  private blink = false;

  constructor(scene: THREE.Scene, maxSoldiers: number) {
    this.cap = maxSoldiers * PARTS_FULL;
    const mat = new THREE.MeshLambertMaterial({ map: pixelNoiseTexture() });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = Perf.profile.shadows && Perf.profile.name !== 'low';
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  private put(parent: THREE.Matrix4, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, color: number, s: Soldier, rx = 0): void {
    if (this.n >= this.cap) return;
    tr(_o, ox, oy, oz, rx, 0, 0);
    _o.scale(_v.set(sx, sy, sz));
    _b.multiplyMatrices(parent, _o);
    this.mesh.setMatrixAt(this.n, _b);
    _c.set(color);
    if (s.freeze > 0) _c.lerp(_ice, 0.55);
    if (s.burn > 0 && Math.floor(s.burn * 10) % 2 === 0) _c.lerp(_fire, 0.4);
    if (s.state === SState.Attack && !s.struck && s.team === 1 && s.st > s.type.windup * 0.45 && this.blink) _c.lerp(_red, 0.45);
    if (s.flash > 0) _c.lerp(_w, Math.min(1, s.flash * 5));
    if (s.state === SState.Dead) _c.lerp(_dark, Math.min(0.7, s.st * 1.2));
    this.mesh.setColorAt(this.n, _c);
    this.n++;
  }

  update(pool: EnemyPool, camera: THREE.Camera, time: number): void {
    this.n = 0;
    this.camPos.copy(camera.position);
    this.blink = Math.floor(time * 14) % 2 === 0;
    const lodD2 = Perf.profile.lodDistance ** 2;
    for (const s of pool.active) {
      const dx = s.pos.x - this.camPos.x;
      const dz = s.pos.z - this.camPos.z;
      const d2 = dx * dx + dz * dz;
      s.lod = d2 > lodD2 ? 1 : 0;
      if (d2 > (Perf.profile.drawDistance * 0.8) ** 2) continue;
      this.drawSoldier(s, time);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private drawSoldier(s: Soldier, time: number): void {
    const t = s.type;
    const P = s.palette;
    const sc = t.scale;
    const mounted = t.mounted;
    const hip = mounted ? 1.5 : 0.85;
    let fall = s.fall;
    let lower = 0;
    let shrink = 1;
    if (s.state === SState.Knockdown || s.state === SState.Dead || s.state === SState.Recover) {
      lower = s.y > 0.05 ? 0 : -0.5 * Math.min(1, Math.abs(fall) / 1.5);
    }
    if (s.state === SState.Dead && s.st > 0.45) shrink = Math.max(0.01, 1 - (s.st - 0.45) * 3);
    // 根变换
    tr(_root, s.pos.x, s.y + lower * sc, s.pos.z, 0, s.facing + s.spin, 0);
    _root.scale(_v.set(sc * shrink, sc * shrink, sc * shrink));
    sp = 0;
    // 坐骑
    if (mounted && !(s.state === SState.Dead && s.st > 0.2)) {
      const g = s.moveAmt;
      const ph = s.walkPhase * 1.6;
      this.put(_root, 0, 1.0, 0, 0.62, 0.62, 1.5, P.horse, s);
      tr(_a, 0, 1.25, 0.75, -0.6 + Math.sin(ph) * 0.1 * g);
      this.put(mul(_root, _a), 0, 0.15, 0.25, 0.32, 0.4, 0.62, P.horse, s);
      if (s.lod === 0) {
        for (let i = 0; i < 4; i++) {
          const fx = i % 2 ? 0.2 : -0.2;
          const fz = i < 2 ? 0.55 : -0.55;
          const sw = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.8 * g;
          tr(_a, fx, 0.75, fz, sw);
          this.put(mul(_root, _a), 0, -0.4, 0, 0.17, 0.8, 0.17, P.horse, s);
        }
        this.put(_root, 0, 1.33, 0, 0.66, 0.06, 0.7, P.cloth, s);
      }
    }
    // 身体（以髋部为枢轴旋转用于倒地）
    tr(_a, 0, hip, 0, fall);
    const body = mul(_root, _a);
    if (s.lod === 1) {
      // 简化模型：躯干 + 头 + 武器
      this.put(body, 0, mounted ? 0.3 : -0.1, 0, 0.5, mounted ? 0.7 : 1.5, 0.3, P.armor, s);
      this.put(body, 0, 0.9, 0, 0.42, 0.42, 0.42, P.helmet, s);
      if (t.weapon === 'spear' || t.weapon === 'lance' || t.weapon === 'halberd') this.put(body, -0.35, 0.4, 0.3, 0.07, 2.0, 0.07, P.weapon, s);
      return;
    }
    // 动画参数
    const g = s.moveAmt;
    const ph = s.walkPhase;
    const sw = Math.sin(ph) * 0.75 * g;
    let tx = 0.08 * g, ty = 0;
    let arx = -sw * 0.6 - 0.2, alx = sw * 0.6 - 0.2, arz = 0, alz = 0;
    let wrx = 1.2;
    if (s.state === SState.Attack) {
      const w = Math.min(1, s.st / Math.max(0.05, t.windup));
      const k = s.struck ? Math.min(1, (s.st - t.windup) / 0.15) : 0;
      if (t.weapon === 'bow') {
        alx = -1.55;
        arx = -1.55 + (s.struck ? 0.4 : 0);
        arz = s.struck ? 0 : 0.25 * w;
        ty = -0.3;
      } else if (t.weapon === 'spear' || t.weapon === 'lance') {
        arx = -0.9 + 0.3 * w - 0.8 * k;
        wrx = 0.9 - 0.3 * w + 0.8 * k;
        ty = 0.4 * w - 0.6 * k;
        tx = 0.15 * k;
      } else {
        arx = -0.3 - 2.4 * w + 2.2 * k;
        wrx = 0.6 + 0.6 * k;
        tx = -0.15 * w + 0.4 * k;
        ty = -0.3 * w + 0.4 * k;
      }
    } else if (s.state === SState.Hit) {
      tx = -0.45;
      arx = -0.4;
      alx = -0.4;
    } else if (s.state === SState.Knockdown || s.state === SState.Dead) {
      arx = -2.6;
      alx = -2.6;
    } else if (s.fear > 0) {
      arx = -2.4;
      alx = -2.4;
      arz = -0.4;
      alz = 0.4;
      tx = 0.3;
    } else if (t.weapon === 'bow') {
      alx = -0.6;
    }
    if (t.weapon === 'spear' || t.weapon === 'lance' || t.weapon === 'halberd') {
      if (s.state !== SState.Attack) {
        arx = -0.5 - sw * 0.2;
        wrx = -0.4;
      }
    }
    // 腿
    if (mounted) {
      tr(_a, 0.15, 0, 0, -1.2, 0, -0.5);
      this.put(mul(body, _a), 0, -0.38, 0, 0.2, 0.75, 0.22, P.pants, s);
      tr(_a, -0.15, 0, 0, -1.2, 0, 0.5);
      this.put(mul(body, _a), 0, -0.38, 0, 0.2, 0.75, 0.22, P.pants, s);
    } else {
      tr(_a, 0.13, 0, 0, sw);
      const l = mul(body, _a);
      this.put(l, 0, -0.42, 0, 0.22, 0.85, 0.24, P.pants, s);
      tr(_a, -0.13, 0, 0, -sw);
      const r = mul(body, _a);
      this.put(r, 0, -0.42, 0, 0.22, 0.85, 0.24, P.pants, s);
    }
    // 躯干
    tr(_a, 0, 0, 0, tx, ty, 0);
    const torso = mul(body, _a);
    this.put(torso, 0, 0.34, 0, 0.5, 0.68, 0.3, P.cloth, s);
    this.put(torso, 0, 0.44, 0, 0.53, 0.38, 0.33, P.armor, s);
    this.put(torso, 0, 0.08, 0, 0.54, 0.08, 0.34, P.trim, s);
    // 头 + 头盔
    this.put(torso, 0, 0.88, 0, 0.4, 0.4, 0.4, P.skin, s);
    switch (t.helmet) {
      case 'cap':
        this.put(torso, 0, 1.1, 0, 0.44, 0.12, 0.44, P.helmet, s);
        break;
      case 'helm':
        this.put(torso, 0, 1.08, -0.02, 0.46, 0.22, 0.46, P.helmet, s);
        this.put(torso, 0, 1.24, 0, 0.06, 0.14, 0.06, P.trim, s);
        break;
      case 'heavy':
        this.put(torso, 0, 1.0, -0.01, 0.48, 0.34, 0.47, P.helmet, s);
        this.put(torso, 0, 0.93, 0.21, 0.36, 0.05, 0.04, 0x101010, s);
        break;
      case 'elite':
        this.put(torso, 0, 1.08, -0.02, 0.46, 0.22, 0.46, P.helmet, s);
        this.put(torso, 0, 1.3, -0.08, 0.08, 0.3, 0.08, 0xd02020, s);
        break;
      case 'hood':
        this.put(torso, 0, 1.06, -0.03, 0.44, 0.24, 0.46, P.helmet, s);
        break;
    }
    // 右臂 + 武器
    tr(_a, -0.34, 0.6, 0, arx, 0, arz);
    const ra = mul(torso, _a);
    this.put(ra, 0, -0.3, 0, 0.18, 0.62, 0.2, P.armor, s);
    tr(_a, 0, -0.6, 0, wrx);
    const hand = mul(ra, _a);
    switch (t.weapon) {
      case 'sword':
        this.put(hand, 0, 0, 0.45, 0.06, 0.12, 0.85, P.weapon, s);
        break;
      case 'spear':
        this.put(hand, 0, 0, 0.5, 0.06, 0.06, 2.4, 0x6a4a2a, s);
        this.put(hand, 0, 0, 1.8, 0.1, 0.04, 0.3, P.weapon, s);
        break;
      case 'lance':
        this.put(hand, 0, 0, 0.7, 0.07, 0.07, 2.8, 0x5a3a2a, s);
        this.put(hand, 0, 0, 2.2, 0.1, 0.1, 0.4, P.weapon, s);
        break;
      case 'halberd':
        this.put(hand, 0, 0, 0.4, 0.07, 0.07, 2.1, 0x3a2a1a, s);
        this.put(hand, 0, 0.12, 1.3, 0.05, 0.42, 0.34, P.weapon, s);
        break;
      case 'bow':
        break;
    }
    // 左臂 + 盾 / 弓
    tr(_a, 0.34, 0.6, 0, alx, 0, alz);
    const la = mul(torso, _a);
    this.put(la, 0, -0.3, 0, 0.18, 0.62, 0.2, P.armor, s);
    if (t.shield) this.put(la, 0.06, -0.4, 0.12, 0.5, 0.62, 0.08, P.trim, s, -alx - 0.1);
    if (t.weapon === 'bow') {
      this.put(la, 0, -0.62, 0.05, 0.06, 1.2, 0.08, 0x6a4a2a, s, 1.55);
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
