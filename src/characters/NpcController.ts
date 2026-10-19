import * as THREE from 'three';
import type { Battle } from '../game/Battle';
import { NPCS } from '../data/enemies';
import { buildCharacter, type CharacterRig } from './CharacterFactory';
import { AnimationController } from './AnimationController';
import { lerpAngle } from '../enemies/EnemyAI';

// 需要保护的友军 NPC（糜夫人 / 刘备），刘备会与玩家并肩作战

export class NpcController {
  rig: CharacterRig;
  anim: AnimationController;
  pos = new THREE.Vector3();
  facing = 0;
  hp: number;
  maxHp: number;
  name: string;
  alive = true;
  fighter: boolean;
  private atkCd = 1;
  private hurtT = 0;
  private home = new THREE.Vector3();

  constructor(private b: Battle, id: string, x: number, z: number) {
    const d = NPCS[id];
    this.name = d.name;
    this.maxHp = this.hp = Math.round(d.hp * (b.diffKey === 'easy' ? 1.5 : 1));
    this.fighter = id === 'liubei_npc';
    this.rig = buildCharacter(d.look, d.weaponType);
    this.anim = new AnimationController(this.rig, d.weaponType);
    b.sm.scene.add(this.rig.root);
    this.pos.set(x, 0, z);
    this.home.copy(this.pos);
  }

  takeDamage(dmg: number): void {
    if (!this.alive) return;
    this.hp -= Math.max(1, Math.round(dmg * 0.8));
    this.hurtT = 0.12;
    if (!this.fighter && Math.random() < 0.3) this.anim.play('hit', 0.3);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.anim.play('knockdown', 0.6);
      this.b.onNpcDeath(this);
    }
  }

  heal(x: number): void {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + x);
  }

  update(dt: number): void {
    const b = this.b;
    this.hurtT = Math.max(0, this.hurtT - dt);
    let moving = 0;
    if (this.alive) {
      const e = b.pool.nearest(this.pos.x, this.pos.z, this.fighter ? 7 : 6, 1);
      if (e) this.facing = lerpAngle(this.facing, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z), Math.min(1, dt * 6));
      if (this.fighter) {
        this.atkCd -= dt;
        if (e) {
          const d = e.pos.distanceTo(this.pos);
          if (d > 2.2 && this.pos.distanceTo(this.home) < 8) {
            const px = this.pos.x, pz = this.pos.z;
            this.pos.x += Math.sin(this.facing) * 4 * dt;
            this.pos.z += Math.cos(this.facing) * 4 * dt;
            b.env.resolve(this.pos, px, pz, 0.5);
            moving = 4;
          } else if (d <= 2.6 && this.atkCd <= 0) {
            this.atkCd = 1.1;
            this.anim.play(Math.random() < 0.5 ? 'slashR' : 'cross', 0.45);
            for (const s of b.pool.query(this.pos.x, this.pos.z, 3, 1)) b.damage.damageSoldier(s, 70, 'heavy', s.pos.x - this.pos.x, s.pos.z - this.pos.z, {});
            b.fx.slash(this.pos, this.facing, 2.8, 160, 0x60ffc0);
          }
        } else if (this.pos.distanceTo(this.home) > 1) {
          const yaw = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
          this.facing = lerpAngle(this.facing, yaw, Math.min(1, dt * 5));
          this.pos.x += Math.sin(yaw) * 3 * dt;
          this.pos.z += Math.cos(yaw) * 3 * dt;
          moving = 3;
        }
      }
    }
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    this.anim.speed01 = moving / 7;
    this.anim.update(dt);
    this.rig.flash(this.hurtT > 0 ? 0.7 : 0, 0xff4040);
    if (this.alive && Math.random() < dt * 4) b.fx.aura(this.pos, 0x60ff80, 0.5, 2);
  }

  dispose(): void {
    this.rig.root.removeFromParent();
    this.rig.dispose();
  }
}
