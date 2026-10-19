import * as THREE from 'three';
import { SOLDIER_TYPES } from '../data/enemies';
import type { FactionColors, SoldierType, SoldierTypeId } from '../data/types';

// 敌兵 / 友军士兵对象池 + 空间哈希网格（用于攻击判定与分离）

export enum SState {
  Idle,
  Move,
  Attack,
  Hit,
  Knockback,
  Knockdown,
  Recover,
  Dead,
}

export interface SoldierPalette {
  armor: number;
  trim: number;
  cloth: number;
  helmet: number;
  pants: number;
  skin: number;
  weapon: number;
  horse: number;
}

let nextId = 1;

export class Soldier {
  id = 0;
  active = false;
  team: 0 | 1 = 1;
  type: SoldierType = SOLDIER_TYPES.sword;
  pos = new THREE.Vector3();
  prevX = 0;
  prevZ = 0;
  vel = new THREE.Vector3();
  y = 0;
  vy = 0;
  facing = 0;
  hp = 100;
  maxHp = 100;
  atk = 10;
  def = 10;
  spd = 3;
  state: SState = SState.Idle;
  st = 0;
  attackCd = 0;
  hitstun = 0;
  lod = 0;
  updAcc = 0;
  frameSlot = 0;
  walkPhase = 0;
  moveAmt = 0;
  flash = 0;
  dying = false;
  downTime = 0;
  palette: SoldierPalette = { armor: 0, trim: 0, cloth: 0, helmet: 0, pants: 0, skin: 0, weapon: 0, horse: 0 };
  target: { pos: THREE.Vector3; alive: boolean } | null = null;
  targetKind: 'player' | 'soldier' | 'npc' | 'boss' | null = null;
  burn = 0;
  burnDmg = 0;
  freeze = 0;
  fear = 0;
  chargeT = 0;
  chargeHit = false;
  chargeDir = new THREE.Vector3();
  struck = false;
  prefersNpc = false;
  guardOf: unknown = null;
  tag = 0; // 所属波次 / 阶段标记
  spin = 0;
  fall = 0;
  grabbed = false;
  radius = 0.45;
  hitBy = 0; // 本次攻击的唯一 id，防止同一段攻击重复命中
  get alive(): boolean {
    return this.active && !this.dying;
  }
}

export class EnemyPool {
  readonly cap: number;
  items: Soldier[] = [];
  active: Soldier[] = [];
  private free: Soldier[] = [];
  private cell = 4;
  private grid = new Map<number, Soldier[]>();
  private result: Soldier[] = [];

  constructor(cap = 220) {
    this.cap = cap;
    for (let i = 0; i < cap; i++) {
      const s = new Soldier();
      this.items.push(s);
      this.free.push(s);
    }
  }

  get count(): number {
    return this.active.length;
  }

  countTeam(team: 0 | 1): number {
    let n = 0;
    for (const s of this.active) if (s.team === team && !s.dying) n++;
    return n;
  }

  spawn(typeId: SoldierTypeId, team: 0 | 1, x: number, z: number, faction: FactionColors, mult: { hp: number; atk: number }): Soldier | null {
    const s = this.free.pop();
    if (!s) return null;
    const t = SOLDIER_TYPES[typeId];
    s.id = nextId++;
    s.active = true;
    s.team = team;
    s.type = t;
    s.pos.set(x, 0, z);
    s.prevX = x;
    s.prevZ = z;
    s.vel.set(0, 0, 0);
    s.y = 0;
    s.vy = 0;
    s.facing = team === 1 ? Math.PI : 0;
    s.maxHp = s.hp = Math.round(t.hp * mult.hp);
    s.atk = t.atk * mult.atk;
    s.def = t.def;
    s.spd = t.spd * (0.9 + Math.random() * 0.2);
    s.state = SState.Idle;
    s.st = Math.random() * 0.5;
    s.attackCd = 1 + Math.random() * 2;
    s.hitstun = 0;
    s.lod = 0;
    s.updAcc = 0;
    s.frameSlot = Math.floor(Math.random() * 4);
    s.walkPhase = Math.random() * 6;
    s.moveAmt = 0;
    s.flash = 0;
    s.dying = false;
    s.downTime = 0;
    s.target = null;
    s.targetKind = null;
    s.burn = s.freeze = s.fear = 0;
    s.chargeT = 0;
    s.chargeHit = false;
    s.struck = false;
    s.prefersNpc = Math.random() < 0.5;
    s.guardOf = null;
    s.tag = 0;
    s.spin = 0;
    s.fall = 0;
    s.grabbed = false;
    s.radius = t.mounted ? 0.8 : 0.45 * t.scale;
    s.hitBy = 0;
    // 配色：阵营色 + 兵种特色
    const p = s.palette;
    p.armor = faction.armor;
    p.trim = faction.trim;
    p.cloth = faction.cloth;
    p.helmet = faction.armor;
    p.pants = 0x3a3028;
    p.skin = 0xe0b090;
    p.weapon = 0xb8bcc4;
    p.horse = [0x6a4a2a, 0x3a2a1a, 0xd8d0c0, 0x8a6a4a][Math.floor(Math.random() * 4)];
    switch (typeId) {
      case 'heavy':
        p.armor = darken(faction.armor, 0.7);
        p.helmet = 0x5a5a62;
        p.trim = 0x8a8a92;
        break;
      case 'elite':
        p.trim = 0xe0b840;
        p.helmet = 0xe0b840;
        p.cloth = darken(faction.cloth, 0.8);
        break;
      case 'archer':
      case 'allyArcher':
        p.armor = 0x8a6a4a;
        p.helmet = faction.cloth;
        break;
      case 'cavalry':
        p.helmet = 0x9a9aa2;
        break;
    }
    this.active.push(s);
    return s;
  }

  release(s: Soldier): void {
    if (!s.active) return;
    s.active = false;
    s.dying = false;
    const i = this.active.indexOf(s);
    if (i >= 0) {
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
    }
    this.free.push(s);
  }

  clear(): void {
    for (const s of [...this.active]) this.release(s);
  }

  rebuildGrid(): void {
    for (const arr of this.grid.values()) arr.length = 0;
    const c = this.cell;
    for (const s of this.active) {
      const k = (Math.floor(s.pos.x / c) + 500) * 1000 + (Math.floor(s.pos.z / c) + 500);
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(s);
    }
  }

  // 注意：返回的数组会被复用
  query(x: number, z: number, r: number, team: 0 | 1 | -1 = -1, out?: Soldier[]): Soldier[] {
    const res = out ?? this.result;
    res.length = 0;
    const c = this.cell;
    const r2 = r * r;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const arr = this.grid.get((gx + 500) * 1000 + (gz + 500));
        if (!arr) continue;
        for (const s of arr) {
          if (!s.active || s.dying) continue;
          if (team !== -1 && s.team !== team) continue;
          const dx = s.pos.x - x, dz = s.pos.z - z;
          if (dx * dx + dz * dz <= r2 + s.radius * s.radius * 2) res.push(s);
        }
      }
    return res;
  }

  nearest(x: number, z: number, r: number, team: 0 | 1): Soldier | null {
    let best: Soldier | null = null;
    let bd = r * r;
    for (const s of this.query(x, z, r, team)) {
      const d = (s.pos.x - x) ** 2 + (s.pos.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
}

function darken(c: number, k: number): number {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}
