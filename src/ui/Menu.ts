import { Audio } from '../audio/AudioManager';
import { HEROES, SKILLS, heroById } from '../data/heroes';
import { LEVELS, ACHIEVEMENTS } from '../data/levels';
import { DIFFICULTY, type Difficulty, type HeroDef, type Stats } from '../data/types';
import { WEAPONS, GEAR, ELEMENT_INFO, MAX_FORGE, forgeCost, forgeAtk, weaponById, gearById } from '../data/items';
import { GameState, DEFAULT_KEYS, type KeyBindings, type QualityLevel } from '../game/GameState';
import { keyLabel } from '../controls/KeyboardController';
import { isTouchDevice } from '../game/PerformanceManager';
import { fullscreenSupported } from './RotateOverlay';

// 菜单界面（原生 DOM）：首页、武将选择、战场与难度选择、武将养成与装备、设置、战绩成就、暂停

export interface MenuHost {
  startBattle(levelId: string, heroId: string, diff: Difficulty): void;
  previewHero(heroId: string | null): void;
  resume(): void;
  restart(): void;
  quitToMenu(): void;
  applySettings(): void;
  editTouchLayout(done: () => void): void;
  fullscreen(): void;
  rebindKey(cb: (code: string) => void): void;
  userGesture(): void;
}

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const STAT_NAMES: Array<[keyof Stats, string, number]> = [
  ['hp', '生命', 2000],
  ['atk', '攻击', 300],
  ['def', '防御', 200],
  ['spd', '移速', 10],
  ['aspd', '攻速', 1.6],
  ['range', '范围', 1.6],
  ['musou', '无双', 1.6],
  ['crit', '暴击', 0.4],
];

function fmtStat(k: keyof Stats, v: number): string {
  if (k === 'crit') return Math.round(v * 100) + '%';
  if (k === 'aspd' || k === 'range' || k === 'musou') return Math.round(v * 100) + '%';
  if (k === 'spd') return v.toFixed(1);
  return String(Math.round(v));
}

export class Menu {
  el: HTMLDivElement;
  private selHero: string;
  private selLevel: string;
  private selDiff: Difficulty;
  private armoryTab: 'weapon' | 'armor' | 'accessory' = 'weapon';
  private settingsBack: 'title' | 'pause' = 'title';

