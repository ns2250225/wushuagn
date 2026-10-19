import { HEROES } from '../data/heroes';
import { LEVELS } from '../data/levels';
import { WEAPONS, gearById, weaponById, forgeAtk } from '../data/items';
import type { Difficulty, HeroDef, Stats } from '../data/types';

export const SAVE_VERSION = 3;
const SAVE_KEY = 'bdw_save';
const BACKUP_KEY = 'bdw_save_backup';

export type QualityLevel = 'auto' | 'low' | 'mid' | 'high';

export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  attack: string;
  heavy: string;
  skill1: string;
  skill2: string;
  musou: string;
  dodge: string;
  lock: string;
  pause: string;
}

export const DEFAULT_KEYS: KeyBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  attack: 'KeyJ',
  heavy: 'KeyK',
  skill1: 'KeyU',
  skill2: 'KeyI',
  musou: 'KeyO',
  dodge: 'Space',
  lock: 'Tab',
  pause: 'Escape',
};

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualityLevel;
  autoAdjust: boolean;
  screenShake: boolean;
  strongFlash: boolean;
  slowMotion: boolean;
  vibration: boolean;
  cameraSensitivity: number;
  invertY: boolean;
  buttonOpacity: number;
  buttonScale: number;
  buttonOffsets: Record<string, [number, number]>;
  keys: KeyBindings;
  showFps: boolean;
  damageNumbers: boolean;
}

export interface HeroProgress {
  level: number;
  xp: number;
  weapon: string;
  armor: string | null;
  accessory: string | null;
  bestCombo: number;
  kills: number;
  mastery: number;
}

export interface LevelRecord {
  cleared: boolean;
  bestRank: string;
  bestTime: number;
  clears: Partial<Record<Difficulty, boolean>>;
}

export interface SaveData {
  version: number;
  gold: number;
  unlockedHeroes: string[];
  heroes: Record<string, HeroProgress>;
  levels: Record<string, LevelRecord>;
  ownedWeapons: string[];
  forge: Record<string, number>;
  ownedGear: string[];
  achievements: string[];
  bestCombo: number;
  totalKills: number;
  settings: Settings;
  lastHero: string;
  lastDifficulty: Difficulty;
}

export function defaultSettings(): Settings {
  return {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    quality: 'auto',
    autoAdjust: true,
    screenShake: true,
    strongFlash: true,
    slowMotion: true,
    vibration: true,
    cameraSensitivity: 1,
    invertY: false,
    buttonOpacity: 0.75,
    buttonScale: 1,
    buttonOffsets: {},
    keys: { ...DEFAULT_KEYS },
    showFps: false,
    damageNumbers: true,
  };
}

function defaultHero(h: HeroDef): HeroProgress {
  const w = WEAPONS.find((x) => x.hero === h.id && x.tier === 1)!;
  return { level: 1, xp: 0, weapon: w.id, armor: null, accessory: null, bestCombo: 0, kills: 0, mastery: 0 };
}

export function defaultSave(): SaveData {
  const heroes: Record<string, HeroProgress> = {};
  for (const h of HEROES) heroes[h.id] = defaultHero(h);
  return {
    version: SAVE_VERSION,
    gold: 500,
    unlockedHeroes: HEROES.filter((h) => h.unlock === null).map((h) => h.id),
    heroes,
    levels: {},
    ownedWeapons: WEAPONS.filter((w) => w.tier === 1).map((w) => w.id),
    forge: {},
    ownedGear: [],
    achievements: [],
    bestCombo: 0,
    totalKills: 0,
    settings: defaultSettings(),
    lastHero: 'zhaoyun',
    lastDifficulty: 'normal',
  };
}

