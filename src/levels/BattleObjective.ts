import * as THREE from 'three';
import type { ObjectiveDef } from '../data/types';
import type { Battle } from '../game/Battle';
import { BOSSES } from '../data/enemies';
import { BossController } from '../enemies/BossController';
import { NpcController } from '../characters/NpcController';

// 战场目标：击杀数量 / 清除波次 / 击败敌将 / 摧毁目标 / 保护友军 / 抵达地点 / 限时击杀

export class BattleObjective {
  done = false;
  failed = false;
  timedFailed = false;
  kills = 0;
  time = 0;
  boss: BossController | null = null;
  npc: NpcController | null = null;
  private tag: number;

  constructor(private b: Battle, public def: ObjectiveDef, tag: number) {
    this.tag = tag;
  }

  start(): void {
    const b = this.b;
    const d = this.def;
    if (d.type === 'defeat') {
      const bd = BOSSES[d.boss];
      const mirror = !!bd.heroRef && bd.heroRef === b.player.hero.id;
      const boss = new BossController(b, bd, d.pos[0], d.pos[1], mirror);
      boss.onDefeated = (bo) => b.onBossDefeated(bo);
      b.bosses.push(boss);
      this.boss = boss;
      if (d.guards) b.spawner.spawnGroup(d.pos[0], d.pos[1] - 3, 6, d.guards, 1, this.tag);
      b.announceBoss(boss);
    } else if (d.type === 'protect') {
      const n = new NpcController(b, d.npc, d.pos[0], d.pos[1]);
      b.npcs.push(n);
      this.npc = n;
    }
  }

  onKill(): void {
    this.kills++;
  }

  get markers(): THREE.Vector3[] {
    const d = this.def;
    const out: THREE.Vector3[] = [];
    switch (d.type) {
      case 'defeat':
        if (this.boss?.alive) out.push(this.boss.pos);
        break;
      case 'destroy':
        for (const id of d.targets) {
          const t = this.b.env.getDestructible(id);
          if (t?.alive) out.push(t.pos);
        }
        break;
      case 'protect':
        if (this.npc) out.push(this.npc.pos);
        break;
      case 'reach':
        out.push(new THREE.Vector3(d.pos[0], 0, d.pos[1]));
        break;
    }
    return out;
  }

  text(): string {
    const d = this.def;
    switch (d.type) {
      case 'killCount':
        return d.text.replace('{n}', String(Math.min(this.kills, d.count))).replace('{t}', String(d.count));
      case 'timedKill': {
        const left = Math.max(0, Math.ceil(d.time - this.time));
        const base = d.text.replace('{n}', String(Math.min(this.kills, d.count))).replace('{t}', String(d.count));
        return this.timedFailed ? base.replace('{s}', '0') + '（超时）' : base.replace('{s}', String(left));
      }
      case 'destroy': {
        const n = d.targets.filter((id) => !this.b.env.getDestructible(id)?.alive).length;
        return d.text.replace('{n}', String(n)).replace('{t}', String(d.targets.length));
      }
      case 'protect': {
        const left = Math.max(0, Math.ceil(d.duration - this.time));
        return d.text.replace('{s}', String(left));
      }
      default:
        return d.text;
    }
  }

  // 返回 true 表示完成
  update(dt: number, clearCheck: () => boolean): boolean {
    if (this.done) return true;
    this.time += dt;
    const d = this.def;
    const b = this.b;
    switch (d.type) {
      case 'killCount':
        this.done = this.kills >= d.count;
        break;
      case 'timedKill':
        if (!this.timedFailed && this.time > d.time && this.kills < d.count) {
          this.timedFailed = true;
          b.hud.toast('限时任务失败！评价将降低', 'warn');
        }
        this.done = this.kills >= d.count;
        break;
      case 'clearWaves':
        this.done = clearCheck();
        break;
      case 'defeat':
        this.done = !!this.boss && !this.boss.alive;
        break;
      case 'destroy':
        this.done = d.targets.every((id) => !b.env.getDestructible(id)?.alive);
        break;
      case 'protect':
        if (this.npc && !this.npc.alive) this.failed = true;
        this.done = this.time >= d.duration && !this.failed;
        break;
      case 'reach':
        this.done = Math.hypot(b.player.pos.x - d.pos[0], b.player.pos.z - d.pos[1]) < d.radius;
        break;
    }
    return this.done;
  }
}
