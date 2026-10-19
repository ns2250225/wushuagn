import type { SwingType, WeaponType } from '../data/types';
import type { CharacterRig } from './CharacterFactory';
import { isPolearm, isTwinWeapon } from './WeaponController';

// 程序化分段动画：关键帧姿势插值 + 移动循环 + 动作混合

const KEYS = [
  'by', 'bx', 'bry', 'tx', 'ty', 'tz', 'hx', 'hy',
  'arx', 'ary', 'arz', 'alx', 'aly', 'alz', 'llx', 'lrx', 'wrx', 'wry', 'wrz', 'wlx', 'wly', 'wlz', 'cape',
] as const;
type Key = (typeof KEYS)[number];
export type Pose = Record<Key, number>;
type PartialPose = Partial<Pose>;
type Track = Array<[number, PartialPose]>;

const ANGLE_WRAP: Partial<Record<Key, boolean>> = { bx: true, bry: true };

function emptyPose(): Pose {
  const p = {} as Pose;
  for (const k of KEYS) p[k] = 0;
  return p;
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const TAU = Math.PI * 2;

function flurryTrack(n: number): Track {
  const tr: Track = [[0, { arx: -0.8, wrx: 0.6, ty: 0.3 }]];
  for (let i = 0; i < n; i++) {
    const t0 = 0.05 + (i / n) * 0.85;
    const t1 = t0 + 0.85 / n / 2;
    const side = i % 2 ? 1 : -1;
    tr.push([t0, { arx: -0.9, wrx: 0.7, ary: side * 0.25, ty: 0.35 * -side, llx: -0.2 }]);
    tr.push([t1, { arx: -1.55, wrx: 1.55, ary: side * 0.15, ty: -0.25 * -side, tx: 0.15, llx: -0.5, lrx: 0.3 }]);
  }
  tr.push([1, { arx: -0.9, wrx: 0.6 }]);
  return tr;
}

const TRACKS: Record<string, Track> = {
  thrust: [
    [0, { arx: -0.6, wrx: 0.4, ty: 0.5 }],
    [0.38, { arx: -0.5, wrx: 0.4, ty: 0.65, llx: 0.2 }],
    [0.55, { arx: -1.55, wrx: 1.55, ty: -0.35, tx: 0.15, llx: -0.55, lrx: 0.4 }],
    [0.75, { arx: -1.55, wrx: 1.55, ty: -0.35, tx: 0.15, llx: -0.55, lrx: 0.4 }],
    [1, { arx: -0.9, wrx: 0.6 }],
  ],
  slashR: [
    [0, { arx: -1.2, ary: -0.9, wrx: 1.2, ty: -1.0, tx: 0.05 }],
    [0.35, { arx: -1.3, ary: -1.25, wrx: 1.3, ty: -1.3, llx: 0.2, lrx: -0.2 }],
    [0.62, { arx: -1.4, ary: 0.7, wrx: 1.4, ty: 1.15, tx: 0.15, llx: -0.35, lrx: 0.3 }],
    [1, { arx: -1.0, ary: 0.4, wrx: 1.0, ty: 0.6 }],
  ],
  slashL: [
    [0, { arx: -1.2, ary: 0.8, wrx: 1.2, ty: 1.0, tx: 0.05 }],
    [0.35, { arx: -1.3, ary: 1.1, wrx: 1.3, ty: 1.25, llx: -0.2, lrx: 0.2 }],
    [0.62, { arx: -1.4, ary: -1.0, wrx: 1.4, ty: -1.2, tx: 0.15, llx: 0.3, lrx: -0.35 }],
    [1, { arx: -1.0, ary: -0.5, wrx: 1.0, ty: -0.6 }],
  ],
  overhead: [
    [0, { arx: -2.0, wrx: -0.4, tx: -0.1 }],
    [0.4, { arx: -3.0, wrx: 0.1, tx: -0.25, hx: -0.2, by: 0.05 }],
    [0.58, { arx: -0.8, wrx: 0.9, tx: 0.45, llx: -0.6, lrx: 0.5, by: -0.12 }],
    [0.8, { arx: -0.8, wrx: 0.9, tx: 0.4, llx: -0.6, lrx: 0.5, by: -0.12 }],
    [1, { arx: -0.8, wrx: 0.4, tx: 0.1 }],
  ],
  spin: [
    [0, { bry: 0, arx: -1.2, ary: -0.8, wrx: 1.2, tx: 0.05 }],
    [0.12, { bry: -0.3, arx: -1.3, ary: -1.0, wrx: 1.35, by: 0.05 }],
    [0.88, { bry: TAU, arx: -1.4, ary: -1.0, wrx: 1.4, by: 0.12, tx: 0.1 }],
    [1, { bry: TAU, arx: -1.0, ary: -0.5, wrx: 1.0 }],
  ],
  uppercut: [
    [0, { arx: -0.4, wrx: 1.0, tx: 0.3, ty: -0.4, llx: -0.3, by: -0.15 }],
    [0.35, { arx: -0.3, wrx: 1.1, tx: 0.35, ty: -0.45, by: -0.2, llx: -0.4 }],
    [0.55, { arx: -2.9, wrx: 0.2, tx: -0.3, hx: -0.3, by: 0.3, ty: 0.2, llx: 0.2, lrx: -0.4 }],
    [1, { arx: -2.2, wrx: 0.3, tx: -0.1 }],
  ],
  slam: [
    [0, { arx: -2.0, wrx: -0.3 }],
    [0.15, { by: -0.22, llx: 0.5, lrx: 0.5, arx: -2.3, wrx: -0.3 }],
    [0.4, { by: 1.3, arx: -3.0, wrx: -0.1, tx: -0.3, llx: -0.8, lrx: -0.8 }],
    [0.6, { by: -0.15, arx: -0.6, wrx: 1.0, tx: 0.5, llx: -0.7, lrx: 0.5 }],
    [0.82, { by: -0.15, arx: -0.6, wrx: 1.0, tx: 0.5, llx: -0.7, lrx: 0.5 }],
    [1, { arx: -0.7, wrx: 0.6, tx: 0.1 }],
  ],
  doubleThrust: [
    [0, { arx: -0.6, wrx: 0.4, ty: 0.5 }],
    [0.22, { arx: -0.55, wrx: 0.45, ty: 0.6 }],
    [0.32, { arx: -1.55, wrx: 1.55, ty: -0.3, tx: 0.15, llx: -0.5, lrx: 0.3 }],
    [0.48, { arx: -0.7, wrx: 0.6, ty: 0.5, llx: -0.2 }],
    [0.66, { arx: -1.6, wrx: 1.6, ty: -0.4, tx: 0.2, llx: -0.6, lrx: 0.45 }],
    [0.82, { arx: -1.6, wrx: 1.6, ty: -0.4, tx: 0.2, llx: -0.6, lrx: 0.45 }],
    [1, { arx: -0.9, wrx: 0.6 }],
  ],
  flurry: flurryTrack(5),
  cross: [
    [0, { arx: -2.4, ary: -1.0, wrx: 1.0, ty: -0.8 }],
    [0.3, { arx: -0.9, ary: 0.8, wrx: 1.0, ty: 0.8, tx: 0.2, llx: -0.3 }],
    [0.45, { arx: -2.4, ary: 0.9, wrx: 1.0, ty: 0.7 }],
    [0.65, { arx: -0.9, ary: -0.9, wrx: 1.0, ty: -0.8, tx: 0.2, lrx: -0.3 }],
    [1, { arx: -1.0, ary: 0, wrx: 0.8 }],
  ],
  throw: [
    [0, { arx: -2.6, ary: -0.3, wrx: 0, ty: -0.6, tx: -0.1 }],
    [0.4, { arx: -2.9, ary: -0.3, ty: -0.8, tx: -0.15, llx: 0.3 }],
    [0.5, { arx: -1.4, ary: 0.2, ty: 0.4, tx: 0.2, llx: -0.4, lrx: 0.3 }],
    [1, { arx: -0.8, ty: 0 }],
  ],
  grab: [
    [0, { arx: -1.2, alx: -1.2, tx: 0.2, wrx: 1.0 }],
    [0.25, { arx: -1.6, alx: -1.6, tx: 0.35, llx: -0.4, wrx: 1.2 }],
    [0.55, { arx: -3.0, alx: -3.0, tx: -0.3, by: 0.35, hx: -0.3, wrx: 0.2 }],
    [0.75, { arx: -0.8, alx: -0.8, tx: 0.6, by: -0.2, llx: -0.6, lrx: 0.5, wrx: 1.0 }],
    [1, { arx: -0.8, alx: -0.6, tx: 0.2, wrx: 0.6 }],
  ],
  leapThrust: [
    [0, { arx: -0.8, wrx: 0.6 }],
    [0.15, { by: -0.2, llx: 0.5, lrx: 0.5, arx: -0.8, wrx: 0.6 }],
    [0.4, { by: 1.6, arx: -2.6, wrx: 0.5, tx: -0.2, llx: -0.7, lrx: -0.4 }],
    [0.6, { by: 0, arx: -1.2, wrx: 2.0, tx: 0.6, llx: -0.8, lrx: 0.6 }],
    [0.8, { by: 0, arx: -1.2, wrx: 2.0, tx: 0.6, llx: -0.8, lrx: 0.6 }],
    [1, { arx: -1.0, wrx: 1.2, tx: 0.2 }],
  ],
  raise: [
    [0, { arx: -1, wrx: 0 }],
    [0.3, { arx: -3.0, alx: -2.6, alz: 0.3, wrx: -0.1, hx: -0.35, by: 0.05, tx: -0.15 }],
    [1, { arx: -3.0, alx: -2.6, alz: 0.3, wrx: -0.1, hx: -0.35, by: 0.05, tx: -0.15 }],
  ],
  roar: [
    [0, { arz: -0.3, alz: 0.3 }],
    [0.2, { tx: -0.35, hx: -0.45, arz: -1.2, alz: 1.2, arx: -0.3, alx: -0.3, by: -0.05, llx: 0.3, lrx: -0.3 }],
    [0.8, { tx: -0.35, hx: -0.45, arz: -1.25, alz: 1.25, arx: -0.35, alx: -0.35, by: -0.05, llx: 0.3, lrx: -0.3 }],
    [1, {}],
  ],
  dodge: [
    [0, { bx: 0, by: 0 }],
    [0.15, { bx: 0.6, by: -0.35, llx: -1.2, lrx: -1.2, arx: -1.2, alx: -1.2, tx: 0.4 }],
    [0.75, { bx: TAU - 0.4, by: -0.4, llx: -1.2, lrx: -1.2, arx: -1.2, alx: -1.2, tx: 0.4 }],
    [1, { bx: TAU, by: 0 }],
  ],
  hit: [
    [0, { tx: -0.45, hx: -0.35, arx: -0.2, alx: -0.2, by: -0.05 }],
    [0.3, { tx: -0.38, hx: -0.3, arx: -0.25, alx: -0.25 }],
    [1, {}],
  ],
  knockdown: [
    [0, { bx: -0.3 }],
    [0.3, { bx: -1.5, by: -0.62, arx: -2.8, alx: -2.8, llx: -0.3 }],
    [1, { bx: -1.5, by: -0.62, arx: -2.8, alx: -2.8, llx: -0.3 }],
  ],
  getup: [
    [0, { bx: -1.5, by: -0.62, arx: -2.8, alx: -2.8 }],
    [0.5, { bx: -0.5, by: -0.45, tx: 0.6, llx: -1.4, lrx: 0.2, arx: -0.6, alx: -0.6 }],
    [1, {}],
  ],
  victory: [
    [0, { arx: -1.0 }],
    [0.4, { arx: -3.0, wrx: -0.2, alz: 0.6, by: 0.05, hx: -0.2, tx: -0.1 }],
    [1, { arx: -3.0, wrx: -0.2, alz: 0.6, by: 0.05, hx: -0.2, tx: -0.1 }],
  ],
  guard: [
    [0, { arx: -1.4, ary: 0.6, wrx: 1.0, wrz: 1.4, tx: 0.1 }],
    [1, { arx: -1.4, ary: 0.6, wrx: 1.0, wrz: 1.4, tx: 0.1 }],
  ],
  windup: [
    [0, {}],
    [0.6, { arx: -2.8, wrx: -0.2, tx: -0.25, ty: -0.4, by: -0.05, llx: 0.3, lrx: -0.3 }],
    [1, { arx: -2.9, wrx: -0.2, tx: -0.28, ty: -0.45, by: -0.05, llx: 0.3, lrx: -0.3 }],
  ],
};

export type ActionName = SwingType | 'dodge' | 'hit' | 'knockdown' | 'getup' | 'victory' | 'guard' | 'windup';

interface Action {
  name: ActionName;
  dur: number;
  t: number;
  hold: boolean;
  track: Track;
  speed: number;
}

const HOLD_ACTIONS: Partial<Record<ActionName, boolean>> = { knockdown: true, victory: true, guard: true, windup: true };

function evalTrack(tr: Track, t: number, out: Pose, keys: Set<Key>): void {
  let i = 0;
  while (i < tr.length - 1 && tr[i + 1][0] < t) i++;
  const [t0, p0] = tr[i];
  const [t1, p1] = tr[Math.min(i + 1, tr.length - 1)];
  const k = t1 > t0 ? smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) : 1;
  for (const key of keys) {
    const a = p0[key] ?? 0;
    const b = p1[key] ?? 0;
    out[key] = a + (b - a) * k;
  }
}