// 旧版本存档迁移
function migrate(raw: any): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const v = typeof raw.version === 'number' ? raw.version : 1;
  if (v < 2) {
    // v1 将金币存为 money
    if (typeof raw.money === 'number' && raw.gold === undefined) raw.gold = raw.money;
  }
  if (v < 3) {
    // v2 无熟练度字段
    if (raw.heroes) for (const k of Object.keys(raw.heroes)) raw.heroes[k].mastery ??= 0;
  }
  const out: SaveData = { ...base, ...raw, version: SAVE_VERSION };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.settings.keys = { ...DEFAULT_KEYS, ...((raw.settings && raw.settings.keys) || {}) };
  out.settings.buttonOffsets = { ...((raw.settings && raw.settings.buttonOffsets) || {}) };
  out.heroes = { ...base.heroes };
  for (const h of HEROES) {
    const r = raw.heroes?.[h.id];
    if (r && typeof r === 'object') out.heroes[h.id] = { ...base.heroes[h.id], ...r };
    if (!weaponById(out.heroes[h.id].weapon)) out.heroes[h.id].weapon = base.heroes[h.id].weapon;
  }
  // 数据合法性修正
  out.gold = Math.max(0, Number(out.gold) || 0);
  if (!Array.isArray(out.unlockedHeroes)) out.unlockedHeroes = base.unlockedHeroes;
  for (const id of base.unlockedHeroes) if (!out.unlockedHeroes.includes(id)) out.unlockedHeroes.push(id);
  out.unlockedHeroes = out.unlockedHeroes.filter((id) => HEROES.some((h) => h.id === id));
  if (!Array.isArray(out.ownedWeapons)) out.ownedWeapons = base.ownedWeapons;
  for (const id of base.ownedWeapons) if (!out.ownedWeapons.includes(id)) out.ownedWeapons.push(id);
  if (!Array.isArray(out.ownedGear)) out.ownedGear = [];
  if (!Array.isArray(out.achievements)) out.achievements = [];
  if (typeof out.levels !== 'object' || !out.levels) out.levels = {};
  if (typeof out.forge !== 'object' || !out.forge) out.forge = {};
  if (!HEROES.some((h) => h.id === out.lastHero)) out.lastHero = 'zhaoyun';
  return out;
}

class GameStateStore {
  data: SaveData = defaultSave();
  recovered = false;

  load(): void {
    let txt: string | null = null;
    try {
      txt = localStorage.getItem(SAVE_KEY);
    } catch {
      txt = null;
    }
    if (txt) {
      try {
        this.data = migrate(JSON.parse(txt));
        return;
      } catch {
        // 主存档损坏，尝试备份
        try {
          const b = localStorage.getItem(BACKUP_KEY);
          if (b) {
            this.data = migrate(JSON.parse(b));
            this.recovered = true;
            return;
          }
        } catch {
          /* ignore */
        }
      }
    }
    this.data = defaultSave();
  }

  save(): void {
    try {
      const txt = JSON.stringify(this.data);
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      localStorage.setItem(SAVE_KEY, txt);
    } catch {
      /* 存储不可用时静默失败 */
    }
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  hero(id: string): HeroProgress {
    return this.data.heroes[id];
  }

  isLevelUnlocked(index: number): boolean {
    if (index === 0) return true;
    const prev = LEVELS[index - 1];
    return !!this.data.levels[prev.id]?.cleared;
  }

  campaignCleared(): boolean {
    return LEVELS.every((l) => this.data.levels[l.id]?.cleared);
  }

  xpForLevel(lv: number): number {
    return Math.round(200 * Math.pow(lv, 1.45));
  }

  addXp(heroId: string, xp: number): number {
    const hp = this.hero(heroId);
    let ups = 0;
    hp.xp += xp;
    while (hp.level < 50 && hp.xp >= this.xpForLevel(hp.level)) {
      hp.xp -= this.xpForLevel(hp.level);
      hp.level++;
      ups++;
    }
    if (hp.level >= 50) hp.xp = 0;
    return ups;
  }

  // 计算武将最终属性
  computeStats(h: HeroDef): Stats & { element: string; weaponAtk: number } {
    const p = this.hero(h.id);
    const lv = p.level - 1;
    const s: Stats = { ...h.base };
    s.hp += (h.growth.hp ?? 0) * lv;
    s.atk += (h.growth.atk ?? 0) * lv;
    s.def += (h.growth.def ?? 0) * lv;
    // 熟练度：每级 +1% 攻击
    s.atk *= 1 + Math.min(p.mastery, 20) * 0.01;
    const w = weaponById(p.weapon);
    let weaponAtk = 0;
    let element = 'none';
    if (w) {
      weaponAtk = w.atk + forgeAtk(w.tier, this.data.forge[w.id] ?? 0);
      s.atk += weaponAtk;
      element = w.element;
      if (w.element === 'wind') s.range += 0.12;
    }
    for (const gid of [p.armor, p.accessory]) {
      if (!gid) continue;
      const g = gearById(gid);
      if (!g) continue;
      for (const k of Object.keys(g.bonus) as (keyof Stats)[]) s[k] += g.bonus[k] ?? 0;
    }
    return { ...s, element, weaponAtk };
  }

  unlockAchievement(id: string, gold: number): boolean {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this.data.gold += gold;
    return true;
  }
}

export const GameState = new GameStateStore();
