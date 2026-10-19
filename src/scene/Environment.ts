import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';
import { blockMat, blockTexture, flagTexture, colorMat, skyTexture } from './textures';
import type { EffectManager } from '../effects/EffectManager';
import type { LightingPreset } from './LightingManager';
import { mergeChildren } from './merge';

// 模块化方块建筑系统：同类方块实例化合批，带简化碰撞（AABB）与可破坏物件

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  id?: string;
  off?: boolean;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type DestructibleKind = 'barricade' | 'gate' | 'granary' | 'chain' | 'tower';

export interface Destructible {
  id: string;
  kind: DestructibleKind;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  group: THREE.Group;
  collider: AABB | null;
  flash: number;
  color: number;
  shakeT: number;
}

interface FlagAnim {
  geo: THREE.BufferGeometry;
  base: Float32Array;
  phase: number;
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData.shared = true;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Environment {
  group = new THREE.Group();
  colliders: AABB[] = [];
  destructibles: Destructible[] = [];
  bounds = { minX: -40, maxX: 40, minZ: -62, maxZ: 70 };
  walkable: Rect[] | null = null;
  lighting: LightingPreset = {
    sky: 0xbfd8ff, ground: 0x6a5a40, sun: 0xfff2d8, sunIntensity: 2.2, ambient: 1.1,
    fog: 0xc8d4e0, fogNear: 40, fogFar: 160, sunDir: [0.5, 1, 0.35],
  };
  skyTop = 0x5a8ad8;
  skyBottom = 0xcfe0f0;
  private batches = new Map<string, number[]>();
  private flags: FlagAnim[] = [];
  private sway: { obj: THREE.Object3D; phase: number; amp: number }[] = [];
  private fires: { p: THREE.Vector3; r: number; acc: number }[] = [];
  private smokes: { p: THREE.Vector3; acc: number; color: number }[] = [];
  private waterTex: THREE.Texture | null = null;
  private cloudMesh: THREE.InstancedMesh | null = null;
  private cloudData: Float32Array | null = null;
  private army: { mesh: THREE.InstancedMesh; base: Float32Array; count: number }[] = [];
  private gates: { id: string; doors: THREE.Object3D[]; open: number; opening: boolean; collider: AABB }[] = [];
  private time = 0;
  private grid = new Map<number, AABB[]>();
  private gridSize = 8;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  // ---------- 基础方块 ----------
  block(type: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): void {
    let arr = this.batches.get(type);
    if (!arr) this.batches.set(type, (arr = []));
    arr.push(x, y + sy / 2, z, sx, sy, sz);
  }

  // 用单位方块填充一个区域（x0..x1 / z0..z1 包含端点）
  fill(type: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hollow = false): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          if (hollow) {
            const edge = x === x0 || x === x1 || z === z0 || z === z1 || y === y1;
            if (!edge) continue;
          }
          this.block(type, x, y, z);
        }
  }

  collider(cx: number, cz: number, w: number, d: number, h = 3, id?: string): AABB {
    const c: AABB = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, id };
    this.colliders.push(c);
    return c;
  }

  groundPatch(tex: string, x: number, z: number, w: number, d: number, y = 0.015, tint = 0xffffff): THREE.Mesh {
    const t = blockTexture(tex).clone();
    t.needsUpdate = true;
    t.repeat.set(w, d);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t, color: tint }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  ground(tex: string, tint = 0xffffff): void {
    const w = this.bounds.maxX - this.bounds.minX + 260;
    const d = this.bounds.maxZ - this.bounds.minZ + 260;
    this.groundPatch(tex, (this.bounds.minX + this.bounds.maxX) / 2, (this.bounds.minZ + this.bounds.maxZ) / 2, w, d, 0, tint);
  }

  water(x: number, z: number, w: number, d: number, y = -0.4): void {
    const t = blockTexture('water').clone();
    t.needsUpdate = true;
    t.repeat.set(w / 2, d / 2);
    this.waterTex = t;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t, transparent: true, opacity: 0.92, color: 0xd0e0ff }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.group.add(m);
  }

  // ---------- 建筑模块 ----------
  // 沿轴向的城墙，带垛口
  wall(type: string, x0: number, z0: number, x1: number, z1: number, height: number, thick = 2, crenel = true, solid = true): void {
    const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    if (horiz) {
      const a = Math.min(x0, x1), b = Math.max(x0, x1);
      for (let x = a; x <= b; x++)
        for (let t = 0; t < thick; t++) {
          const z = z0 + t - (thick - 1) / 2;
          for (let y = 0; y < height; y++) this.block(type, x, y, z);
          if (crenel && t === 0 && x % 2 === 0) this.block(type, x, height, z);
        }
      if (solid) this.collider((a + b) / 2, z0, b - a + 1, thick, height);
    } else {
      const a = Math.min(z0, z1), b = Math.max(z0, z1);
      for (let z = a; z <= b; z++)
        for (let t = 0; t < thick; t++) {
          const x = x0 + t - (thick - 1) / 2;
          for (let y = 0; y < height; y++) this.block(type, x, y, z);
          if (crenel && t === 0 && z % 2 === 0) this.block(type, x, height, z);
        }
      if (solid) this.collider(x0, (a + b) / 2, thick, b - a + 1, height);
    }
  }

  tree(x: number, z: number, h = 5, leaf = 'leaves', solid = true): void {
    for (let y = 0; y < h; y++) this.block('log', x, y, z);
    const g = new THREE.Group();
    g.position.set(x, h - 1, z);
    const lm = blockMat(leaf);
    const r = h > 5 ? 2 : 1;
    for (let dx = -r - 1; dx <= r + 1; dx++)
      for (let dz = -r - 1; dz <= r + 1; dz++)
        for (let dy = 0; dy <= 2; dy++) {
          const dist = Math.abs(dx) + Math.abs(dz) + dy;
          if (dist > r + 2 || (Math.abs(dx) === r + 1 && Math.abs(dz) === r + 1)) continue;
          if (Math.random() < 0.12) continue;
          const m = new THREE.Mesh(UNIT, lm);
          m.position.set(dx, dy + 0.5, dz);
          g.add(m);
        }
    mergeChildren(g);
    this.group.add(g);
    this.sway.push({ obj: g, phase: Math.random() * 6, amp: 0.025 });
    if (solid) this.collider(x, z, 1, 1, h);
  }

  tent(x: number, z: number, color: number, rot = 0): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const cm = colorMat(color);
    const wm = colorMat(0xe8dcc0);
    for (let i = 0; i < 4; i++) {
      const w = 4.2 - i * 1.0;
      const m = new THREE.Mesh(UNIT, i % 2 ? cm : wm);
      m.scale.set(w, 0.9, w);
      m.position.y = 0.45 + i * 0.9;
      m.castShadow = true;
      g.add(m);
    }
    const pole = new THREE.Mesh(UNIT, colorMat(0x6a4a2a));
    pole.scale.set(0.12, 1.2, 0.12);
    pole.position.y = 4.1;
    g.add(pole);
    const door = new THREE.Mesh(UNIT, colorMat(0x2a1a10));
    door.scale.set(1, 1.3, 0.1);
    door.position.set(0, 0.65, 2.1);
    g.add(door);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    mergeChildren(g);
    this.group.add(g);
    this.collider(x, z, 4.2, 4.2, 3);
  }

  house(x: number, z: number, w: number, d: number, wallType = 'planks', roofType = 'roof', h = 4): void {
    const x0 = Math.round(x - w / 2), x1 = Math.round(x + w / 2) - 1;
    const z0 = Math.round(z - d / 2), z1 = Math.round(z + d / 2) - 1;
    for (let xx = x0; xx <= x1; xx++)
      for (let zz = z0; zz <= z1; zz++) {
        const edge = xx === x0 || xx === x1 || zz === z0 || zz === z1;
        if (!edge) continue;
        const corner = (xx === x0 || xx === x1) && (zz === z0 || zz === z1);
        for (let y = 0; y < h; y++) this.block(corner ? 'red' : wallType, xx, y, zz);
      }
    // 层叠屋顶，四角上翘
    for (let i = 0; i < 3; i++) {
      for (let xx = x0 - 1 + i; xx <= x1 + 1 - i; xx++)
        for (let zz = z0 - 1 + i; zz <= z1 + 1 - i; zz++) {
          const edge = xx === x0 - 1 + i || xx === x1 + 1 - i || zz === z0 - 1 + i || zz === z1 + 1 - i;
          if (!edge && i < 2) continue;
          this.block(roofType, xx, h + i, zz);
        }
    }
    for (const [cx, cz] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) this.block(roofType, cx, h + 1, cz);
    this.collider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 1, z1 - z0 + 1, h + 2);
  }

  palace(x: number, z: number, w: number, d: number): void {
    // 台基 + 红柱大殿 + 金顶
    for (let xx = Math.round(x - w / 2 - 1); xx <= Math.round(x + w / 2); xx++)
      for (let zz = Math.round(z - d / 2 - 1); zz <= Math.round(z + d / 2); zz++) this.block('marble', xx, 0, zz);
    const x0 = Math.round(x - w / 2), x1 = Math.round(x + w / 2) - 1;
    const z0 = Math.round(z - d / 2), z1 = Math.round(z + d / 2) - 1;
    const h = 6;
    for (let xx = x0; xx <= x1; xx++)
      for (let zz = z0; zz <= z1; zz++) {
        const edge = xx === x0 || xx === x1 || zz === z0 || zz === z1;
        if (!edge) continue;
        const pillar = (xx - x0) % 3 === 0;
        for (let y = 1; y < h; y++) this.block(pillar ? 'red' : 'marble', xx, y, zz);
      }
    for (let i = 0; i < 4; i++)
      for (let xx = x0 - 2 + i; xx <= x1 + 2 - i; xx++)
        for (let zz = z0 - 2 + i; zz <= z1 + 2 - i; zz++) {
          const edge = xx === x0 - 2 + i || xx === x1 + 2 - i || zz === z0 - 2 + i || zz === z1 + 2 - i;
          if (!edge && i < 3) continue;
          this.block('roofGold', xx, h + i, zz);
        }
    this.collider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 3, z1 - z0 + 3, h + 3);
  }

  flag(x: number, z: number, color: number, text: string, h = 6, solid = false): void {
    for (let y = 0; y < h; y++) this.block('log', x, y, z, 0.25, 1, 0.25);
    const geo = new THREE.PlaneGeometry(1.6, 2.4, 8, 1);
    geo.translate(0.8, 0, 0);
    const mat = new THREE.MeshLambertMaterial({ map: flagTexture(color, text), side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + 0.12, h - 1.3, z);
    m.rotation.y = Math.random() * 0.6 - 0.3;
    this.group.add(m);
    const base = new Float32Array(geo.attributes.position.array as Float32Array);
    this.flags.push({ geo, base, phase: Math.random() * 6 });
    if (solid) this.collider(x, z, 0.5, 0.5, h);
  }

  brazier(x: number, z: number): void {
    this.block('cobble', x, 0, z);
    this.block('gold', x, 1, z, 1.2, 0.3, 1.2);
    this.fires.push({ p: new THREE.Vector3(x, 1.4, z), r: 0.35, acc: 0 });
    this.collider(x, z, 1, 1, 1.5);
  }

  fireAt(x: number, y: number, z: number, r = 0.6): void {
    this.fires.push({ p: new THREE.Vector3(x, y, z), r, acc: 0 });
  }

  smokeAt(x: number, y: number, z: number, color = 0x3a3a3a): void {
    this.smokes.push({ p: new THREE.Vector3(x, y, z), acc: 0, color });
  }

  // 装饰性拒马（不可破坏）
  spikes(x: number, z: number, len: number, rotY = 0, solid = true): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const wm = colorMat(0x6a4a2a);
    const tip = colorMat(0xc8c0b0);
    const beam = new THREE.Mesh(UNIT, wm);
    beam.scale.set(len, 0.25, 0.25);
    beam.position.y = 0.7;
    g.add(beam);
    for (let i = -len / 2 + 0.5; i < len / 2; i += 1) {
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(UNIT, wm);
        p.scale.set(0.15, 0.15, 1.8);
        p.position.set(i, 0.7, 0);
        p.rotation.x = 0.7 * s;
        g.add(p);
        const t = new THREE.Mesh(UNIT, tip);
        t.scale.set(0.16, 0.16, 0.25);
        t.position.set(i, 0.7 + Math.sin(0.7) * 0.9, 0.9 * s * Math.cos(0.7));
        t.rotation.x = 0.7 * s;
        g.add(t);
      }
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    mergeChildren(g);
    this.group.add(g);
    if (solid) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      this.collider(x, z, len * c + 1.4 * s, len * s + 1.4 * c, 1.4);
    }
  }

  // 远景兵阵：大量简化士兵实例，营造千军万马的规模感
  armyFormation(cx: number, cz: number, rows: number, cols: number, color: number, facing: number, spacing = 1.6): void {
    const limit = Perf.profile.backgroundArmy;
    let total = 0;
    for (const a of this.army) total += a.count;
    const n = Math.min(rows * cols, Math.max(0, limit - total));
    if (n <= 0) return;
    const geo = new THREE.BoxGeometry(0.55, 1.8, 0.4);
    geo.translate(0, 0.9, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const base = new Float32Array(n * 3);
    let i = 0;
    const cs = Math.cos(facing), sn = Math.sin(facing);
    for (let r = 0; r < rows && i < n; r++)
      for (let c = 0; c < cols && i < n; c++) {
        const lx = (c - cols / 2) * spacing + (Math.random() - 0.5) * 0.3;
        const lz = (r - rows / 2) * spacing + (Math.random() - 0.5) * 0.3;
        const x = cx + lx * cs + lz * sn;
        const z = cz - lx * sn + lz * cs;
        base[i * 3] = x;
        base[i * 3 + 1] = z;
        base[i * 3 + 2] = Math.random() * 6;
        _m.makeRotationY(facing);
        _m.setPosition(x, 0, z);
        mesh.setMatrixAt(i, _m);
        i++;
      }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    this.army.push({ mesh, base, count: n });
    // 阵前旗帜
    for (let k = 0; k < 3; k++) {
      const fx = cx + ((k - 1) * cols * spacing) / 3 * cs;
      const fz = cz - ((k - 1) * cols * spacing) / 3 * sn;
      this.flag(Math.round(fx), Math.round(fz), color, '军', 5);
    }
  }

  // 边界山丘与树林装饰
  border(hillType = 'grass', treeDensity = 0.5): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const ring = (x: number, z: number) => {
      const dx = Math.max(minX - x, 0, x - maxX);
      const dz = Math.max(minZ - z, 0, z - maxZ);
      return Math.max(dx, dz);
    };
    for (let x = minX - 14; x <= maxX + 14; x += 1)
      for (let z = minZ - 14; z <= maxZ + 14; z += 1) {
        const d = ring(x, z);
        if (d < 1 || d > 14) continue;
        const h = Math.floor(Math.min(6, d * 0.45 + Math.sin(x * 0.3) * 1.2 + Math.cos(z * 0.25) * 1.2));
        if (h <= 0) continue;
        this.block(hillType === 'grass' ? 'grassBlock' : hillType, x, h - 1, z);
        if (h > 1) this.block('dirt', x, h - 2, z);
        if (d > 3 && Math.random() < treeDensity * 0.03) this.tree(x, z, 4 + Math.floor(Math.random() * 3), 'leaves', false);
      }
    // 隐形边界
    this.collider((minX + maxX) / 2, minZ - 1, maxX - minX + 4, 2, 10);
    this.collider((minX + maxX) / 2, maxZ + 1, maxX - minX + 4, 2, 10);
    this.collider(minX - 1, (minZ + maxZ) / 2, 2, maxZ - minZ + 4, 10);
    this.collider(maxX + 1, (minZ + maxZ) / 2, 2, maxZ - minZ + 4, 10);
  }

  clouds(n = 24): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    this.cloudData = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      this.cloudData[i * 5] = (Math.random() - 0.5) * 300;
      this.cloudData[i * 5 + 1] = 45 + Math.random() * 15;
      this.cloudData[i * 5 + 2] = (Math.random() - 0.5) * 300;
      this.cloudData[i * 5 + 3] = 10 + Math.random() * 20;
      this.cloudData[i * 5 + 4] = 6 + Math.random() * 10;
    }
    this.cloudMesh = mesh;
    this.group.add(mesh);
  }

  // ---------- 城门（可开启 / 可破坏） ----------
  gate(id: string, x: number, z: number, width: number, height: number, destructible: boolean, hp = 3000): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const doors: THREE.Object3D[] = [];
    const wm = blockMat('darkPlanks');
    const gm = colorMat(0xc8a040);
    for (const s of [-1, 1]) {
      const door = new THREE.Group();
      door.position.set((s * width) / 2, 0, 0);
      for (let i = 0; i < width / 2; i++)
        for (let y = 0; y < height; y++) {
          const m = new THREE.Mesh(UNIT, wm);
          m.position.set(-s * (i + 0.5), y + 0.5, 0);
          m.castShadow = true;
          door.add(m);
          if ((y === 1 || y === height - 2) && i % 1 === 0) {
            const st = new THREE.Mesh(UNIT, gm);
            st.scale.set(0.3, 0.3, 1.15);
            st.position.set(-s * (i + 0.5), y + 0.5, 0);
            door.add(st);
          }
        }
      mergeChildren(door);
      g.add(door);
      doors.push(door);
    }
    this.group.add(g);
    const col = this.collider(x, z, width, 2, height, id);
    if (destructible) {
      this.destructibles.push({
        id, kind: 'gate', name: '城门', pos: new THREE.Vector3(x, 0, z), radius: width / 2 + 0.5, hp, maxHp: hp, alive: true,
        group: g, collider: col, flash: 0, color: 0x5a3a20, shakeT: 0,
      });
    } else {
      this.gates.push({ id, doors, open: 0, opening: false, collider: col });
    }
  }

  openGate(id: string): void {
    const g = this.gates.find((x) => x.id === id);
    if (!g) return;
    g.opening = true;
    g.collider.off = true;
  }

  // ---------- 可破坏物 ----------
  destructible(id: string, kind: DestructibleKind, x: number, z: number, opts: { hp?: number; w?: number; rot?: number; name?: string } = {}): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = opts.rot ?? 0;
    const add = (mat: THREE.Material, sx: number, sy: number, sz: number, px: number, py: number, pz: number, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(UNIT, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      g.add(m);
    };
    let radius = 2;
    let hp = opts.hp ?? 1500;
    let color = 0x6a4a2a;
    let name = opts.name ?? '';
    let cw = 2, cd = 2, ch = 2;
    switch (kind) {
      case 'barricade': {
        const w = opts.w ?? 8;
        const wood = colorMat(0x6a4a2a);
        const tip = colorMat(0xd0c8b8);
        const red = colorMat(0xa02020);
        add(wood, w, 0.3, 0.3, 0, 0.8, 0);
        add(wood, w, 0.3, 0.3, 0, 0.3, 0);
        for (let i = -w / 2 + 0.5; i < w / 2; i += 1)
          for (const s of [1, -1]) {
            add(wood, 0.18, 0.18, 2.2, i, 0.8, 0, 0.75 * s);
            add(tip, 0.2, 0.2, 0.3, i, 0.8 + Math.sin(0.75) * 1.1, 1.1 * s * Math.cos(0.75), 0.75 * s);
          }
        add(red, 0.6, 1.2, 0.05, 0, 1.6, 0.2);
        radius = w / 2 + 0.5;
        hp = opts.hp ?? 1200;
        name = name || '拒马';
        cw = w;
        cd = 2;
        ch = 1.6;
        break;
      }
      case 'granary': {
        const hay = blockMat('hay');
        const wood = blockMat('planks');
        const roof = blockMat('roof');
        for (let i = 0; i < 3; i++) add(i === 1 ? hay : wood, 4 - i * 0.2, 1.2, 4 - i * 0.2, 0, 0.6 + i * 1.2, 0);
        add(roof, 4.8, 0.6, 4.8, 0, 3.9, 0);
        add(roof, 3.2, 0.6, 3.2, 0, 4.5, 0);
        add(hay, 1.6, 0.6, 1.6, 0, 5.1, 0);
        radius = 2.8;
        hp = opts.hp ?? 2200;
        color = 0xd0b050;
        name = name || '粮仓';
        cw = cd = 4;
        ch = 4;
        break;
      }
      case 'chain': {
        const iron = colorMat(0x3a3a40);
        const post = blockMat('darkPlanks');
        add(post, 1, 2.4, 1, -3, 1.2, 0);
        add(post, 1, 2.4, 1, 3, 1.2, 0);
        for (let i = 0; i < 9; i++) add(iron, 0.55, 0.3, 0.3, -2.4 + i * 0.6, 1.6 + Math.sin((i / 8) * Math.PI) * -0.4, 0, 0, i % 2 ? 0 : Math.PI / 2);
        radius = 3.2;
        hp = opts.hp ?? 1600;
        color = 0x3a3a40;
        name = name || '连环锁';
        cw = 7;
        cd = 1.2;
        ch = 2.4;
        break;
      }
      case 'tower': {
        const wood = blockMat('planks');
        const dark = blockMat('darkPlanks');
        const iron = colorMat(0x4a4a50);
        add(dark, 4, 1, 6, 0, 0.9, 0);
        for (const sx of [-1.6, 1.6]) for (const sz of [-2.2, 2.2]) add(iron, 0.4, 1.2, 1.2, sx * 1.1, 0.6, sz, Math.PI / 2);
        add(wood, 3.6, 3, 4, 0, 2.9, -0.6);
        add(wood, 3.2, 2.4, 3.4, 0, 5.6, -0.6);
        add(dark, 3.8, 0.4, 4.2, 0, 7, -0.6);
        add(iron, 0.8, 0.8, 3, 0, 1.8, 3.2);
        add(colorMat(0x9a7ab0), 1.4, 2, 0.06, 0, 6.4, 1.2);
        radius = 3.4;
        hp = opts.hp ?? 3200;
        name = name || '攻城车';
        cw = 4;
        cd = 6;
        ch = 7;
        break;
      }
      case 'gate':
        break;
    }
    mergeChildren(g);
    this.group.add(g);
    const rot = opts.rot ?? 0;
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const col = this.collider(x, z, cw * c + cd * s, cw * s + cd * c, ch, id);
    this.destructibles.push({ id, kind, name, pos: new THREE.Vector3(x, 0, z), radius, hp, maxHp: hp, alive: true, group: g, collider: col, flash: 0, color, shakeT: 0 });
  }

  getDestructible(id: string): Destructible | undefined {
    return this.destructibles.find((d) => d.id === id);
  }

  damageDestructible(d: Destructible, amount: number, fx: EffectManager): boolean {
    if (!d.alive) return false;
    d.hp -= amount;
    d.shakeT = 0.15;
    fx.debris(d.pos.clone().setY(1.2), d.color, 3, 3);
    if (d.hp <= 0) {
      d.alive = false;
      d.hp = 0;
      if (d.collider) d.collider.off = true;
      d.group.visible = false;
      const p = d.pos.clone().setY(0.5);
      fx.debris(p, d.color, 30, 8);
      fx.debris(p, 0x8a8a8a, 12, 6);
      fx.explosion(p, d.radius, d.kind === 'granary' ? 0xff7020 : 0xffd080);
      if (d.kind === 'granary' || d.kind === 'tower') {
        this.fireAt(d.pos.x, 0.4, d.pos.z, 1.6);
        this.smokeAt(d.pos.x, 2, d.pos.z);
      }
      return true;
    }
    return false;
  }

  // ---------- 完成构建：实例化合批 ----------
  finalize(): void {
    for (const [type, arr] of this.batches) {
      const n = arr.length / 6;
      let mat: THREE.Material | THREE.Material[];
      if (type === 'grassBlock') {
        const side = blockMat('grassSide');
        mat = [side, side, blockMat('grassTop'), blockMat('dirt'), side, side];
      } else mat = blockMat(type);
      const mesh = new THREE.InstancedMesh(UNIT, mat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        _p.set(arr[o], arr[o + 1], arr[o + 2]);
        _s.set(arr[o + 3], arr[o + 4], arr[o + 5]);
        _q.identity();
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.receiveShadow = true;
      mesh.castShadow = Perf.profile.name === 'high' && n < 4000;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.batches.clear();
    // 构建碰撞网格
    this.grid.clear();
    for (const c of this.colliders) this.addToGrid(c);
    this.scene.background = skyTexture(this.skyTop, this.skyBottom);
  }

  private addToGrid(c: AABB): void {
    const g = this.gridSize;
    for (let gx = Math.floor(c.minX / g); gx <= Math.floor(c.maxX / g); gx++)
      for (let gz = Math.floor(c.minZ / g); gz <= Math.floor(c.maxZ / g); gz++) {
        const k = (gx + 500) * 1000 + (gz + 500);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
  }

  private near(x: number, z: number): AABB[] | undefined {
    const g = this.gridSize;
    return this.grid.get((Math.floor(x / g) + 500) * 1000 + (Math.floor(z / g) + 500));
  }

  isWalkable(x: number, z: number): boolean {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    if (!this.walkable) return true;
    for (const r of this.walkable) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
    return false;
  }

  // 圆形与 AABB 推出；不可行走区域回退到上一位置
  resolve(pos: THREE.Vector3, prevX: number, prevZ: number, r: number): boolean {
    let hit = false;
    const check = (list: AABB[] | undefined) => {
      if (!list) return;
      for (const c of list) {
        if (c.off) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // 圆心在盒内：沿最近的边推出
          const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, bb = c.maxZ - pos.z;
          const m = Math.min(l, rr, t, bb);
          if (m === l) pos.x = c.minX - r;
          else if (m === rr) pos.x = c.maxX + r;
          else if (m === t) pos.z = c.minZ - r;
          else pos.z = c.maxZ + r;
        }
      }
    };
    const g = this.gridSize;
    const gx0 = Math.floor((pos.x - r) / g), gx1 = Math.floor((pos.x + r) / g);
    const gz0 = Math.floor((pos.z - r) / g), gz1 = Math.floor((pos.z + r) / g);
    if (gx0 === gx1 && gz0 === gz1) check(this.near(pos.x, pos.z));
    else {
      const seen = new Set<AABB>();
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gz = gz0; gz <= gz1; gz++) {
          const l = this.grid.get((gx + 500) * 1000 + (gz + 500));
          if (!l) continue;
          check(l.filter((c) => !seen.has(c) && (seen.add(c), true)));
        }
    }
    if (!this.isWalkable(pos.x, pos.z)) {
      if (this.isWalkable(prevX, pos.z)) pos.x = prevX;
      else if (this.isWalkable(pos.x, prevZ)) pos.z = prevZ;
      else {
        pos.x = prevX;
        pos.z = prevZ;
      }
      if (!this.isWalkable(pos.x, pos.z)) {
        const b = this.bounds;
        pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
        pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
      }
      hit = true;
    }
    return hit;
  }

  // 线段遮挡检测（用于攻击判定的遮挡规则与摄像机避障）
  segmentBlocked(ax: number, az: number, bx: number, bz: number, minH = 1.2): boolean {
    for (const c of this.colliders) {
      if (c.off || c.h < minH) continue;
      if (segAabb(ax, az, bx, bz, c) < 1) return true;
    }
    return false;
  }

  // 3D 射线与碰撞盒最近交点参数 t（0..1），用于摄像机避障
  rayHit(a: THREE.Vector3, b: THREE.Vector3): number {
    let best = 1;
    for (const c of this.colliders) {
      if (c.off || c.h < 2) continue;
      const t = segAabb3(a, b, c);
      if (t < best) best = t;
    }
    return best;
  }

  findSpawn(x: number, z: number, radius: number): THREE.Vector3 {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!this.isWalkable(px, pz)) continue;
      const p = new THREE.Vector3(px, 0, pz);
      if (!this.resolve(p, px, pz, 0.5)) return p;
    }
    return new THREE.Vector3(x, 0, z);
  }

  update(dt: number, fx: EffectManager, focus: THREE.Vector3): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.flags) {
      const pos = f.geo.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length; i += 3) {
        const x = f.base[i];
        pos[i + 2] = Math.sin(t * 4 + x * 2.2 + f.phase) * 0.18 * x;
        pos[i + 1] = f.base[i + 1] - x * 0.05;
      }
      f.geo.attributes.position.needsUpdate = true;
    }
    for (const s of this.sway) s.obj.rotation.z = Math.sin(t * 1.3 + s.phase) * s.amp;
    for (const f of this.fires) {
      if (f.p.distanceToSquared(focus) > 3600) continue;
      f.acc += dt * 14 * f.r;
      while (f.acc >= 1) {
        f.acc -= 1;
        fx.fire(f.p, 1, f.r);
      }
    }
    for (const s of this.smokes) {
      s.acc += dt * 3;
      while (s.acc >= 1) {
        s.acc -= 1;
        fx.smoke(s.p, s.color);
      }
    }
    if (this.waterTex) {
      this.waterTex.offset.x = Math.sin(t * 0.3) * 0.2;
      this.waterTex.offset.y = t * 0.05;
    }
    if (this.cloudMesh && this.cloudData) {
      const d = this.cloudData;
      for (let i = 0; i < this.cloudMesh.count; i++) {
        let x = d[i * 5] + t * 1.5;
        x = ((x + 150) % 300) - 150;
        _p.set(x + focus.x * 0.3, d[i * 5 + 1], d[i * 5 + 2] + focus.z * 0.3);
        _s.set(d[i * 5 + 3], 2, d[i * 5 + 4]);
        _q.identity();
        _m.compose(_p, _q, _s);
        this.cloudMesh.setMatrixAt(i, _m);
      }
      this.cloudMesh.instanceMatrix.needsUpdate = true;
    }
    // 远景兵阵简化动画：上下起伏
    for (const a of this.army) {
      for (let i = 0; i < a.count; i++) {
        a.mesh.getMatrixAt(i, _m);
        _m.decompose(_p, _q, _s);
        _p.y = Math.abs(Math.sin(t * 3 + a.base[i * 3 + 2])) * 0.15;
        _m.compose(_p, _q, _s);
        a.mesh.setMatrixAt(i, _m);
      }
      a.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const g of this.gates) {
      if (!g.opening || g.open >= 1) continue;
      g.open = Math.min(1, g.open + dt * 0.5);
      g.doors[0].rotation.y = -g.open * 1.6;
      g.doors[1].rotation.y = g.open * 1.6;
    }
    for (const d of this.destructibles) {
      if (!d.alive || d.shakeT <= 0) continue;
      d.shakeT -= dt;
      d.group.position.x = d.pos.x + Math.sin(t * 80) * 0.08 * (d.shakeT > 0 ? 1 : 0);
    }
    void _e;
  }
}

function segAabb(ax: number, az: number, bx: number, bz: number, c: AABB): number {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (clip(-dx, ax - c.minX) && clip(dx, c.maxX - ax) && clip(-dz, az - c.minZ) && clip(dz, c.maxZ - az)) return t0;
  return 1;
}

function segAabb3(a: THREE.Vector3, b: THREE.Vector3, c: AABB): number {
  let t0 = 0, t1 = 1;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const o = [a.x, a.y, a.z];
  const mn = [c.minX, 0, c.minZ];
  const mx = [c.maxX, c.h, c.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return 1;
      continue;
    }
    let ta = (mn[i] - o[i]) / d[i];
    let tb = (mx[i] - o[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return 1;
  }
  return t0;
}