const trackKeys = new WeakMap<Track, Set<Key>>();
function keysOf(tr: Track): Set<Key> {
  let s = trackKeys.get(tr);
  if (!s) {
    s = new Set<Key>();
    for (const [, p] of tr) for (const k of Object.keys(p) as Key[]) s.add(k);
    // 所有轨道都需要覆盖主要关节，未声明的视为 0
    for (const k of ['by', 'bx', 'bry', 'tx', 'ty', 'tz', 'hx', 'hy', 'arx', 'ary', 'arz', 'llx', 'lrx', 'wrx', 'wry', 'wrz'] as Key[]) s.add(k);
    trackKeys.set(tr, s);
  }
  return s;
}

export class AnimationController {
  private base = emptyPose();
  private act = emptyPose();
  private out = emptyPose();
  private tmp = emptyPose();
  private action: Action | null = null;
  private blendIn = 0;
  private phase = 0;
  private time = 0;
  private style: 'polearm' | 'sword' | 'twin' | 'ring';
  speed01 = 0; // 移动速度 0..1
  airborne = 0;

  constructor(public rig: CharacterRig, weaponType: WeaponType) {
    this.style = weaponType === 'chakram' ? 'ring' : isTwinWeapon(weaponType) ? 'twin' : isPolearm(weaponType) ? 'polearm' : 'sword';
  }

