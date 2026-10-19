import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import { DIFFICULTY, type Difficulty, type HeroDef, type LevelDef, type SceneId } from '../data/types';
import { SKILLS } from '../data/heroes';
import { SceneManager } from '../scene/SceneManager';
import { Environment, type Destructible } from '../scene/Environment';
import { LightingManager } from '../scene/LightingManager';
import { CameraController } from '../scene/CameraController';
import { EffectManager } from '../effects/EffectManager';
import { PlayerController } from '../characters/PlayerController';
import type { NpcController } from '../characters/NpcController';
import { EnemyPool, type Soldier } from '../enemies/EnemyPool';
import { SoldierRenderer } from '../enemies/SoldierRenderer';
import { EnemyAI } from '../enemies/EnemyAI';
import { EnemySpawner } from '../enemies/EnemySpawner';
import type { BossController } from '../enemies/BossController';
import { CombatSystem } from '../combat/CombatSystem';
import { DamageSystem } from '../combat/DamageSystem';
import { ComboSystem } from '../combat/ComboSystem';
import { SkillSystem } from '../combat/SkillSystem';
import { ProjectileSystem } from '../combat/Projectiles';
import { LevelManager } from '../levels/LevelManager';
import { HUD } from '../ui/HUD';
import type { InputManager } from '../controls/InputManager';
import type { TouchController } from '../controls/TouchController';
import { PickupSystem } from './Pickups';
import { GameState } from './GameState';
import { Perf } from './PerformanceManager';

// 一场战斗的全部运行时状态与子系统

export interface BattleStats {
  kills: number;
  officers: number;
  time: number;
  gold: number;
  xp: number;
  musouUsed: number;
  bossDamage: number;
}

export interface BattleResult {
  victory: boolean;
  reason: string;
  level: LevelDef;
  hero: HeroDef;
  difficulty: Difficulty;
  time: number;
  kills: number;
  maxCombo: number;
  damageTaken: number;
  hpRatio: number;
  rank: string;
  gold: number;
  xp: number;
  timedFailed: boolean;
}

type SceneBuilder = { build: (env: Environment, lv: LevelDef) => void };

// 关卡场景按需加载（代码分割）
const SCENE_LOADERS: Record<SceneId, () => Promise<SceneBuilder>> = {
  hulao: () => import('../levels/levels/hulao'),
  changban: () => import('../levels/levels/changban'),
  guandu: () => import('../levels/levels/guandu'),
  chibi: () => import('../levels/levels/chibi'),
  chengdu: () => import('../levels/levels/chengdu'),
  luoyang: () => import('../levels/levels/luoyang'),
};

