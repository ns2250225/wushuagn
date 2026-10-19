import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import { PICKUPS, type PickupKind } from '../data/items';
import type { Battle } from './Battle';

// 战场掉落道具：肉包（回复）、美酒（无双）、攻击 / 防御增益、金币

interface Pickup {
  kind: PickupKind;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  t: number;
  active: boolean;
  value: number;
}

export class PickupSystem {
  private items: Pickup[] = [];

  constructor(private b: Battle, scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ kind: 'gold', mesh, pos: new THREE.Vector3(), t: 0, active: false, value: 0 });
    }
  }

  drop(kind: PickupKind, at: THREE.Vector3, value = 0): void {
    const p = this.items.find((x) => !x.active) ?? this.items[0];
    p.kind = kind;
    p.active = true;
    p.t = 0;
    p.value = value;
    p.pos.set(at.x + (Math.random() - 0.5) * 1.2, 0, at.z + (Math.random() - 0.5) * 1.2);
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(PICKUPS[kind].color);
    p.mesh.scale.setScalar(kind === 'gold' ? 0.6 : 1);
    p.mesh.visible = true;
  }

  update(dt: number): void {
    const b = this.b;
    const pl = b.player;
    for (const p of this.items) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t > 25) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const d = Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z);
      // 吸附
      if (d < 3 && pl.alive) {
        p.pos.x += ((pl.pos.x - p.pos.x) / d) * 10 * dt;
        p.pos.z += ((pl.pos.z - p.pos.z) / d) * 10 * dt;
      }
      p.mesh.position.set(p.pos.x, 0.6 + Math.sin(p.t * 4) * 0.15, p.pos.z);
      p.mesh.rotation.set(p.t * 1.3, p.t * 2, 0);
      if (Math.random() < dt * 6) b.fx.particles.spawn({ x: p.pos.x, y: 0.5, z: p.pos.z, vy: 1.5, life: 0.5, size: 0.08, color: PICKUPS[p.kind].color });
      if (d < 0.9 && pl.alive) this.collect(p);
    }
  }

  private collect(p: Pickup): void {
    const b = this.b;
    const pl = b.player;
    p.active = false;
    p.mesh.visible = false;
    Audio.play('pickup');
    switch (p.kind) {
      case 'meat':
        pl.heal(pl.maxHp * 0.3);
        b.hud.toast('肉包：生命回复', 'good');
        break;
      case 'wine':
        pl.addMusou(60);
        b.hud.toast('美酒：无双能量回复', 'good');
        break;
      case 'power':
        pl.buffAtk(1.5, 15);
        b.hud.toast('攻击力上升！', 'good');
        break;
      case 'shield':
        pl.buffDef(1.8, 15);
        b.hud.toast('防御力上升！', 'good');
        break;
      case 'gold':
        b.stats.gold += p.value;
        break;
    }
    b.fx.ring(pl.pos, 0.3, 1.6, PICKUPS[p.kind].color, 0.3);
  }

  clear(): void {
    for (const p of this.items) {
      p.active = false;
      p.mesh.visible = false;
    }
  }
}