  get current(): ActionName | null {
    return this.action?.name ?? null;
  }
  get actionT(): number {
    return this.action ? this.action.t : 1;
  }

  play(name: ActionName, dur: number, opts: { hold?: boolean; track?: Track } = {}): void {
    let track = opts.track ?? TRACKS[name];
    if (name === 'flurry' && !opts.track) track = TRACKS.flurry;
    this.action = { name, dur: Math.max(0.05, dur), t: 0, hold: opts.hold ?? !!HOLD_ACTIONS[name], track, speed: 1 };
    this.blendIn = 0;
  }

  playFlurry(dur: number, n: number): void {
    this.play('flurry', dur, { track: flurryTrack(n) });
  }

  stop(): void {
    this.action = null;
  }

  update(dt: number): void {
    this.time += dt;
    // ---- 基础姿势：待机 / 奔跑 ----
    const b = this.base;
    for (const k of KEYS) b[k] = 0;
    const s = this.speed01;
    this.phase += dt * (4 + s * 7) * (s > 0.05 ? 1 : 0);
    const sp = Math.sin(this.phase);
    const breathe = Math.sin(this.time * 2.2) * 0.012;
    b.by = breathe + Math.abs(Math.cos(this.phase)) * 0.07 * s;
    b.llx = sp * 0.9 * s;
    b.lrx = -sp * 0.9 * s;
    b.tx = 0.18 * s;
    b.hx = -0.08 * s;
    b.cape = 0.12 + s * 0.6 + Math.sin(this.time * 3) * 0.05;
    switch (this.style) {
      case 'polearm':
        b.arx = -0.5 + sp * 0.12 * s;
        b.arz = 0.1;
        b.wrx = -0.5;
        break;
      case 'sword':
        b.arx = -0.3 - sp * 0.4 * s;
        b.wrx = 0.9;
        b.alx = sp * 0.6 * s;
        b.alz = 0.1;
        break;
      case 'twin':
        b.arx = -0.3 - sp * 0.4 * s;
        b.wrx = 0.9;
        b.arz = -0.15;
        break;
      case 'ring':
        b.arx = -0.4 - sp * 0.3 * s;
        b.arz = -0.35;
        b.wrx = 0.5;
        b.wrz = 1.57;
        break;
    }
    if (this.airborne > 0) {
      b.llx = -0.6;
      b.lrx = 0.3;
      b.tx = -0.1;
    }
    this.deriveLeft(b, true);

    // ---- 动作 ----
    const a = this.action;
    let w = 0;
    if (a) {
      a.t += dt / a.dur;
      if (a.t >= 1) {
        if (a.hold) a.t = 1;
        else {
          this.action = null;
        }
      }
    }
    if (this.action) {
      const ac = this.action;
      const keys = keysOf(ac.track);
      for (const k of KEYS) this.act[k] = b[k];
      evalTrack(ac.track, ac.t, this.act, keys);
      if (this.style === 'twin' && !keys.has('alx')) {
        evalTrack(ac.track, Math.max(0, ac.t - 0.12), this.tmp, keys);
        this.act.alx = this.tmp.arx;
        this.act.aly = -this.tmp.ary;
        this.act.alz = -this.tmp.arz;
        this.act.wlx = this.tmp.wrx;
        this.act.wly = -this.tmp.wry;
        this.act.wlz = -this.tmp.wrz;
      } else if (!keys.has('alx')) {
        this.deriveLeft(this.act, false);
      }
      this.act.cape = 0.3 + Math.abs(this.act.tx) * 0.5;
      this.blendIn = Math.min(1, this.blendIn + dt / 0.06);
      w = this.blendIn;
      if (!ac.hold && ac.t > 0.8) w *= 1 - (ac.t - 0.8) / 0.2;
      w = smooth(Math.max(0, Math.min(1, w)));
    }
    const o = this.out;
    for (const k of KEYS) {
      if (w <= 0) {
        o[k] = b[k];
        continue;
      }
      const av = this.act[k];
      const bv = b[k];
      if (ANGLE_WRAP[k]) o[k] = bv + wrapAngle(av - bv) * w;
      else o[k] = bv + (av - bv) * w;
    }
    this.apply(o);
  }

