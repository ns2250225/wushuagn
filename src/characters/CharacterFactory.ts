import * as THREE from 'three';
import type { Appearance, WeaponType } from '../data/types';
import { pixelNoiseTexture } from '../scene/textures';
import { buildWeapon, isTwinWeapon, type WeaponModel } from './WeaponController';
import { mergeTree, type MergedBox } from '../scene/merge';

// 方块化武将模型构建：分段骨骼（髋 / 躯干 / 头 / 双臂 / 双腿 / 披风）+ 独立发型、胡须、头饰、盔甲与武器

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cape: THREE.Group | null;
  robe: THREE.Group | null;
  weaponR: WeaponModel | null;
  weaponL: WeaponModel | null;
  weaponType: WeaponType;
  meshes: THREE.Mesh[];
  ghostBoxes: MergedBox[];
  mats: THREE.MeshLambertMaterial[];
  hipH: number;
  scale: number;
  flash: (amount: number, color?: number) => void;
  dispose: () => void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function buildCharacter(look: Appearance, weaponType: WeaponType, opts: { weaponGlow?: number; tint?: number } = {}): CharacterRig {
  const mats = new Map<number, THREE.MeshLambertMaterial>();
  const meshes: THREE.Mesh[] = [];
  const tint = opts.tint !== undefined ? new THREE.Color(opts.tint) : null;
  const mat = (c: number): THREE.MeshLambertMaterial => {
    let m = mats.get(c);
    if (!m) {
      const col = new THREE.Color(c);
      if (tint) col.lerp(tint, 0.55);
      m = new THREE.MeshLambertMaterial({ color: col, map: pixelNoiseTexture(), emissive: 0x000000 });
      mats.set(c, m);
    }
    return m;
  };
  const box = (parent: THREE.Object3D, color: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const m = new THREE.Mesh(BOX, mat(color));
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  const L = look;
  const bw = L.bulk;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.order = 'YXZ';
  const hipH = 0.92;
  body.position.y = hipH;
  root.add(body);
  root.scale.setScalar(L.height);

  // ---- 腿 ----
  const mkLeg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.14 * side * bw, 0, 0);
    box(g, L.pants, 0.24 * bw, 0.6, 0.26, 0, -0.3, 0);
    box(g, L.boots, 0.27 * bw, 0.34, 0.3, 0, -0.75, 0.01);
    box(g, L.armorTrim, 0.28 * bw, 0.06, 0.31, 0, -0.58, 0.01);
    if (!L.female) box(g, L.armor, 0.26 * bw, 0.14, 0.06, 0, -0.68, 0.16);
    body.add(g);
    return g;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // ---- 躯干 ----
  const torso = new THREE.Group();
  torso.rotation.order = 'YXZ';
  body.add(torso);
  const tw = (L.female ? 0.48 : 0.56) * bw;
  const td = 0.32 * (0.85 + bw * 0.15);
  box(torso, L.cloth, tw, 0.72, td, 0, 0.36, 0);
  // 胸甲与护心镜
  box(torso, L.armor, tw * 1.05, 0.42, td * 1.12, 0, 0.5, 0);
  box(torso, L.armorTrim, tw * 0.3, 0.2, 0.04, 0, 0.52, td * 0.56 + 0.02);
  box(torso, L.armorTrim, tw * 1.07, 0.05, td * 1.16, 0, 0.72, 0);
  box(torso, L.armorTrim, tw * 1.07, 0.04, td * 1.16, 0, 0.3, 0);
  // 腰带
  box(torso, L.belt, tw * 1.1, 0.1, td * 1.2, 0, 0.12, 0);
  box(torso, L.armorTrim, 0.14, 0.12, 0.05, 0, 0.12, td * 0.6 + 0.02);
  // 甲裙
  box(torso, L.clothAlt, tw * 1.12, 0.26, td * 1.22, 0, -0.06, 0);
  box(torso, L.armor, tw * 0.5, 0.22, 0.05, tw * 0.28, -0.1, td * 0.62);
  box(torso, L.armor, tw * 0.5, 0.22, 0.05, -tw * 0.28, -0.1, td * 0.62);
  if (L.female) box(torso, L.cloth, tw * 0.9, 0.12, td * 1.15, 0, 0.6, 0.02);

  // 长袍下摆（挂在髋部，随腿摆动）
  let robe: THREE.Group | null = null;
  if (L.robe) {
    robe = new THREE.Group();
    body.add(robe);
    box(robe, L.cloth, tw * 0.9, 0.62, 0.05, 0, -0.42, td * 0.62);
    box(robe, L.cloth, tw * 1.05, 0.66, 0.05, 0, -0.42, -td * 0.62);
    box(robe, L.armorTrim, tw * 0.9, 0.05, 0.06, 0, -0.72, td * 0.62);
  }

  // ---- 头 ----
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0);
  torso.add(head);
  box(head, L.skin, 0.44, 0.44, 0.44, 0, 0.22, 0);
  // 五官
  const eyeY = 0.24;
  for (const s of [1, -1]) {
    box(head, 0xffffff, 0.09, 0.06, 0.02, 0.1 * s, eyeY, 0.222);
    box(head, 0x1a1210, 0.045, 0.06, 0.025, 0.08 * s, eyeY, 0.226);
    box(head, L.hair, 0.12, 0.03, 0.02, 0.1 * s, eyeY + 0.07, 0.224);
  }
  box(head, 0x8a4a3a, 0.1, 0.03, 0.02, 0, 0.1, 0.222);
  box(head, L.skin, 0.06, 0.06, 0.04, 0, 0.17, 0.235);
  // 发型
  box(head, L.hair, 0.46, 0.1, 0.46, 0, 0.44, 0);
  box(head, L.hair, 0.46, 0.3, 0.08, 0, 0.32, -0.2);
  box(head, L.hair, 0.06, 0.2, 0.38, 0.22, 0.34, -0.02);
  box(head, L.hair, 0.06, 0.2, 0.38, -0.22, 0.34, -0.02);
  switch (L.hairStyle) {
    case 'topknot':
      box(head, L.hair, 0.16, 0.14, 0.16, 0, 0.54, -0.04);
      break;
    case 'ponytail':
      box(head, L.hair, 0.14, 0.14, 0.14, 0, 0.46, -0.26);
      box(head, L.hair, 0.1, 0.42, 0.1, 0, 0.18, -0.3, 0.2);
      break;
    case 'long':
      box(head, L.hair, 0.46, 0.72, 0.08, 0, 0.0, -0.25);
      box(head, L.hair, 0.08, 0.5, 0.2, 0.22, 0.08, -0.12);
      box(head, L.hair, 0.08, 0.5, 0.2, -0.22, 0.08, -0.12);
      break;
    case 'spiky':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        box(head, L.hair, 0.1, 0.18, 0.1, Math.cos(a) * 0.15, 0.52, Math.sin(a) * 0.15, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      break;
    case 'bun':
      box(head, L.hair, 0.22, 0.2, 0.2, 0, 0.5, -0.18);
      box(head, 0xe0c060, 0.3, 0.03, 0.03, 0, 0.52, -0.18, 0, 0, 0.4);
      break;
    case 'twinTails':
      for (const s of [1, -1]) {
        box(head, L.hair, 0.12, 0.12, 0.12, 0.26 * s, 0.4, -0.08);
        box(head, L.hair, 0.1, 0.5, 0.1, 0.3 * s, 0.1, -0.12, 0.1, 0, 0.15 * s);
      }
      break;
    case 'short':
    case 'bald':
      break;
  }
  // 胡须
  const bc = L.beardColor ?? L.hair;
  switch (L.beard) {
    case 'long':
      box(head, bc, 0.3, 0.16, 0.08, 0, 0.04, 0.22);
      box(head, bc, 0.24, 0.3, 0.06, 0, -0.16, 0.24);
      box(head, bc, 0.16, 0.24, 0.05, 0, -0.42, 0.25);
      box(head, bc, 0.06, 0.24, 0.1, 0.2, 0.14, 0.18);
      box(head, bc, 0.06, 0.24, 0.1, -0.2, 0.14, 0.18);
      box(head, bc, 0.2, 0.04, 0.03, 0, 0.13, 0.235);
      break;
    case 'thick':
      box(head, bc, 0.46, 0.18, 0.1, 0, 0.04, 0.2);
      box(head, bc, 0.36, 0.1, 0.08, 0, -0.06, 0.2);
      box(head, bc, 0.12, 0.08, 0.06, 0.25, 0.12, 0.2, 0, 0, -0.4);
      box(head, bc, 0.12, 0.08, 0.06, -0.25, 0.12, 0.2, 0, 0, 0.4);
      box(head, bc, 0.08, 0.26, 0.4, 0.22, 0.14, 0.0);
      box(head, bc, 0.08, 0.26, 0.4, -0.22, 0.14, 0.0);
      break;
    case 'goatee':
      box(head, bc, 0.1, 0.14, 0.06, 0, 0.0, 0.22);
      box(head, bc, 0.18, 0.03, 0.03, 0, 0.13, 0.235);
      break;
    case 'mustache':
      box(head, bc, 0.26, 0.04, 0.03, 0, 0.13, 0.235);
      box(head, bc, 0.04, 0.08, 0.03, 0.12, 0.09, 0.235);
      box(head, bc, 0.04, 0.08, 0.03, -0.12, 0.09, 0.235);
      box(head, bc, 0.08, 0.1, 0.05, 0, 0.02, 0.22);
      break;
  }
  // 头饰
  const hc = L.headgearColor;
  const ha = L.headgearAlt;
  switch (L.headgear) {
    case 'helmetPlume':
      box(head, hc, 0.5, 0.18, 0.5, 0, 0.44, 0);
      box(head, hc, 0.5, 0.26, 0.06, 0, 0.32, -0.23);
      box(head, hc, 0.06, 0.22, 0.4, 0.24, 0.34, -0.02);
      box(head, hc, 0.06, 0.22, 0.4, -0.24, 0.34, -0.02);
      box(head, L.armorTrim, 0.52, 0.05, 0.08, 0, 0.38, 0.23);
      box(head, 0xe0c060, 0.08, 0.12, 0.04, 0, 0.46, 0.25);
      box(head, hc, 0.07, 0.12, 0.34, 0, 0.58, -0.02);
      box(head, ha, 0.09, 0.26, 0.09, 0, 0.72, -0.04);
      box(head, ha, 0.08, 0.08, 0.36, 0, 0.82, -0.22, 0.4);
      box(head, ha, 0.07, 0.07, 0.3, 0, 0.7, -0.44, 0.9);
      break;
    case 'pheasant': {
      box(head, hc, 0.5, 0.14, 0.5, 0, 0.44, 0);
      box(head, hc, 0.3, 0.14, 0.3, 0, 0.56, 0);
      box(head, ha, 0.12, 0.12, 0.05, 0, 0.44, 0.255);
      box(head, 0x9a2a9a, 0.06, 0.06, 0.04, 0.16, 0.44, 0.255);
      box(head, 0x9a2a9a, 0.06, 0.06, 0.04, -0.16, 0.44, 0.255);
      // 雉翎：两根长长弯曲的翎羽，吕布的标志
      for (const s of [1, -1]) {
        const f = new THREE.Group();
        f.position.set(0.12 * s, 0.6, 0.08);
        f.rotation.set(-0.3, 0, -0.25 * s);
        head.add(f);
        let y = 0;
        let z = 0;
        let ang = -0.2;
        for (let i = 0; i < 8; i++) {
          const seg = box(f, i % 2 ? ha : 0xf0d8a0, 0.05, 0.22, 0.05, 0, y + 0.1, z);
          seg.rotation.x = ang;
          y += Math.cos(ang) * 0.2;
          z -= Math.sin(ang) * 0.2;
          ang += 0.16;
        }
      }
      break;
    }
    case 'greenHat':
      box(head, hc, 0.48, 0.16, 0.48, 0, 0.46, 0);
      box(head, hc, 0.34, 0.14, 0.34, 0, 0.6, -0.02);
      box(head, ha, 0.5, 0.04, 0.04, 0, 0.4, 0.24);
      box(head, ha, 0.08, 0.08, 0.03, 0, 0.47, 0.25);
      box(head, hc, 0.12, 0.3, 0.04, 0.1, 0.3, -0.26, 0.2);
      box(head, hc, 0.12, 0.3, 0.04, -0.1, 0.3, -0.26, 0.2);
      break;
    case 'bandana':
      box(head, hc, 0.48, 0.1, 0.48, 0, 0.38, 0);
      box(head, ha, 0.12, 0.08, 0.04, 0, 0.38, 0.25);
      box(head, hc, 0.08, 0.26, 0.04, 0.06, 0.24, -0.27, 0.3, 0, 0.2);
      box(head, hc, 0.08, 0.26, 0.04, -0.06, 0.24, -0.27, 0.3, 0, -0.2);
      break;
    case 'crown':
      box(head, hc, 0.3, 0.2, 0.36, 0, 0.54, -0.02);
      box(head, ha, 0.32, 0.04, 0.38, 0, 0.46, -0.02);
      box(head, hc, 0.52, 0.04, 0.34, 0, 0.66, 0);
      box(head, ha, 0.04, 0.12, 0.04, 0.22, 0.6, 0.16);
      box(head, ha, 0.04, 0.12, 0.04, -0.22, 0.6, 0.16);
      box(head, ha, 0.06, 0.04, 0.5, 0, 0.6, 0, 0, Math.PI / 2);
      break;
    case 'circlet':
      box(head, hc, 0.47, 0.05, 0.47, 0, 0.36, 0);
      box(head, ha, 0.07, 0.07, 0.03, 0, 0.38, 0.245);
      break;
    case 'hornHelmet':
    case 'eyepatch':
      box(head, hc, 0.5, 0.18, 0.5, 0, 0.44, 0);
      box(head, hc, 0.5, 0.24, 0.06, 0, 0.32, -0.23);
      box(head, ha, 0.52, 0.05, 0.08, 0, 0.38, 0.23);
      if (L.headgear === 'hornHelmet') {
        for (const s of [1, -1]) {
          box(head, ha, 0.07, 0.24, 0.07, 0.22 * s, 0.6, 0.06, 0, 0, -0.5 * s);
          box(head, ha, 0.05, 0.14, 0.05, 0.3 * s, 0.76, 0.06, 0, 0, -0.2 * s);
        }
      } else {
        box(head, 0x101010, 0.12, 0.1, 0.03, 0.1, eyeY, 0.235);
        box(head, 0x101010, 0.46, 0.025, 0.02, 0, 0.3, 0.232, 0, 0, -0.25);
        box(head, ha, 0.06, 0.18, 0.3, 0, 0.58, -0.02);
      }
      break;
    case 'scholarHat':
      box(head, hc, 0.36, 0.2, 0.36, 0, 0.54, -0.04);
      box(head, ha, 0.38, 0.04, 0.38, 0, 0.46, -0.04);
      box(head, hc, 0.7, 0.04, 0.05, 0, 0.58, -0.22);
      break;
  }

  // ---- 手臂 ----
  const shoulderX = tw / 2 + 0.11;
  const mkArm = (side: number): [THREE.Group, THREE.Group] => {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.position.set(shoulderX * side, 0.64, 0);
    torso.add(g);
    const aw = 0.2 * (0.8 + bw * 0.2);
    box(g, L.cloth, aw + 0.02, 0.38, aw + 0.04, 0, -0.18, 0);
    box(g, L.armor, aw + 0.01, 0.3, aw + 0.03, 0, -0.5, 0);
    box(g, L.armorTrim, aw + 0.04, 0.05, aw + 0.06, 0, -0.38, 0);
    box(g, L.skin, aw - 0.02, 0.14, aw, 0, -0.71, 0);
    switch (L.shoulder) {
      case 'round':
        box(g, L.armor, 0.3, 0.14, 0.32, 0.03 * side, 0.02, 0);
        box(g, L.armorTrim, 0.31, 0.04, 0.33, 0.03 * side, -0.06, 0);
        break;
      case 'big':
        box(g, L.armor, 0.36, 0.18, 0.36, 0.05 * side, 0.03, 0);
        box(g, L.armorTrim, 0.37, 0.05, 0.37, 0.05 * side, -0.08, 0);
        box(g, L.armor, 0.3, 0.12, 0.3, 0.08 * side, -0.14, 0);
        break;
      case 'spiked':
        box(g, L.armor, 0.38, 0.2, 0.38, 0.05 * side, 0.04, 0);
        box(g, L.armorTrim, 0.39, 0.05, 0.39, 0.05 * side, -0.08, 0);
        box(g, L.armorTrim, 0.07, 0.2, 0.07, 0.12 * side, 0.2, 0.08, 0, 0, -0.4 * side);
        box(g, L.armorTrim, 0.07, 0.2, 0.07, 0.12 * side, 0.2, -0.08, 0, 0, -0.4 * side);
        break;
    }
    const hand = new THREE.Group();
    hand.position.set(0, -0.72, 0);
    g.add(hand);
    return [g, hand];
  };
  const [armL, handL] = mkArm(1);
  const [armR, handR] = mkArm(-1);

  // ---- 披风 ----
  let cape: THREE.Group | null = null;
  if (L.cape !== undefined) {
    cape = new THREE.Group();
    cape.position.set(0, 0.7, -td * 0.6 - 0.02);
    torso.add(cape);
    box(cape, L.cape, tw * 1.0, 1.3, 0.04, 0, -0.65, 0);
    box(cape, L.armorTrim, tw * 1.02, 0.06, 0.05, 0, -1.28, 0);
    box(cape, L.armorTrim, tw * 1.1, 0.08, 0.08, 0, 0, 0.02);
  }

  // ---- 武器 ----
  const wmat = (c: number) => mat(c);
  const weaponR = buildWeapon(weaponType, wmat, opts.weaponGlow);
  handR.add(weaponR.group);
  let weaponL: WeaponModel | null = null;
  if (isTwinWeapon(weaponType)) {
    weaponL = buildWeapon(weaponType, wmat, opts.weaponGlow);
    handL.add(weaponL.group);
  }
  // 按关节组合并网格，减少绘制调用；保留立方体局部矩阵供残影使用
  const keep = new Set<THREE.Object3D>();
  for (const w of [weaponR, weaponL]) w?.glow.forEach((g) => keep.add(g));
  const ghostBoxes: MergedBox[] = [];
  mergeTree(root, ghostBoxes, keep);
  meshes.length = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !keep.has(o)) meshes.push(o as THREE.Mesh);
  });

  const matList = [...mats.values()];
  const baseEmissive = matList.map(() => new THREE.Color(0, 0, 0));
  const flashCol = new THREE.Color();
  const rig: CharacterRig = {
    root, body, torso, head, armL, armR, handL, handR, legL, legR, cape, robe,
    weaponR, weaponL, weaponType, meshes, ghostBoxes, mats: matList, hipH, scale: L.height,
    flash(amount: number, color = 0xffffff) {
      flashCol.set(color).multiplyScalar(amount);
      for (let i = 0; i < matList.length; i++) matList[i].emissive.copy(baseEmissive[i]).add(flashCol);
    },
    dispose() {
      for (const m of matList) m.dispose();
      for (const w of [weaponR, weaponL]) w?.glow.forEach((g) => (g.material as THREE.Material).dispose());
    },
  };
  return rig;
}
