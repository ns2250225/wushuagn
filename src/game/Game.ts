import * as THREE from 'three';
import { Audio } from '../audio/AudioManager';
import { HEROES, heroById } from '../data/heroes';
import { LEVELS, ACHIEVEMENTS, levelById } from '../data/levels';
import { gearById } from '../data/items';
import type { Difficulty } from '../data/types';
import { SceneManager } from '../scene/SceneManager';
import { blockMat, colorMat, flagTexture, skyTexture } from '../scene/textures';
import { EffectManager } from '../effects/EffectManager';
import { buildCharacter, type CharacterRig } from '../characters/CharacterFactory';
import { AnimationController } from '../characters/AnimationController';
import { InputManager } from '../controls/InputManager';
import { KeyboardController } from '../controls/KeyboardController';
import { TouchController } from '../controls/TouchController';
import { Menu, TIPS, type MenuHost } from '../ui/Menu';
import { RotateOverlay, requestLandscape, toggleFullscreen } from '../ui/RotateOverlay';
import { renderResult, type ResultExtras } from '../ui/ResultScreen';
import { Battle, type BattleResult } from './Battle';
import { GameLoop } from './GameLoop';
import { GameState } from './GameState';
import { Perf, isTouchDevice } from './PerformanceManager';

type Mode = 'menu' | 'loading' | 'battle' | 'result';

const RANK_ORDER = ['C', 'B', 'A', 'S'];

export class Game implements MenuHost {
  sm: SceneManager;
  loop: GameLoop;
  input = new InputManager();
  keyboard: KeyboardController;
  touch: TouchController | null = null;
  menu: Menu;
  rotate: RotateOverlay;
  battle: Battle | null = null;
  mode: Mode = 'menu';
  private ui: HTMLElement;
  private menuRig: { rig: CharacterRig; anim: AnimationController; id: string } | null = null;
  private menuFx: EffectManager | null = null;
  private menuT = 0;
  private menuDemoT = 2;
  private menuBuilt = false;
  private last: { level: string; hero: string; diff: Difficulty } | null = null;
  private orientationPaused = false;
  private gestured = false;
  private appliedQuality = '';
  private lastPauseAt = 0;

