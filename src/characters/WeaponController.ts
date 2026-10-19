import * as THREE from 'three';
import type { WeaponType } from '../data/types';
import { pixelNoiseTexture } from '../scene/textures';

// 方块化武器模型：全部由立方体拼装，握持点为原点，武器沿 +Z 方向延伸

export interface WeaponModel {
  group: THREE.Group;
  tip: THREE.Vector3; // 拖尾外端（局部）
  base: THREE.Vector3; // 拖尾内端（局部）
  length: number;
  glow: THREE.Mesh[];
  kind: 'polearm' | 'sword' | 'ring' | 'axe';
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

type MatFn = (c: number) => THREE.Material;

function add(g: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

export function defaultWeaponMat(c: number): THREE.Material {
  return new THREE.MeshLambertMaterial({ color: c, map: pixelNoiseTexture() });
}

export function buildWeapon(type: WeaponType, mat: MatFn = defaultWeaponMat, glowColor?: number, scale = 1): WeaponModel {
  const g = new THREE.Group();
  const glow: THREE.Mesh[] = [];
  let tip = new THREE.Vector3(0, 0, 2);
  let base = new THREE.Vector3(0, 0, 1);
  let length = 2;
  let kind: WeaponModel['kind'] = 'polearm';
  const silver = mat(0xe8eef4);
  const steel = mat(0xb8c0c8);
  const gold = mat(0xe0b840);
  const red = mat(0xd02828);
  const glowMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const addGlow = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    if (glowColor === undefined) return;
    const m = add(g, glowMat(glowColor), sx * 1.25, sy * 1.25, sz * 1.1, x, y, z);
    m.castShadow = false;
    glow.push(m);
  };

  switch (type) {
    case 'spear': {
      const shaft = mat(0xf2f2f6);
      add(g, shaft, 0.06, 0.06, 2.4, 0, 0, 0.4);
      add(g, gold, 0.1, 0.1, 0.12, 0, 0, 1.6);
      add(g, red, 0.16, 0.04, 0.2, 0, -0.06, 1.55); // 红缨
      add(g, red, 0.04, 0.16, 0.2, 0, -0.06, 1.55);
      add(g, silver, 0.12, 0.04, 0.4, 0, 0, 1.85);
      add(g, silver, 0.06, 0.03, 0.18, 0, 0, 2.12);
      add(g, gold, 0.08, 0.08, 0.1, 0, 0, -0.82);
      addGlow(0.12, 0.04, 0.5, 0, 0, 1.9);
      tip.set(0, 0, 2.2);
      base.set(0, 0, 1.2);
      length = 2.2;
      break;
    }
    case 'glaive': {
      const shaft = mat(0x3a5a2a);
      add(g, shaft, 0.07, 0.07, 2.3, 0, 0, 0.35);
      add(g, gold, 0.14, 0.14, 0.16, 0, 0, 1.5); // 龙口
      add(g, mat(0x2a8a3a), 0.1, 0.18, 0.12, 0, 0.1, 1.48);
      // 偃月刀大刀片（向上弯曲的月牙）
      const blade = mat(0xdfe8e4);
      add(g, blade, 0.04, 0.34, 0.5, 0, 0.12, 1.82);
      add(g, blade, 0.04, 0.3, 0.3, 0, 0.18, 2.18, -0.35);
      add(g, blade, 0.04, 0.18, 0.2, 0, 0.32, 2.38, -0.7);
      add(g, mat(0x2a9a4a), 0.05, 0.05, 0.4, 0, -0.06, 1.85);
      add(g, gold, 0.04, 0.1, 0.1, 0, -0.05, 1.62);
      add(g, gold, 0.1, 0.1, 0.14, 0, 0, -0.82);
      addGlow(0.04, 0.4, 0.8, 0, 0.15, 2.0);
      tip.set(0, 0.35, 2.4);
      base.set(0, 0, 1.4);
      length = 2.4;
      break;
    }
    case 'snakeSpear': {
      const shaft = mat(0x2a2224);
      add(g, shaft, 0.07, 0.07, 2.4, 0, 0, 0.4);
      add(g, gold, 0.12, 0.12, 0.12, 0, 0, 1.6);
      const blade = mat(0xc8ccd4);
      // 蜿蜒蛇形刃
      for (let i = 0; i < 5; i++) {
        const x = (i % 2 === 0 ? 1 : -1) * 0.05;
        add(g, blade, 0.1, 0.035, 0.16, x, 0, 1.72 + i * 0.12, 0, (i % 2 === 0 ? 1 : -1) * 0.4);
      }
      add(g, blade, 0.05, 0.03, 0.14, 0, 0, 2.38);
      add(g, red, 0.18, 0.05, 0.12, 0, -0.06, 1.66);
      add(g, gold, 0.1, 0.1, 0.12, 0, 0, -0.82);
      addGlow(0.14, 0.04, 0.7, 0, 0, 2.0);
      tip.set(0, 0, 2.4);
      base.set(0, 0, 1.4);
      length = 2.4;
      break;
    }
    case 'halberd': {
      const shaft = mat(0x8a1a1a);
      add(g, shaft, 0.07, 0.07, 2.5, 0, 0, 0.4);
      add(g, mat(0x1a1214), 0.09, 0.09, 0.5, 0, 0, -0.6);
      add(g, gold, 0.14, 0.14, 0.14, 0, 0, 1.68);
      add(g, red, 0.22, 0.05, 0.16, 0, -0.08, 1.6);
      add(g, red, 0.05, 0.22, 0.16, 0, -0.08, 1.6);
      // 中央枪尖
      add(g, silver, 0.1, 0.04, 0.5, 0, 0, 2.05);
      add(g, silver, 0.05, 0.03, 0.15, 0, 0, 2.36);
      // 两侧月牙刃
      for (const s of [1, -1]) {
        add(g, gold, 0.06, 0.06, 0.1, 0.1 * s, 0, 1.82);
        add(g, silver, 0.05, 0.03, 0.34, 0.2 * s, 0, 1.86);
        add(g, silver, 0.05, 0.03, 0.14, 0.26 * s, 0, 2.06, 0, 0.5 * s);
        add(g, silver, 0.05, 0.03, 0.14, 0.26 * s, 0, 1.66, 0, -0.5 * s);
      }
      addGlow(0.5, 0.04, 0.7, 0, 0, 1.95);
      tip.set(0, 0, 2.42);
      base.set(0, 0, 1.4);
      length = 2.42;
      break;
    }
    case 'twinSwords':
    case 'sword': {
      kind = 'sword';
      const bladeLen = type === 'sword' ? 1.05 : 0.88;
      const bladeCol = type === 'sword' ? mat(0xd8dce8) : mat(0xe4f0ea);
      add(g, mat(0x3a2a1a), 0.06, 0.06, 0.22, 0, 0, -0.04);
      add(g, gold, 0.26, 0.06, 0.06, 0, 0, 0.1);
      add(g, bladeCol, 0.09, 0.025, bladeLen, 0, 0, 0.13 + bladeLen / 2);
      add(g, bladeCol, 0.05, 0.02, 0.1, 0, 0, 0.18 + bladeLen);
      add(g, type === 'sword' ? mat(0x6a3aa0) : mat(0x2a9a5a), 0.05, 0.05, 0.08, 0, 0, -0.18);
      addGlow(0.1, 0.03, bladeLen, 0, 0, 0.13 + bladeLen / 2);
      tip.set(0, 0, 0.2 + bladeLen);
      base.set(0, 0, 0.2);
      length = 0.2 + bladeLen;
      break;
    }
    case 'broadsword': {
      kind = 'sword';
      add(g, mat(0x3a2a1a), 0.08, 0.08, 0.5, 0, 0, -0.1);
      add(g, gold, 0.32, 0.08, 0.08, 0, 0, 0.18);
      const blade = mat(0xc8ccd0);
      add(g, blade, 0.05, 0.24, 1.3, 0, 0.04, 0.88);
      add(g, blade, 0.05, 0.16, 0.2, 0, 0.08, 1.6);
      add(g, mat(0x8a8a90), 0.055, 0.04, 1.3, 0, -0.08, 0.88);
      addGlow(0.05, 0.3, 1.4, 0, 0.04, 0.9);
      tip.set(0, 0.05, 1.7);
      base.set(0, 0, 0.3);
      length = 1.7;
      break;
    }
    case 'chakram': {
      kind = 'ring';
      // 八边形环刃
      const ringMat = mat(0xe8d070);
      const edge = mat(0xf4f4f8);
      const R = 0.3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(g, ringMat, 0.24, 0.05, 0.06, Math.cos(a) * R, 0, 0.32 + Math.sin(a) * R, 0, -a + Math.PI / 2);
        add(g, edge, 0.08, 0.03, 0.08, Math.cos(a + 0.4) * (R + 0.07), 0, 0.32 + Math.sin(a + 0.4) * (R + 0.07), 0, -a);
      }
      add(g, mat(0xd04060), 0.08, 0.06, 0.2, 0, 0, 0.06);
      addGlow(0.7, 0.04, 0.7, 0, 0, 0.32);
      tip.set(0, 0, 0.66);
      base.set(0, 0, 0.0);
      length = 0.66;
      break;
    }
    case 'twinHooks': {
      kind = 'axe';
      add(g, mat(0x2a2a3a), 0.06, 0.06, 1.0, 0, 0, 0.3);
      const blade = mat(0xc0c8d8);
      add(g, blade, 0.04, 0.32, 0.18, 0, 0.12, 0.72);
      add(g, blade, 0.04, 0.14, 0.24, 0, 0.26, 0.6, 0.6);
      add(g, blade, 0.04, 0.08, 0.3, 0, 0, 0.92);
      add(g, gold, 0.1, 0.1, 0.08, 0, 0, 0.54);
      addGlow(0.04, 0.4, 0.5, 0, 0.1, 0.75);
      tip.set(0, 0.3, 0.95);
      base.set(0, 0, 0.3);
      length = 1.0;
      break;
    }
    case 'axe': {
      kind = 'axe';
      add(g, mat(0x5a3a1a), 0.08, 0.08, 1.9, 0, 0, 0.35);
      const blade = mat(0xb0b4bc);
      add(g, blade, 0.06, 0.5, 0.42, 0, 0.18, 1.12);
      add(g, blade, 0.06, 0.24, 0.2, 0, 0.42, 1.0);
      add(g, steel, 0.07, 0.2, 0.2, 0, -0.16, 1.15);
      add(g, gold, 0.12, 0.12, 0.1, 0, 0, 0.88);
      addGlow(0.06, 0.6, 0.5, 0, 0.2, 1.1);
      tip.set(0, 0.45, 1.3);
      base.set(0, 0, 0.9);
      length = 1.4;
      break;
    }
  }
  g.scale.setScalar(scale);
  // tip / base 为武器组局部坐标（未缩放），通过 group.localToWorld 转换
  return { group: g, tip, base, length: length * scale, glow, kind };
}

export function isTwinWeapon(t: WeaponType): boolean {
  return t === 'twinSwords' || t === 'chakram' || t === 'twinHooks';
}
export function isPolearm(t: WeaponType): boolean {
  return t === 'spear' || t === 'glaive' || t === 'snakeSpear' || t === 'halberd' || t === 'axe';
}
