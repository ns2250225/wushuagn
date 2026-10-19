import * as THREE from 'three';
import type { WeaponModel } from '../characters/WeaponController';

// 武器拖尾：记录武器尖端与根部的世界坐标，生成渐隐的加色混合条带

const N = 14;

export class WeaponTrail {
  mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private tips: THREE.Vector3[] = [];
  private bases: THREE.Vector3[] = [];
  private ages: number[] = [];
  private color = new THREE.Color();
  active = false;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(scene: THREE.Scene, private weapon: WeaponModel) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    for (let i = 0; i < N; i++) {
      this.tips.push(new THREE.Vector3());
      this.bases.push(new THREE.Vector3());
      this.ages.push(99);
    }
  }

  setColor(c: number): void {
    this.color.set(c);
  }

  update(dt: number, emitting: boolean): void {
    for (let i = 0; i < N; i++) this.ages[i] += dt;
    if (emitting) {
      const g = this.weapon.group;
      g.updateWorldMatrix(true, false);
      this.tmpA.copy(this.weapon.tip);
      g.localToWorld(this.tmpA);
      this.tmpB.copy(this.weapon.base);
      g.localToWorld(this.tmpB);
      // 环形移位
      const lt = this.tips.pop()!;
      const lb = this.bases.pop()!;
      this.ages.pop();
      lt.copy(this.tmpA);
      lb.copy(this.tmpB);
      this.tips.unshift(lt);
      this.bases.unshift(lb);
      this.ages.unshift(0);
    }
    let any = false;
    for (let i = 0; i < N; i++) {
      const t = this.tips[i];
      const b = this.bases[i];
      const k = Math.max(0, 1 - this.ages[i] / 0.14) * (1 - i / N);
      if (k > 0) any = true;
      this.pos.set([t.x, t.y, t.z], i * 6);
      this.pos.set([b.x, b.y, b.z], i * 6 + 3);
      const r = this.color.r * k, gg = this.color.g * k, bb = this.color.b * k;
      this.col.set([r, gg, bb], i * 6);
      this.col.set([r * 0.15, gg * 0.15, bb * 0.15], i * 6 + 3);
    }
    this.mesh.visible = any;
    this.active = any;
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// 弧形刀光几何体（按角度缓存）
const arcCache = new Map<number, THREE.BufferGeometry>();
export function arcGeometry(deg: number): THREE.BufferGeometry {
  const key = Math.round(deg / 30) * 30;
  let g = arcCache.get(key);
  if (g) return g;
  const seg = Math.max(4, Math.round(key / 15));
  const half = (key * Math.PI) / 360;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -half + (i / seg) * half * 2;
    const s = Math.sin(a);
    const c = Math.cos(a);
    // 外缘亮、内缘暗；两端渐隐
    const edge = Math.sin((i / seg) * Math.PI);
    pos.push(s * 0.55, 0, c * 0.55, s * 1.0, 0, c * 1.0);
    col.push(0.05 * edge, 0.05 * edge, 0.05 * edge, edge, edge, edge);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  arcCache.set(key, g);
  return g;
}