interface Scheduled {
  t: number;
  fn: () => void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Battle {
  env!: Environment;
  lighting!: LightingManager;
  cam: CameraController;
  fx!: EffectManager;
  player!: PlayerController;
  pool = new EnemyPool(220);
  soldierRenderer!: SoldierRenderer;
  ai!: EnemyAI;
  spawner!: EnemySpawner;
  bosses: BossController[] = [];
  npcs: NpcController[] = [];
  combat!: CombatSystem;
  damage!: DamageSystem;
  combo = new ComboSystem();
  skills!: SkillSystem;
  projectiles!: ProjectileSystem;
  pickups!: PickupSystem;
  levelMgr!: LevelManager;
  hud!: HUD;
  diffCfg: (typeof DIFFICULTY)[Difficulty];
  stats: BattleStats = { kills: 0, officers: 0, time: 0, gold: 0, xp: 0, musouUsed: 0, bossDamage: 0 };
  attackersOnPlayer = 0;
  lockTarget: { pos: THREE.Vector3; alive: boolean } | null = null;
  timeScale = 1;
  paused = false;
  ended = false;
  private hitstopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private scheduled: Scheduled[] = [];
  private gameTime = 0;
  private crowdAcc = 0;
  private endTimer = -1;
  private endResult: BattleResult | null = null;
  private bossMusic = false;
  onEnd: ((r: BattleResult) => void) | null = null;

  constructor(
    public sm: SceneManager,
    public level: LevelDef,
    public hero: HeroDef,
    public diffKey: Difficulty,
    public input: InputManager,
    public touch: TouchController | null,
    private uiRoot: HTMLElement,
  ) {
    this.diffCfg = DIFFICULTY[diffKey];
    this.cam = new CameraController(sm.camera);
    this.cam.sensitivity = GameState.settings.cameraSensitivity;
    this.cam.invertY = GameState.settings.invertY;
  }

  get levelData(): LevelDef {
    return this.level;
  }

  async load(progress: (k: number, msg: string) => void): Promise<void> {
    const sm = this.sm;
    sm.clearScene();
    progress(0.05, '加载战场资源…');
    const builder = await SCENE_LOADERS[this.level.scene]();
    await nextFrame();
    progress(0.2, '构建方块战场…');
    this.env = new Environment(sm.scene);
    builder.build(this.env, this.level);
    await nextFrame();
    progress(0.45, '合批渲染建筑…');
    this.env.finalize();
    this.lighting = new LightingManager(sm.scene, this.env.lighting);
    await nextFrame();
    progress(0.6, '准备特效…');
    this.fx = new EffectManager(sm.scene, sm.camera);
    this.fx.shake.enabled = GameState.settings.screenShake;
    this.damage = new DamageSystem(this);
    this.combat = new CombatSystem(this);
    this.skills = new SkillSystem(this);
    this.projectiles = new ProjectileSystem(this, sm.scene);
    this.pickups = new PickupSystem(this, sm.scene);
    await nextFrame();
    progress(0.75, `${this.hero.name} 披挂上阵…`);
    const [sx, sz] = this.level.start;
    this.player = new PlayerController(this, this.hero, sx, sz);
    this.soldierRenderer = new SoldierRenderer(sm.scene, 220);
    this.ai = new EnemyAI(this);
    this.spawner = new EnemySpawner(this);
    this.hud = new HUD(this.uiRoot, this);
    this.hud.setVisible(false);
    this.fx.onFlash = (c, s) => this.hud.flash(c, s);
    this.combo.onMilestone = (n, l) => {
      this.hud.milestone(n, l);
      Audio.play('drum');
    };
    await nextFrame();
    progress(0.9, '布阵中…');
    this.levelMgr = new LevelManager(this, this.level);
    this.cam.snap(this.player.pos, 0);
    // 预热：渲染一帧以编译着色器
    this.soldierRenderer.update(this.pool, sm.camera, 0);
    sm.renderer.compile(sm.scene, sm.camera);
    await nextFrame();
    progress(1, '出阵！');
  }

  start(): void {
    this.hud.setVisible(true);
    this.levelMgr.start();
    Audio.playMusic('battle');
    Audio.startAmbient();
    this.hud.banner(this.level.name, 0xffd040, this.level.subtitle);
  }

  // ---------- 工具 ----------
  skillName(id: string): string {
    return SKILLS[id]?.name ?? '';
  }

  schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ t: this.gameTime + delay, fn });
  }

  hitstop(t: number): void {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  slowmo(scale: number, dur: number): void {
    if (!GameState.settings.slowMotion || Perf.profile.name === 'low') return;
    this.slowScale = scale;
    this.slowT = Math.max(this.slowT, dur);
  }

  vibrate(ms: number): void {
    if (!GameState.settings.vibration || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  perfFps(): number {
    return Perf.fps;
  }

  nearestEnemy(pos: THREE.Vector3, r: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bd = r * r;
    for (const bo of this.bosses) {
      if (!bo.alive) continue;
      const d = bo.pos.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = bo.pos;
      }
    }
    const s = this.pool.nearest(pos.x, pos.z, r, 1);
    if (s && s.pos.distanceToSquared(pos) < bd) best = s.pos;
    return best;
  }

  toggleLock(): void {
    if (this.lockTarget) {
      this.lockTarget = null;
      this.cam.lockTarget = null;
      this.touch?.setLocked(false);
      return;
    }
    const p = this.player.pos;
    let target: { pos: THREE.Vector3; alive: boolean } | null = null;
    let bd = 30 * 30;
    for (const bo of this.bosses) {
      if (!bo.alive || !bo.active) continue;
      const d = bo.pos.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        target = bo;
      }
    }
    if (!target) {
      let best: Soldier | null = null;
      let score = Infinity;
      for (const s of this.pool.query(p.x, p.z, 16, 1)) {
        const d = s.pos.distanceTo(p);
        const sc = d - (s.type.id === 'elite' ? 8 : s.type.id === 'heavy' ? 4 : 0);
        if (sc < score) {
          score = sc;
          best = s;
        }
      }
      target = best;
    }
    if (target) {
      this.lockTarget = target;
      this.cam.lockTarget = target.pos;
      this.touch?.setLocked(true);
      Audio.play('ui');
    }
  }

  engagedBoss(): BossController | null {
    let best: BossController | null = null;
    let bd = 35 * 35;
    for (const bo of this.bosses) {
      if (!bo.alive) continue;
      const d = bo.pos.distanceToSquared(this.player.pos);
      if (d < bd) {
        bd = d;
        best = bo;
      }
    }
    return best;
  }

  buffAllies(pos: THREE.Vector3, r: number): void {
    for (const s of this.pool.query(pos.x, pos.z, r, 0)) {
      s.hp = s.maxHp;
      s.atk *= 1.3;
      this.fx.aura(s.pos, 0xffe080, 0.4, 2);
    }
    for (const n of this.npcs) if (n.pos.distanceTo(pos) < r) n.heal(n.maxHp * 0.3);
  }

  announceBoss(bo: BossController): void {
    const isBoss = bo.def.tier === 'boss';
    this.hud.banner(isBoss ? `敌将 ${bo.name} 登场！` : `敌方副将 ${bo.name}`, bo.def.color, bo.def.title);
    Audio.play(isBoss ? 'horn' : 'drum');
    if (isBoss && !this.bossMusic) {
      this.bossMusic = true;
      Audio.playMusic('boss');
    }
  }

  // ---------- 事件回调 ----------
  onSoldierKilled(s: Soldier, byPlayer: boolean): void {
    if (s.team !== 1) return;
    this.stats.kills++;
    this.stats.xp += s.type.xp;
    this.stats.gold += s.type.gold;
    this.levelMgr.onEnemyKilled();
    if (this.lockTarget === s) this.toggleLock();
    if (byPlayer && this.player.alive) this.player.addMusou(0.5);
    const r = Math.random();
    if (s.type.id === 'elite' || s.type.id === 'heavy') {
      if (r < 0.55) this.pickups.drop(['meat', 'wine', 'power', 'shield'][Math.floor(Math.random() * 4)] as any, s.pos);
      this.pickups.drop('gold', s.pos, 20);
    } else if (r < 0.025) this.pickups.drop(Math.random() < 0.6 ? 'meat' : 'wine', s.pos);
    else if (r < 0.06) this.pickups.drop('gold', s.pos, 10);
    if (this.stats.kills % 100 === 0) {
      this.hud.banner(`${this.stats.kills} 人斩！`, 0xff6040);
      Audio.play('drum');
    }
  }

  onBossDefeated(bo: BossController): void {
    this.stats.officers++;
    this.stats.gold += bo.def.tier === 'boss' ? 300 : 150;
    this.stats.xp += bo.def.tier === 'boss' ? 300 : 150;
    this.hud.banner(`敌将 ${bo.name} 击破！`, 0xffd040, '敌军士气大跌');
    Audio.play('horn');
    if (this.lockTarget === bo) this.toggleLock();
    for (const k of ['meat', 'wine', 'power'] as const) this.pickups.drop(k, bo.pos);
    this.pickups.drop('gold', bo.pos, 100);
    // 敌将阵亡，附近士兵士气崩溃
    for (const s of this.pool.query(bo.pos.x, bo.pos.z, 14, 1)) s.fear = 3;
  }

  onDestructibleDestroyed(d: Destructible): void {
    this.hud.toast(`摧毁了${d.name}！`, 'good');
    this.stats.gold += 50;
  }

  onNpcDeath(n: NpcController): void {
    this.hud.toast(`${n.name}倒下了……`, 'warn');
  }

  onPlayerDeath(): void {
    if (this.ended) return;
    this.hud.banner('战败……', 0xff4040);
    this.finish(false, `${this.hero.name}力竭倒下`, 2.8);
  }

  onVictory(): void {
    if (this.ended) return;
    this.player.victory();
    this.hud.banner('胜利！', 0xffd040, this.level.name + ' 完成');
    Audio.playMusic('victory');
    this.finish(true, '', 3.2);
    // 胜利时剩余敌兵溃散
    for (const s of this.pool.active) if (s.team === 1) s.fear = 10;
  }

  onDefeat(reason: string): void {
    if (this.ended) return;
    this.hud.banner('任务失败', 0xff4040, reason);
    this.finish(false, reason, 2.8);
  }

  private finish(victory: boolean, reason: string, delay: number): void {
    this.ended = true;
    if (!victory) Audio.playMusic('defeat');
    Audio.stopAmbient();
    const p = this.player;
    const hpRatio = p.hp / p.maxHp;
    const timedFailed = this.levelMgr.failedTimed;
    let pts = 0;
    if (this.stats.time <= this.level.parTime) pts += 2;
    else if (this.stats.time <= this.level.parTime * 1.4) pts += 1;
    if (this.stats.kills >= 300) pts += 2;
    else if (this.stats.kills >= 150) pts += 1;
    if (hpRatio >= 0.7) pts += 2;
    else if (hpRatio >= 0.4) pts += 1;
    if (this.combo.best >= 150) pts += 1;
    if (timedFailed) pts -= 1;
    const rank = !victory ? '-' : pts >= 6 ? 'S' : pts >= 4 ? 'A' : pts >= 2 ? 'B' : 'C';
    const rankMul: Record<string, number> = { S: 1.5, A: 1.25, B: 1.1, C: 1, '-': 0.3 };
    const dr = this.diffCfg.reward;
    const gold = Math.round((victory ? this.level.rewards.gold * dr * rankMul[rank] : 0) + this.stats.gold * (victory ? 1 : 0.5));
    const xp = Math.round((victory ? this.level.rewards.xp * dr : this.level.rewards.xp * 0.2) + this.stats.xp * dr);
    this.endResult = {
      victory, reason, level: this.level, hero: this.hero, difficulty: this.diffKey, time: this.stats.time, kills: this.stats.kills,
      maxCombo: this.combo.best, damageTaken: p.damageTaken, hpRatio, rank, gold, xp, timedFailed,
    };
    this.endTimer = delay;
  }

  // ---------- 主循环 ----------
  update(dt: number): void {
    if (this.paused) return;
    const inp = this.input.sample();
    this.gameTime += dt;
    if (!this.ended) this.stats.time += dt;
    // 计划任务
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (this.scheduled[i].t <= this.gameTime) {
        const s = this.scheduled[i];
        this.scheduled.splice(i, 1);
        s.fn();
      }
    }
    this.player.update(dt, inp, this.cam.yaw);
    this.ai.update(dt);
    for (const bo of this.bosses) bo.update(dt);
    for (const n of this.npcs) n.update(dt);
    this.projectiles.update(dt);
    this.pickups.update(dt);
    this.spawner.update(dt);
    if (!this.ended) this.levelMgr.update(dt);
    this.combo.update(dt);
    this.fx.update(dt);
    this.env.update(dt, this.fx, this.player.pos);
    if (this.lockTarget && !this.lockTarget.alive) this.toggleLock();
    // 根据敌军密度调整镜头距离
    this.crowdAcc += dt;
    if (this.crowdAcc > 0.5) {
      this.crowdAcc = 0;
      this.cam.setCrowd(this.pool.query(this.player.pos.x, this.player.pos.z, 10, 1).length);
    }
    this.input.clearEdges();
  }

  // 每个渲染帧（真实时间）
  render(frameDt: number): void {
    // 顿帧与慢动作
    if (this.hitstopT > 0) {
      this.hitstopT -= frameDt;
      this.timeScale = 0.08;
    } else if (this.slowT > 0) {
      this.slowT -= frameDt;
      this.timeScale = this.slowScale;
    } else this.timeScale = 1;
    if (this.paused) this.timeScale = 0;
    const [dx, dy] = this.input.takeCamera();
    if (!this.paused) this.cam.rotate(dx, dy);
    this.cam.update(frameDt, this.player.pos, this.env, this.fx.shake);
    this.lighting.follow(this.player.pos);
    this.soldierRenderer.update(this.pool, this.sm.camera, this.gameTime);
    this.hud.update(frameDt, this.sm.camera);
    this.sm.render();
    if (this.endTimer > 0 && !this.paused) {
      this.endTimer -= frameDt;
      if (this.endTimer <= 0 && this.endResult) this.onEnd?.(this.endResult);
    }
  }

  applyQuality(): void {
    this.lighting.applyQuality();
    this.soldierRenderer.mesh.castShadow = Perf.profile.shadows && Perf.profile.name !== 'low';
  }

  dispose(): void {
    Audio.stopAmbient();
    this.player.dispose();
    for (const b of this.bosses) b.dispose();
    for (const n of this.npcs) n.dispose();
    this.projectiles.clear();
    this.fx.clear();
    this.pool.clear();
    this.spawner.clear();
    this.soldierRenderer.dispose();
    this.hud.dispose();
    this.sm.clearScene();
  }
}