  constructor(container: HTMLElement) {
    GameState.load();
    const s = GameState.settings;
    Perf.apply(s.quality, s.autoAdjust);
    this.appliedQuality = s.quality;
    this.sm = new SceneManager(container);
    this.ui = document.createElement('div');
    this.ui.className = 'ui-root';
    container.appendChild(this.ui);
    this.keyboard = new KeyboardController(this.input, this.sm.canvas);
    this.keyboard.onPause = () => {
      if (performance.now() - this.lastPauseAt < 350) return;
      this.togglePause();
    };
    this.keyboard.onUnlock = () => {
      if (this.mode === 'battle' && this.battle && !this.battle.paused && !this.battle.ended) this.pause();
    };
    if (isTouchDevice()) {
      this.touch = new TouchController(this.input, this.ui);
      this.touch.setVisible(false);
    }
    this.menu = new Menu(this.ui, this);
    this.rotate = new RotateOverlay(container);
    this.rotate.onChange = (p) => this.onOrientation(p);
    Perf.onChange = () => {
      this.sm.applyQuality();
      this.battle?.applyQuality();
    };
    this.loop = new GameLoop((dt) => this.update(dt), (f) => this.render(f));
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.onResize(), 100));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => GameState.save());
    this.applySettings();
    this.buildMenuScene();
    this.menu.title();
    this.loop.start();
  }

  // ---------- MenuHost ----------
  userGesture(): void {
    Audio.init();
    if (!this.gestured) {
      this.gestured = true;
      if (this.mode === 'menu') Audio.playMusic('menu');
    }
  }

  fullscreen(): void {
    toggleFullscreen();
  }

  rebindKey(cb: (code: string) => void): void {
    this.keyboard.rebinding = cb;
  }

  applySettings(): void {
    const s = GameState.settings;
    Audio.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
    if (this.appliedQuality !== s.quality || Perf.autoAdjust !== s.autoAdjust) {
      this.appliedQuality = s.quality;
      Perf.apply(s.quality, s.autoAdjust);
    }
    this.touch?.applySettings();
    if (this.battle) {
      this.battle.fx.shake.enabled = s.screenShake;
      this.battle.cam.sensitivity = s.cameraSensitivity;
      this.battle.cam.invertY = s.invertY;
    }
  }

  editTouchLayout(done: () => void): void {
    if (!this.touch) {
      // 桌面端临时创建触屏控件以便预览布局
      this.touch = new TouchController(this.input, this.ui);
    }
    this.touch.enterEditMode(() => {
      if (!isTouchDevice() || this.mode !== 'battle') this.touch!.setVisible(false);
      done();
    });
  }

  previewHero(id: string | null): void {
    if (!this.menuBuilt) this.buildMenuScene();
    if (!id) {
      if (this.menuRig) this.menuRig.rig.root.visible = false;
      return;
    }
    if (this.menuRig?.id === id) {
      this.menuRig.rig.root.visible = true;
      return;
    }
    if (this.menuRig) {
      this.menuRig.rig.root.removeFromParent();
      this.menuRig.rig.dispose();
    }
    const h = heroById(id);
    const rig = buildCharacter(h.look, h.weaponType);
    rig.root.position.set(0, 0.5, 0);
    rig.root.rotation.y = 0.5;
    this.sm.scene.add(rig.root);
    const anim = new AnimationController(rig, h.weaponType);
    anim.play('victory', 0.6);
    this.menuRig = { rig, anim, id };
    this.menuDemoT = 1.5;
    this.menuFx?.ring(new THREE.Vector3(0, 0.5, 0), 0.3, 2.2, h.color, 0.5);
  }

  startBattle(levelId: string, heroId: string, diff: Difficulty): void {
    this.userGesture();
    if (isTouchDevice()) requestLandscape(true);
    void this.launch(levelId, heroId, diff);
  }

  private async launch(levelId: string, heroId: string, diff: Difficulty): Promise<void> {
    this.mode = 'loading';
    this.last = { level: levelId, hero: heroId, diff };
    this.menu.setSelection(levelId, heroId, diff);
    const lv = levelById(levelId);
    const prog = this.menu.loading(lv.name, '提示：' + TIPS[Math.floor(Math.random() * TIPS.length)]);
    Audio.playMusic('none');
    this.disposeMenuScene();
    const hero = heroById(heroId);
    const b = new Battle(this.sm, lv, hero, diff, this.input, this.touch, this.ui);
    try {
      await b.load(prog);
    } catch (e) {
      console.error(e);
      prog(1, '加载失败，请刷新重试');
      return;
    }
    this.battle = b;
    b.onEnd = (r) => this.endBattle(r);
    b.hud.onPause = () => this.togglePause();
    this.menu.hide();
    this.input.releaseAll();
    this.keyboard.active = true;
    this.showTouch(true);
    this.touch?.applySettings();
    this.mode = 'battle';
    this.loop.resetClock();
    b.start();
    if (this.rotate.portrait) this.onOrientation(true);
  }

  togglePause(): void {
    if (this.mode !== 'battle' || !this.battle) return;
    if (this.battle.paused) this.resume();
    else this.pause();
  }

  private pause(): void {
    const b = this.battle;
    if (!b || b.paused) return;
    b.paused = true;
    this.lastPauseAt = performance.now();
    this.keyboard.releasePointer();
    this.input.releaseAll();
    this.showTouch(false);
    this.menu.pause();
  }

  resume(): void {
    const b = this.battle;
    if (!b) return;
    if (this.rotate.portrait) return;
    this.menu.hide();
    b.paused = false;
    this.orientationPaused = false;
    this.input.releaseAll();
    this.input.clearEdges();
    this.showTouch(true);
    this.loop.resetClock();
  }

  private showTouch(v: boolean): void {
    this.touch?.setVisible(v && isTouchDevice());
  }

  restart(): void {
    if (!this.last) return;
    const l = this.last;
    this.disposeBattle();
    void this.launch(l.level, l.hero, l.diff);
  }

  quitToMenu(): void {
    this.disposeBattle();
    this.toMenu();
  }

  private toMenu(): void {
    this.mode = 'menu';
    this.keyboard.active = false;
    this.showTouch(false);
    this.buildMenuScene();
    this.menu.title();
    Audio.playMusic('menu');
  }

  private disposeBattle(): void {
    if (!this.battle) return;
    this.battle.dispose();
    this.battle = null;
    this.keyboard.releasePointer();
    this.input.releaseAll();
  }

  // ---------- 结算 ----------
  private endBattle(r: BattleResult): void {
    const extras = this.applyResult(r);
    this.keyboard.releasePointer();
    this.keyboard.active = false;
    this.showTouch(false);
    this.battle!.hud.setVisible(false);
    this.mode = 'result';
    const el = this.menu.result();
    renderResult(el, r, extras, (a) => {
      Audio.play('ui');
      const idx = LEVELS.findIndex((l) => l.id === r.level.id);
      this.disposeBattle();
      if (a === 'retry') void this.launch(r.level.id, r.hero.id, r.difficulty);
      else if (a === 'next' && LEVELS[idx + 1]) void this.launch(LEVELS[idx + 1].id, r.hero.id, r.difficulty);
      else this.toMenu();
    });
  }

  private applyResult(r: BattleResult): ResultExtras {
    const g = GameState.data;
    const hp = GameState.hero(r.hero.id);
    const lvBefore = hp.level;
    const ups = GameState.addXp(r.hero.id, r.xp);
    g.gold += r.gold;
    hp.kills += r.kills;
    g.totalKills += r.kills;
    const newBestCombo = r.maxCombo > hp.bestCombo;
    hp.bestCombo = Math.max(hp.bestCombo, r.maxCombo);
    g.bestCombo = Math.max(g.bestCombo, r.maxCombo);
    let unlocked: string | null = null;
    let item: string | null = null;
    const achs: string[] = [];
    const ach = (id: string) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      if (GameState.unlockAchievement(id, a.gold)) achs.push(`${a.name}（+${a.gold}金）`);
    };
    if (r.victory) {
      hp.mastery = Math.min(20, hp.mastery + 1);
      const rec = (g.levels[r.level.id] ??= { cleared: false, bestRank: 'C', bestTime: 99999, clears: {} });
      rec.cleared = true;
      if (RANK_ORDER.indexOf(r.rank) > RANK_ORDER.indexOf(rec.bestRank)) rec.bestRank = r.rank;
      rec.bestTime = Math.min(rec.bestTime, r.time);
      rec.clears[r.difficulty] = true;
      if (r.level.unlockHero && !g.unlockedHeroes.includes(r.level.unlockHero)) {
        g.unlockedHeroes.push(r.level.unlockHero);
        unlocked = heroById(r.level.unlockHero).name;
      }
      if (r.level.rewards.item && !g.ownedGear.includes(r.level.rewards.item)) {
        g.ownedGear.push(r.level.rewards.item);
        item = gearById(r.level.rewards.item)?.name ?? null;
      }
      ach('first_clear');
      if (r.hpRatio >= 0.9) ach('nodamage');
      if (r.rank === 'S') ach('rankS');
      if (r.difficulty === 'chaos') ach('chaos');
      if (GameState.campaignCleared()) ach('campaign');
      if (g.unlockedHeroes.length >= HEROES.length) ach('allheroes');
    }
    if (r.kills >= 100) ach('kill100');
    if (r.kills >= 300) ach('kill300');
    if (r.maxCombo >= 100) ach('combo100');
    if (r.maxCombo >= 300) ach('combo300');
    if (hp.level >= 30) ach('lv30');
    GameState.save();
    if (ups > 0) Audio.play('levelup');
    const idx = LEVELS.findIndex((l) => l.id === r.level.id);
    return { levelUps: hp.level - lvBefore, newLevel: hp.level, unlockedHero: unlocked, item, achievements: achs, hasNext: idx < LEVELS.length - 1 && GameState.isLevelUnlocked(idx + 1), newBestCombo };
  }

  // ---------- 系统事件 ----------
  private onResize(): void {
    this.sm.resize();
    this.touch?.applySettings();
    this.rotate.update();
  }

  private onOrientation(portrait: boolean): void {
    this.sm.resize();
    const b = this.battle;
    if (!b || this.mode !== 'battle') return;
    if (portrait) {
      // 竖屏：冻结战斗模拟
      if (!b.paused) {
        this.orientationPaused = true;
        b.paused = true;
        this.input.releaseAll();
        this.showTouch(false);
      }
    } else if (this.orientationPaused) {
      this.orientationPaused = false;
      b.paused = false;
      this.showTouch(true);
      this.loop.resetClock();
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      // 切后台 / 锁屏：安全暂停
      Audio.suspend();
      if (this.mode === 'battle') this.pause();
      GameState.save();
    } else {
      Audio.resume();
      this.loop.resetClock();
    }
  }

  // ---------- 循环 ----------
  private update(dt: number): void {
    this.keyboard.tick(dt);
    if (this.mode === 'battle' && this.battle) this.battle.update(dt);
    else if (this.mode === 'menu') this.updateMenu(dt);
  }

  private render(frameDt: number): void {
    Perf.sample(frameDt);
    if ((this.mode === 'battle' || this.mode === 'result') && this.battle) {
      this.battle.render(frameDt);
      this.loop.timeScale = this.mode === 'result' ? 1 : this.battle.timeScale;
    } else if (this.mode === 'menu') {
      this.loop.timeScale = 1;
      this.sm.render();
    }
  }

  // ---------- 菜单 3D 展示场景 ----------
  private buildMenuScene(): void {
    if (this.menuBuilt) return;
    this.menuBuilt = true;
    const s = this.sm.scene;
    this.sm.clearScene();
    this.menuRig = null;
    s.background = skyTexture(0x2a1a3a, 0xd08050);
    s.fog = new THREE.Fog(0x8a5a50, 18, 60);
    s.add(new THREE.HemisphereLight(0xffe0c0, 0x402a20, 1.2));
    const sun = new THREE.DirectionalLight(0xffd0a0, 2.2);
    sun.position.set(-4, 8, 6);
    s.add(sun);
    const box = new THREE.BoxGeometry(1, 1, 1);
    // 方块擂台
    const stone = blockMat('brick');
    const red = blockMat('red');
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        const m = new THREE.Mesh(box, Math.abs(x) === 3 || Math.abs(z) === 3 ? red : stone);
        m.position.set(x, 0, z);
        s.add(m);
      }
    const gt = blockMat('grassTop').map!.clone();
    gt.repeat.set(200, 200);
    gt.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: gt, color: 0xa0a070 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    s.add(ground);
    // 战旗与远景兵阵
    const flagCols = [0x1f8a3c, 0xc02020, 0x1a3a9a, 0xd0a010];
    const chars = ['蜀', '吴', '魏', '群'];
    for (let i = 0; i < 4; i++) {
      const x = -8 + i * 5.3;
      const pole = new THREE.Mesh(box, colorMat(0x6a4a2a));
      pole.scale.set(0.2, 7, 0.2);
      pole.position.set(x, 3, -9);
      s.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshLambertMaterial({ map: flagTexture(flagCols[i], chars[i]), side: THREE.DoubleSide }));
      f.position.set(x + 0.95, 5.2, -9);
      s.add(f);
    }
    const army = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.8, 0.4), new THREE.MeshLambertMaterial({ color: 0x3a3040 }), 240);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < 240; i++) {
      mm.makeTranslation(-24 + (i % 40) * 1.2, 0.4, -18 - Math.floor(i / 40) * 1.5);
      army.setMatrixAt(i, mm);
    }
    s.add(army);
    this.menuFx = new EffectManager(s, this.sm.camera);
    this.sm.camera.position.set(0, 2.6, 7.5);
    this.sm.camera.lookAt(0, 1.6, 0);
    if (this.menuRig === null && this.mode === 'menu') this.previewHero(GameState.data.lastHero);
  }

  private disposeMenuScene(): void {
    if (this.menuRig) {
      this.menuRig.rig.dispose();
      this.menuRig = null;
    }
    this.menuFx?.clear();
    this.menuFx = null;
    this.sm.clearScene();
    this.menuBuilt = false;
  }

  private updateMenu(dt: number): void {
    this.menuT += dt;
    const r = this.menuRig;
    if (r) {
      r.rig.root.rotation.y = 0.4 + Math.sin(this.menuT * 0.4) * 0.5;
      this.menuDemoT -= dt;
      if (this.menuDemoT <= 0) {
        // 展示武将招式
        const h = heroById(r.id);
        const moves = [...h.combo, h.heavy];
        const m = moves[Math.floor(Math.random() * moves.length)];
        if (m.swing === 'flurry') r.anim.playFlurry(m.dur * 1.4, 5);
        else r.anim.play(m.swing, m.dur * 1.4);
        const pos = new THREE.Vector3(0, 0.5, 0);
        this.menuFx?.slash(pos, r.rig.root.rotation.y, m.range * 0.8, Math.min(360, m.arc), h.color, { life: 0.3 });
        this.menuDemoT = 2.2 + Math.random();
      }
      r.anim.update(dt);
      if (Math.random() < dt * 8) this.menuFx?.aura(new THREE.Vector3(0, 0.5, 0), heroById(r.id).color, 0.8, 2.4);
    }
    this.menuFx?.update(dt);
    const cam = this.sm.camera;
    cam.position.set(Math.sin(this.menuT * 0.1) * 0.6, 2.6, 7.5);
    cam.lookAt(0, 1.7, 0);
  }
}