  constructor(root: HTMLElement, private host: MenuHost) {
    this.el = document.createElement('div');
    this.el.className = 'menu';
    root.appendChild(this.el);
    this.selHero = GameState.data.lastHero;
    this.selDiff = GameState.data.lastDifficulty;
    this.selLevel = LEVELS[0].id;
    for (let i = 0; i < LEVELS.length; i++) if (GameState.isLevelUnlocked(i)) this.selLevel = LEVELS[i].id;
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button, .clickable');
      if (t) {
        Audio.play('ui');
        host.userGesture();
      }
    });
  }

  hide(): void {
    this.el.innerHTML = '';
    this.el.style.display = 'none';
  }

  private show(html: string, cls = ''): void {
    this.el.style.display = 'flex';
    this.el.className = 'menu ' + cls;
    this.el.innerHTML = html;
  }

  private on(sel: string, fn: (el: HTMLElement) => void): void {
    this.el.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el as HTMLElement)));
  }

  // ---------------- 首页 ----------------
  title(): void {
    this.host.previewHero(this.selHero);
    const g = GameState.data;
    this.show(`
      <div class="title-screen">
        <div class="logo"><span>方块</span>三国无双<small>BLOCK DYNASTY WARRIORS</small></div>
        <div class="title-menu">
          <button class="btn primary big" data-a="start">开始游戏</button>
          <button class="btn" data-a="armory">武将养成</button>
          <button class="btn" data-a="records">战绩与成就</button>
          <button class="btn" data-a="settings">设置</button>
          ${fullscreenSupported() ? '<button class="btn" data-a="fs">全屏模式</button>' : ''}
        </div>
        <div class="title-foot">金币 <b>${g.gold}</b> · 已解锁武将 ${g.unlockedHeroes.length}/${HEROES.length} · 总击破 ${g.totalKills}${GameState.recovered ? ' · <span class="warn">存档已从备份恢复</span>' : ''}</div>
        <div class="title-tip">${isTouchDevice() ? '横屏游玩 · 左侧摇杆移动，右侧按钮战斗' : 'WASD 移动 · J/左键 普攻 · K/右键 重击（长按蓄力） · U/I 技能 · O 无双 · 空格 闪避 · Tab 锁定'}</div>
      </div>`, 'm-title');
    this.on('[data-a=start]', () => this.heroSelect());
    this.on('[data-a=armory]', () => this.armory(this.selHero));
    this.on('[data-a=records]', () => this.records());
    this.on('[data-a=settings]', () => {
      this.settingsBack = 'title';
      this.settings();
    });
    this.on('[data-a=fs]', () => this.host.fullscreen());
  }

  // ---------------- 武将选择 ----------------
  heroSelect(): void {
    const g = GameState.data;
    const h = heroById(this.selHero);
    if (!g.unlockedHeroes.includes(h.id)) this.selHero = g.unlockedHeroes[0];
    this.host.previewHero(this.selHero);
    const hero = heroById(this.selHero);
    const st = GameState.computeStats(hero);
    const prog = GameState.hero(hero.id);
    const cards = HEROES.map((x) => {
      const un = g.unlockedHeroes.includes(x.id);
      const lv = LEVELS.find((l) => l.id === x.unlock);
      return `<div class="hero-card clickable ${x.id === hero.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-h="${x.id}" style="--c:${css(x.color)}">
        <b>${x.name[0]}</b><span>${x.name}</span>${un ? `<em>Lv${GameState.hero(x.id).level}</em>` : `<em>通关「${lv?.name ?? ''}」解锁</em>`}</div>`;
    }).join('');
    this.show(`
      <div class="panel left">
        <h2>选择武将</h2>
        <div class="hero-grid">${cards}</div>
      </div>
      <div class="panel right hero-info" style="--c:${css(hero.color)}">
        <div class="hi-name">${hero.name}<small>字${hero.courtesy} · ${hero.title}</small></div>
        <div class="tags"><span>${hero.faction}</span><span>${hero.role}</span><span>难度 ${'★'.repeat(hero.difficulty)}${'☆'.repeat(5 - hero.difficulty)}</span><span>Lv${prog.level}</span></div>
        <p>${hero.desc}</p>
        <div class="weapon-line">武器：<b>${weaponById(prog.weapon)?.name ?? hero.weaponName}</b>${st.element !== 'none' ? ` <i style="color:${css(ELEMENT_INFO[st.element as keyof typeof ELEMENT_INFO].color)}">【${ELEMENT_INFO[st.element as keyof typeof ELEMENT_INFO].name}】</i>` : ''}</div>
        ${this.statBars(st)}
        <div class="skill-list">
          ${hero.skills.map((s, i) => `<div><b>技能${i + 1}·${SKILLS[s].name}</b><span>${SKILLS[s].desc}</span></div>`).join('')}
          <div class="mu"><b>无双·${SKILLS[hero.musou].name}</b><span>${SKILLS[hero.musou].desc}</span></div>
        </div>
        <div class="actions">
          <button class="btn" data-a="back">返回</button>
          <button class="btn" data-a="armory">养成 / 装备</button>
          <button class="btn primary" data-a="next">选择战场 ▶</button>
        </div>
      </div>`, 'm-select');
    this.on('[data-h]', (el) => {
      const id = el.dataset.h!;
      if (!g.unlockedHeroes.includes(id)) return;
      this.selHero = id;
      this.heroSelect();
    });
    this.on('[data-a=back]', () => this.title());
    this.on('[data-a=armory]', () => this.armory(this.selHero, true));
    this.on('[data-a=next]', () => this.levelSelect());
  }

  private statBars(st: Stats): string {
    return `<div class="statbars">${STAT_NAMES.map(([k, n, max]) => `<div><span>${n}</span><i><b style="width:${Math.min(100, (st[k] / max) * 100)}%"></b></i><em>${fmtStat(k, st[k])}</em></div>`).join('')}</div>`;
  }

  // ---------------- 关卡与难度 ----------------
  levelSelect(): void {
    this.host.previewHero(this.selHero);
    const g = GameState.data;
    const lv = LEVELS.find((l) => l.id === this.selLevel)!;
    const chaosOk = GameState.campaignCleared();
    if (this.selDiff === 'chaos' && !chaosOk) this.selDiff = 'hard';
    const rec = g.levels[lv.id];
    const list = LEVELS.map((l, i) => {
      const un = GameState.isLevelUnlocked(i);
      const r = g.levels[l.id];
      return `<div class="level-item clickable ${l.id === lv.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-l="${l.id}">
        <b>${i + 1}. ${l.name}</b><span>${un ? l.subtitle : '通关上一关解锁'}</span>${r?.cleared ? `<em class="rank-${r.bestRank}">${r.bestRank}</em>` : ''}</div>`;
    }).join('');
    const diffs = (Object.keys(DIFFICULTY) as Difficulty[]).map((d) => {
      const lock = d === 'chaos' && !chaosOk;
      return `<button class="btn diff ${d === this.selDiff ? 'sel' : ''}" data-d="${d}" ${lock ? 'disabled title="完成全部战役后解锁"' : ''}>${DIFFICULTY[d].name}${lock ? '🔒' : ''}</button>`;
    }).join('');
    const objectives = lv.phases.map((p, i) => `<li>${i + 1}. ${p.objective.text.replace(/[（(].*?[)）]/g, '').replace(/\{.\}/g, '')}</li>`).join('');
    const unlock = lv.unlockHero ? heroById(lv.unlockHero) : null;
    this.show(`
      <div class="panel left">
        <h2>选择战场</h2>
        <div class="level-list">${list}</div>
      </div>
      <div class="panel right level-info">
        <div class="hi-name">${lv.name}<small>${lv.subtitle}</small></div>
        <p>${lv.desc}</p>
        <div class="obj-list"><h4>战场目标</h4><ol>${objectives}</ol></div>
        <div class="lv-meta">敌军：<b>${lv.enemy.name}</b> · 友军：<b>${lv.ally.name}</b></div>
        <div class="lv-meta">通关奖励：金币 ${lv.rewards.gold} · 经验 ${lv.rewards.xp}${lv.rewards.item ? ' · ' + (gearById(lv.rewards.item)?.name ?? '') : ''}${unlock ? ` · 解锁武将 <b>${unlock.name}</b>` : ''}</div>
        ${rec?.cleared ? `<div class="lv-meta">最佳评价 <b>${rec.bestRank}</b> · 最快 ${Math.floor(rec.bestTime / 60)}:${String(Math.floor(rec.bestTime % 60)).padStart(2, '0')}</div>` : ''}
        <h4>难度</h4>
        <div class="diffs">${diffs}</div>
        <div class="diff-desc">敌方生命 ×${DIFFICULTY[this.selDiff].enemyHp} · 敌方攻击 ×${DIFFICULTY[this.selDiff].enemyAtk} · 奖励 ×${DIFFICULTY[this.selDiff].reward}</div>
        <div class="actions">
          <button class="btn" data-a="back">返回</button>
          <button class="btn primary big" data-a="go">出 阵</button>
        </div>
      </div>`, 'm-level');
    this.on('[data-l]', (el) => {
      const i = LEVELS.findIndex((l) => l.id === el.dataset.l);
      if (!GameState.isLevelUnlocked(i)) return;
      this.selLevel = el.dataset.l!;
      this.levelSelect();
    });
    this.on('[data-d]', (el) => {
      if ((el as HTMLButtonElement).disabled) return;
      this.selDiff = el.dataset.d as Difficulty;
      this.levelSelect();
    });
    this.on('[data-a=back]', () => this.heroSelect());
    this.on('[data-a=go]', () => {
      g.lastHero = this.selHero;
      g.lastDifficulty = this.selDiff;
      GameState.save();
      Audio.play('uiConfirm');
      this.host.startBattle(this.selLevel, this.selHero, this.selDiff);
    });
  }

  setSelection(levelId: string, heroId: string, diff: Difficulty): void {
    this.selLevel = levelId;
    this.selHero = heroId;
    this.selDiff = diff;
  }

  // ---------------- 武将养成 / 装备 ----------------
  armory(heroId: string, fromSelect = false): void {
    const g = GameState.data;
    let hero: HeroDef = heroById(heroId);
    if (!g.unlockedHeroes.includes(hero.id)) hero = heroById(g.unlockedHeroes[0]);
    this.selHero = hero.id;
    this.host.previewHero(hero.id);
    const prog = GameState.hero(hero.id);
    const st = GameState.computeStats(hero);
    const xpNeed = GameState.xpForLevel(prog.level);
    const heroTabs = g.unlockedHeroes.map((id) => {
      const h = heroById(id);
      return `<button class="btn tab ${id === hero.id ? 'sel' : ''}" data-h="${id}" style="--c:${css(h.color)}">${h.name}</button>`;
    }).join('');
    let items = '';
    if (this.armoryTab === 'weapon') {
      items = WEAPONS.filter((w) => w.hero === hero.id).map((w) => {
        const owned = g.ownedWeapons.includes(w.id);
        const eq = prog.weapon === w.id;
        const fl = g.forge[w.id] ?? 0;
        const el = ELEMENT_INFO[w.element];
        const canBuy = !owned && g.gold >= w.price && prog.level >= w.reqLevel;
        const cost = forgeCost(w.tier, fl);
        return `<div class="item ${eq ? 'eq' : ''}">
          <div class="it-head"><b>${w.name}${fl ? ` +${fl}` : ''}</b><span class="tier t${w.tier}">${'◆'.repeat(w.tier)}</span></div>
          <div class="it-desc">${w.desc}</div>
          <div class="it-stat">攻击 +${w.atk + forgeAtk(w.tier, fl)} ${w.element !== 'none' ? `<i style="color:${css(el.color)}">【${el.name}】${el.desc}</i>` : ''}</div>
          <div class="it-act">
            ${owned ? (eq ? '<span class="tag">装备中</span>' : `<button class="btn small" data-eqw="${w.id}">装备</button>`) : `<button class="btn small ${canBuy ? 'primary' : ''}" data-buyw="${w.id}" ${canBuy ? '' : 'disabled'}>购买 ${w.price}金${prog.level < w.reqLevel ? ` (需Lv${w.reqLevel})` : ''}</button>`}
            ${owned && fl < MAX_FORGE ? `<button class="btn small" data-forge="${w.id}" ${g.gold >= cost ? '' : 'disabled'}>强化 ${cost}金</button>` : owned ? '<span class="tag">已满级</span>' : ''}
          </div></div>`;
      }).join('');
    } else {
      const slot = this.armoryTab;
      items = `<div class="item ${!prog[slot] ? 'eq' : ''}"><div class="it-head"><b>不装备</b></div><div class="it-act">${prog[slot] ? `<button class="btn small" data-uneq="${slot}">卸下</button>` : '<span class="tag">当前</span>'}</div></div>` +
        GEAR.filter((x) => x.slot === slot).map((x) => {
          const owned = g.ownedGear.includes(x.id);
          const eq = prog[slot] === x.id;
          const bonus = (Object.keys(x.bonus) as (keyof Stats)[]).map((k) => `${STAT_NAMES.find((s) => s[0] === k)?.[1]} +${k === 'crit' || k === 'aspd' || k === 'musou' || k === 'range' ? Math.round((x.bonus[k] ?? 0) * 100) + '%' : x.bonus[k]}`).join(' · ');
          return `<div class="item ${eq ? 'eq' : ''}">
            <div class="it-head"><b>${x.name}</b><span class="tier t${x.tier}">${'◆'.repeat(x.tier)}</span></div>
            <div class="it-desc">${x.desc}</div>
            <div class="it-stat">${bonus}</div>
            <div class="it-act">${owned ? (eq ? '<span class="tag">装备中</span>' : `<button class="btn small" data-eqg="${x.id}">装备</button>`) : `<button class="btn small ${g.gold >= x.price ? 'primary' : ''}" data-buyg="${x.id}" ${g.gold >= x.price ? '' : 'disabled'}>购买 ${x.price}金</button>`}</div>
          </div>`;
        }).join('');
    }
    this.show(`
      <div class="panel left armory-left" style="--c:${css(hero.color)}">
        <h2>武将养成</h2>
        <div class="tabs hero-tabs">${heroTabs}</div>
        <div class="hi-name">${hero.name}<small>Lv${prog.level} · 熟练度 ${prog.mastery}</small></div>
        <div class="xpbar"><b style="width:${prog.level >= 50 ? 100 : (prog.xp / xpNeed) * 100}%"></b><span>${prog.level >= 50 ? 'MAX' : `${prog.xp} / ${xpNeed}`}</span></div>
        ${this.statBars(st)}
        <div class="lv-meta">个人最佳连击 ${prog.bestCombo} · 累计击破 ${prog.kills}</div>
      </div>
      <div class="panel right armory-right">
        <div class="gold">金币 <b>${g.gold}</b></div>
        <div class="tabs">
          <button class="btn tab ${this.armoryTab === 'weapon' ? 'sel' : ''}" data-t="weapon">武器</button>
          <button class="btn tab ${this.armoryTab === 'armor' ? 'sel' : ''}" data-t="armor">铠甲</button>
          <button class="btn tab ${this.armoryTab === 'accessory' ? 'sel' : ''}" data-t="accessory">饰品</button>
        </div>
        <div class="items">${items}</div>
        <div class="actions"><button class="btn" data-a="back">返回</button>${fromSelect ? '<button class="btn primary" data-a="next">选择战场 ▶</button>' : ''}</div>
      </div>`, 'm-armory');
    const re = () => this.armory(hero.id, fromSelect);
    this.on('[data-h]', (el) => this.armory(el.dataset.h!, fromSelect));
    this.on('[data-t]', (el) => {
      this.armoryTab = el.dataset.t as any;
      re();
    });
    this.on('[data-eqw]', (el) => {
      prog.weapon = el.dataset.eqw!;
      GameState.save();
      Audio.play('uiConfirm');
      re();
    });
    this.on('[data-buyw]', (el) => {
      const w = weaponById(el.dataset.buyw!)!;
      if (g.gold < w.price || prog.level < w.reqLevel) return;
      g.gold -= w.price;
      g.ownedWeapons.push(w.id);
      prog.weapon = w.id;
      GameState.save();
      Audio.play('pickup');
      re();
    });
    this.on('[data-forge]', (el) => {
      const w = weaponById(el.dataset.forge!)!;
      const lv = g.forge[w.id] ?? 0;
      const cost = forgeCost(w.tier, lv);
      if (g.gold < cost || lv >= MAX_FORGE) return;
      g.gold -= cost;
      g.forge[w.id] = lv + 1;
      if (lv + 1 >= MAX_FORGE) GameState.unlockAchievement('forge10', ACHIEVEMENTS.find((a) => a.id === 'forge10')!.gold);
      GameState.save();
      Audio.play('levelup');
      re();
    });
    this.on('[data-buyg]', (el) => {
      const x = gearById(el.dataset.buyg!)!;
      if (g.gold < x.price) return;
      g.gold -= x.price;
      g.ownedGear.push(x.id);
      prog[x.slot] = x.id;
      GameState.save();
      Audio.play('pickup');
      re();
    });
    this.on('[data-eqg]', (el) => {
      const x = gearById(el.dataset.eqg!)!;
      prog[x.slot] = x.id;
      GameState.save();
      re();
    });
    this.on('[data-uneq]', (el) => {
      prog[el.dataset.uneq as 'armor' | 'accessory'] = null;
      GameState.save();
      re();
    });
    this.on('[data-a=back]', () => (fromSelect ? this.heroSelect() : this.title()));
    this.on('[data-a=next]', () => this.levelSelect());
  }

  // ---------------- 战绩与成就 ----------------
  records(): void {
    this.host.previewHero(null);
    const g = GameState.data;
    const ach = ACHIEVEMENTS.map((a) => {
      const ok = g.achievements.includes(a.id);
      return `<div class="ach-item ${ok ? 'ok' : ''}"><b>${ok ? '🏆' : '🔒'} ${a.name}</b><span>${a.desc}</span><em>${a.gold} 金</em></div>`;
    }).join('');
    const lv = LEVELS.map((l) => {
      const r = g.levels[l.id];
      return `<tr><td>${l.name}</td><td>${r?.cleared ? '✔' : '—'}</td><td>${r?.bestRank ?? '—'}</td><td>${r?.cleared ? `${Math.floor(r.bestTime / 60)}:${String(Math.floor(r.bestTime % 60)).padStart(2, '0')}` : '—'}</td><td>${(Object.keys(DIFFICULTY) as Difficulty[]).filter((d) => r?.clears?.[d]).map((d) => DIFFICULTY[d].name).join(' ') || '—'}</td></tr>`;
    }).join('');
    const titles = [g.totalKills >= 5000 && '万人斩', g.totalKills >= 1000 && '千人斩', g.bestCombo >= 300 && '无双乱舞', GameState.campaignCleared() && '天下统一'].filter(Boolean);
    this.show(`
      <div class="panel wide">
        <h2>战绩与成就</h2>
        <div class="rec-top">总击破 <b>${g.totalKills}</b> · 最高连击 <b>${g.bestCombo}</b> · 成就 <b>${g.achievements.length}/${ACHIEVEMENTS.length}</b>${titles.length ? ` · 称号 <b>${titles.join('、')}</b>` : ''}</div>
        <table class="rec-table"><tr><th>战场</th><th>通关</th><th>最佳评价</th><th>最快用时</th><th>已通关难度</th></tr>${lv}</table>
        <div class="ach-grid">${ach}</div>
        <div class="actions"><button class="btn" data-a="back">返回</button></div>
      </div>`, 'm-records');
    this.on('[data-a=back]', () => this.title());
  }

  // ---------------- 设置 ----------------
  settings(back: 'title' | 'pause' = this.settingsBack): void {
    this.settingsBack = back;
    const s = GameState.settings;
    const chk = (k: keyof typeof s, label: string) => `<label class="row"><span>${label}</span><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></label>`;
    const rng = (k: keyof typeof s, label: string, min: number, max: number, step: number) => `<label class="row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" value="${s[k]}"><em>${Math.round((s[k] as number) * 100)}%</em></label>`;
    const keyNames: Array<[keyof KeyBindings, string]> = [['up', '前进'], ['down', '后退'], ['left', '左移'], ['right', '右移'], ['attack', '普通攻击'], ['heavy', '重攻击 / 蓄力'], ['skill1', '技能一'], ['skill2', '技能二'], ['musou', '无双'], ['dodge', '闪避'], ['lock', '锁定目标'], ['pause', '暂停']];
    const quality: Array<[QualityLevel, string]> = [['auto', '自动'], ['low', '低'], ['mid', '中'], ['high', '高']];
    this.show(`
      <div class="panel wide settings">
        <h2>设置</h2>
        <div class="set-cols">
          <div class="set-col">
            <h4>音频</h4>
            ${rng('musicVolume', '音乐音量', 0, 1, 0.05)}
            ${rng('sfxVolume', '音效音量', 0, 1, 0.05)}
            ${chk('muted', '静音')}
            <h4>画面</h4>
            <div class="row"><span>画质</span><div class="seg">${quality.map(([q, n]) => `<button class="btn small ${s.quality === q ? 'sel' : ''}" data-q="${q}">${n}</button>`).join('')}</div></div>
            ${chk('autoAdjust', '根据帧率动态调整画质')}
            ${chk('screenShake', '屏幕震动')}
            ${chk('strongFlash', '强闪光效果')}
            ${chk('slowMotion', '技能慢动作')}
            ${chk('damageNumbers', '显示伤害数字')}
            ${chk('showFps', '显示帧率')}
          </div>
          <div class="set-col">
            <h4>镜头</h4>
            ${rng('cameraSensitivity', '镜头灵敏度', 0.3, 2.5, 0.05)}
            ${chk('invertY', '反转垂直视角')}
            <h4>触屏</h4>
            ${rng('buttonOpacity', '按钮透明度', 0.2, 1, 0.05)}
            ${rng('buttonScale', '按钮大小', 0.7, 1.4, 0.05)}
            ${chk('vibration', '振动反馈')}
            <div class="row"><span>按钮位置</span><button class="btn small" data-a="layout">调整布局</button></div>
            <h4>键位（点击后按下新按键）</h4>
            <div class="keys">${keyNames.map(([k, n]) => `<div class="row"><span>${n}</span><button class="btn small key" data-key="${k}">${keyLabel(s.keys[k])}</button></div>`).join('')}</div>
            <div class="row"><span></span><button class="btn small" data-a="keyreset">恢复默认键位</button></div>
          </div>
        </div>
        <div class="actions">
          ${back === 'title' ? '<button class="btn danger" data-a="wipe">清除存档</button>' : ''}
          <button class="btn primary" data-a="back">返回</button>
        </div>
      </div>`, 'm-settings' + (back === 'pause' ? ' over' : ''));
    this.el.querySelectorAll('input[type=checkbox]').forEach((i) =>
      i.addEventListener('change', () => {
        (s as any)[(i as HTMLInputElement).dataset.k!] = (i as HTMLInputElement).checked;
        this.host.applySettings();
        GameState.save();
      }),
    );
    this.el.querySelectorAll('input[type=range]').forEach((i) =>
      i.addEventListener('input', () => {
        const inp = i as HTMLInputElement;
        (s as any)[inp.dataset.k!] = parseFloat(inp.value);
        (inp.nextElementSibling as HTMLElement).textContent = Math.round(parseFloat(inp.value) * 100) + '%';
        this.host.applySettings();
      }),
    );
    this.el.querySelectorAll('input[type=range]').forEach((i) => i.addEventListener('change', () => GameState.save()));
    this.on('[data-q]', (el) => {
      s.quality = el.dataset.q as QualityLevel;
      this.host.applySettings();
      GameState.save();
      this.settings();
    });
    this.on('[data-key]', (el) => {
      el.textContent = '请按键…';
      el.classList.add('wait');
      this.host.rebindKey((code) => {
        const k = el.dataset.key as keyof KeyBindings;
        // 若该键已被占用则交换
        for (const kk of Object.keys(s.keys) as (keyof KeyBindings)[]) if (s.keys[kk] === code) s.keys[kk] = s.keys[k];
        s.keys[k] = code;
        GameState.save();
        this.settings();
      });
    });
    this.on('[data-a=keyreset]', () => {
      s.keys = { ...DEFAULT_KEYS };
      GameState.save();
      this.settings();
    });
    this.on('[data-a=layout]', () => {
      this.hide();
      this.host.editTouchLayout(() => this.settings());
    });
    this.on('[data-a=wipe]', () => {
      if (!confirm('确定要清除全部存档进度吗？此操作不可恢复。')) return;
      GameState.reset();
      this.selHero = 'zhaoyun';
      this.selLevel = LEVELS[0].id;
      this.title();
    });
    this.on('[data-a=back]', () => (back === 'pause' ? this.pause() : this.title()));
  }

  // ---------------- 暂停 ----------------
  pause(): void {
    this.show(`
      <div class="panel pause">
        <h2>暂停</h2>
        <button class="btn primary big" data-a="resume">继续战斗</button>
        <button class="btn" data-a="restart">重新开始</button>
        <button class="btn" data-a="settings">设置</button>
        ${fullscreenSupported() ? '<button class="btn" data-a="fs">全屏切换</button>' : ''}
        <button class="btn danger" data-a="quit">撤退（返回主菜单）</button>
        <div class="help">${isTouchDevice() ? '左侧摇杆移动 · 右侧空白处滑动转动镜头 · 长按重击蓄力' : 'WASD 移动 · 鼠标转动镜头（点击画面锁定鼠标）· Q/E 旋转镜头 · K 长按蓄力'}</div>
      </div>`, 'm-pause over');
    this.on('[data-a=resume]', () => this.host.resume());
    this.on('[data-a=restart]', () => this.host.restart());
    this.on('[data-a=settings]', () => this.settings('pause'));
    this.on('[data-a=fs]', () => this.host.fullscreen());
    this.on('[data-a=quit]', () => this.host.quitToMenu());
  }

  // ---------------- 加载 ----------------
  loading(levelName: string, tip: string): (k: number, msg: string) => void {
    this.show(`
      <div class="loading">
        <h2>${levelName}</h2>
        <div class="lbar"><b></b></div>
        <div class="lmsg">准备中…</div>
        <div class="ltip">${tip}</div>
      </div>`, 'm-loading');
    const bar = this.el.querySelector('.lbar b') as HTMLElement;
    const msg = this.el.querySelector('.lmsg') as HTMLElement;
    return (k, m) => {
      bar.style.width = Math.round(k * 100) + '%';
      msg.textContent = m;
    };
  }

  result(): HTMLDivElement {
    this.show('', 'm-result over');
    return this.el;
  }
}

export const TIPS = [
  '连续攻击敌人可提升连击数，高连击能加快无双能量积累。',
  '长按重攻击键蓄力，松开时释放强力蓄力攻击。',
  '闪避期间拥有短暂无敌时间，可用于躲避敌将的大招。',
  '敌将释放大招后会露出破绽，此时攻击可造成额外伤害。',
  '生命值低于 25% 时释放无双，将发动威力更强的「真·无双」。',
  '刀盾兵会格挡正面的轻攻击，用重击或击飞攻击破防。',
  '红色地面区域为敌将攻击范围提示，及时离开！',
  '击破精英兵与敌将会掉落肉包、美酒等道具。',
  '武器属性：炎灼烧、雷连锁、冰减速、斩削血、风扩大范围。',
  '在武将养成界面强化武器与购买装备，提升战斗力。',
];