  private deriveLeft(p: Pose, isBase: boolean): void {
    switch (this.style) {
      case 'polearm':
        p.alx = p.arx * 0.9 - 0.2;
        p.aly = 0.5 + p.ary * 0.8;
        p.alz = -0.15;
        break;
      case 'twin':
      case 'ring':
        if (isBase) {
          p.alx = this.style === 'ring' ? -0.4 + Math.sin(this.phase) * 0.3 * this.speed01 : -0.3 + Math.sin(this.phase) * 0.4 * this.speed01;
          p.aly = -p.ary;
          p.alz = -p.arz;
        } else {
          p.alx = p.arx * 0.5;
          p.aly = -p.ary * 0.5;
          p.alz = -p.arz;
        }
        p.wlx = p.wrx;
        p.wly = -p.wry;
        p.wlz = -p.wrz;
        break;
      case 'sword':
        if (!isBase) {
          p.alx = -0.2 - p.tx * 0.5;
          p.alz = 0.25;
        }
        break;
    }
  }

  private apply(p: Pose): void {
    const r = this.rig;
    r.body.position.y = r.hipH + p.by + this.airborne;
    r.body.rotation.set(p.bx, p.bry, 0);
    r.torso.rotation.set(p.tx, p.ty, p.tz);
    r.head.rotation.set(p.hx, p.hy - p.ty * 0.3, 0);
    r.armR.rotation.set(p.arx, p.ary, p.arz);
    r.armL.rotation.set(p.alx, p.aly, p.alz);
    r.legL.rotation.x = p.llx;
    r.legR.rotation.x = p.lrx;
    if (r.weaponR) r.weaponR.group.rotation.set(p.wrx, p.wry, p.wrz);
    if (r.weaponL) r.weaponL.group.rotation.set(p.wlx, p.wly, p.wlz);
    if (r.cape) r.cape.rotation.x = Math.max(0.05, p.cape);
    if (r.robe) r.robe.rotation.x = (p.llx + p.lrx) * 0.25;
  }
}
