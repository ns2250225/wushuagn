import { Audio } from '../audio/AudioManager';
import type { Battle } from '../game/Battle';
import type { LevelDef, PhaseDef, WaveDef } from '../data/types';
import { BattleObjective } from './BattleObjective';

// 关卡管理：阶段推进、敌军分波次生成、战场事件、胜负判定

interface WaveState {
  def: WaveDef;
  next: number;
  fired: boolean;
}

export class LevelManager {
  phaseIdx = -1;
  phase: PhaseDef | null = null;
  objective: BattleObjective | null = null;
  private waves: WaveState[] = [];
  private phaseTime = 0;
  private transition = 0;
  finished = false;
  failedTimed = false;

  constructor(private b: Battle, public level: LevelDef) {}

  get tag(): number {
    return this.phaseIdx + 1;
  }

  start(): void {
    this.nextPhase();
  }

  private nextPhase(): void {
    this.phaseIdx++;
    if (this.phaseIdx >= this.level.phases.length) {
      this.finished = true;
      this.b.onVictory();
      return;
    }
    const ph = this.level.phases[this.phaseIdx];
    this.phase = ph;
    this.phaseTime = 0;
    this.waves = ph.waves.map((w) => ({ def: w, next: typeof w.at === 'number' ? w.at : 0, fired: false }));
    this.objective = new BattleObjective(this.b, ph.objective, this.tag);
    this.objective.start();
    for (const e of ph.events ?? []) this.runEvent(e);
    this.b.hud.objective(this.objective.text(), this.phaseIdx > 0);
  }

  private runEvent(e: NonNullable<PhaseDef['events']>[number]): void {
    const b = this.b;
    switch (e.type) {
      case 'message':
        b.hud.toast(e.text, e.style ?? 'info');
        break;
      case 'openGate':
        b.env.openGate(e.id);
        b.fx.shake.add(0.3);
        Audio.play('break', 0.6);
        break;
      case 'horn':
        Audio.play('horn');
        break;
      case 'allyBuff':
        b.buffAllies(b.player.pos, 30);
        break;
    }
  }

  private fireWave(w: WaveState): void {
    const d = w.def;
    this.b.spawner.spawnGroup(d.spawn[0], d.spawn[1], d.radius, d.units, d.ally ? 0 : 1, d.ally ? 0 : this.tag);
    if (d.message) this.b.hud.toast(d.message, d.ally ? 'good' : 'warn');
    if (!d.ally && Math.random() < 0.5) Audio.play('drum', 0.6);
  }

  private aliveTagged(): number {
    let n = 0;
    for (const s of this.b.pool.active) if (s.tag === this.tag && !s.dying) n++;
    return n + this.b.spawner.pendingTag(this.tag);
  }

  onEnemyKilled(): void {
    this.objective?.onKill();
  }

  update(dt: number): void {
    if (this.finished || !this.objective) return;
    if (this.transition > 0) {
      this.transition -= dt;
      if (this.transition <= 0) this.nextPhase();
      return;
    }
    this.phaseTime += dt;
    // 波次
    let allFired = true;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (w.def.at === 'cleared') {
        if (w.fired) continue;
        allFired = false;
        const prevDone = this.waves.slice(0, i).every((x) => x.fired);
        if (prevDone && this.phaseTime > 2 && this.aliveTagged() === 0) {
          w.fired = true;
          this.fireWave(w);
        }
        continue;
      }
      if (!w.fired || w.def.repeat) {
        if (this.phaseTime >= w.next) {
          w.fired = true;
          this.fireWave(w);
          if (w.def.repeat) w.next += w.def.repeat;
        }
      }
      if (!w.fired) allFired = false;
    }
    const obj = this.objective;
    const done = obj.update(dt, () => allFired && this.phaseTime > 2 && this.aliveTagged() === 0);
    this.b.hud.objectiveText(obj.text());
    if (obj.timedFailed) this.failedTimed = true;
    if (obj.failed) {
      this.finished = true;
      this.b.onDefeat(obj.npc ? `${obj.npc.name}阵亡` : '任务失败');
      return;
    }
    if (done) {
      Audio.play('uiConfirm');
      this.b.hud.toast('目标达成！', 'good');
      if (obj.npc) obj.npc.heal(obj.npc.maxHp);
      this.transition = 1.6;
      if (this.phaseIdx === this.level.phases.length - 1) this.transition = 0.6;
    }
  }
}
