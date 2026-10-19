// 全局数据类型定义

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number; // 移动速度 m/s
  aspd: number; // 攻击速度倍率
  range: number; // 攻击范围倍率
  musou: number; // 无双能量获取倍率
  crit: number; // 暴击率 0..1
}

export type WeaponType =
  | 'spear'
  | 'glaive'
  | 'snakeSpear'
  | 'halberd'
  | 'twinSwords'
  | 'sword'
  | 'chakram'
  | 'broadsword'
  | 'twinHooks'
  | 'axe';

export type HairStyle = 'topknot' | 'long' | 'spiky' | 'bun' | 'ponytail' | 'twinTails' | 'short' | 'bald';
export type BeardStyle = 'none' | 'long' | 'thick' | 'goatee' | 'mustache';
export type Headgear =
  | 'none'
  | 'helmetPlume'
  | 'pheasant'
  | 'greenHat'
  | 'bandana'
  | 'crown'
  | 'circlet'
  | 'hornHelmet'
  | 'eyepatch'
  | 'scholarHat';

export interface Appearance {
  height: number;
  bulk: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  beard: BeardStyle;
  beardColor?: number;
  headgear: Headgear;
  headgearColor: number;
  headgearAlt: number;
  armor: number;
  armorTrim: number;
  cloth: number;
  clothAlt: number;
  pants: number;
  boots: number;
  belt: number;
  cape?: number;
  shoulder: 'none' | 'round' | 'big' | 'spiked';
  robe?: boolean; // 长袍下摆
  female?: boolean;
}

export type HitKind = 'light' | 'heavy' | 'launch' | 'quake' | 'finisher';

export type SwingType =
  | 'thrust'
  | 'slashR'
  | 'slashL'
  | 'overhead'
  | 'spin'
  | 'uppercut'
  | 'slam'
  | 'doubleThrust'
  | 'flurry'
  | 'raise'
  | 'cross'
  | 'throw'
  | 'grab'
  | 'leapThrust'
  | 'roar';

export interface MoveDef {
  swing: SwingType;
  dur: number; // 秒（攻速 1.0 时）
  hits: number[]; // 归一化判定时间点
  range: number;
  arc: number; // 扇形角度（度）
  dmg: number; // 攻击力倍率
  kind: HitKind;
  lunge?: number; // 前冲距离
  fx?: 'arc' | 'thrust' | 'ring' | 'quake' | 'none';
  wave?: boolean; // 释放剑气
  projectile?: boolean; // 远程投掷（环刃）
}

export interface HeroDef {
  id: string;
  name: string;
  courtesy: string;
  title: string;
  faction: string;
  role: string;
  difficulty: number;
  desc: string;
  weaponType: WeaponType;
  weaponName: string;
  color: number;
  colorAlt: number;
  base: Stats;
  growth: Partial<Stats>;
  look: Appearance;
  combo: MoveDef[];
  heavy: MoveDef;
  charge: MoveDef;
  skills: [string, string];
  musou: string;
  unlock: string | null; // 通关该关卡后解锁，null 为初始可用
}

export interface SkillMeta {
  id: string;
  name: string;
  desc: string;
  cd: number;
}

export type Element = 'none' | 'fire' | 'thunder' | 'ice' | 'slash' | 'wind';

export interface WeaponItem {
  id: string;
  hero: string;
  name: string;
  tier: number;
  atk: number;
  element: Element;
  price: number;
  reqLevel: number;
  desc: string;
}

export interface GearItem {
  id: string;
  slot: 'armor' | 'accessory';
  name: string;
  tier: number;
  bonus: Partial<Stats>;
  price: number;
  desc: string;
}

export type SoldierTypeId = 'sword' | 'spear' | 'archer' | 'heavy' | 'cavalry' | 'elite' | 'ally' | 'allySpear' | 'allyArcher';

export interface SoldierType {
  id: SoldierTypeId;
  name: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  range: number;
  windup: number;
  attackCd: number;
  weapon: 'sword' | 'spear' | 'bow' | 'halberd' | 'lance';
  shield: boolean;
  superArmor: number;
  mounted: boolean;
  scale: number;
  xp: number;
  gold: number;
  helmet: 'cap' | 'helm' | 'heavy' | 'elite' | 'hood';
}

export interface FactionColors {
  name: string;
  armor: number;
  trim: number;
  cloth: number;
  flag: number;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  weaponType: WeaponType;
  look: Appearance;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  moves: string[];
  tier: 'officer' | 'boss';
  color: number;
  heroRef?: string;
}

export type ObjectiveDef =
  | { type: 'killCount'; count: number; text: string }
  | { type: 'clearWaves'; text: string }
  | { type: 'defeat'; boss: string; pos: [number, number]; text: string; guards?: Array<[SoldierTypeId, number]> }
  | { type: 'destroy'; targets: string[]; text: string }
  | { type: 'protect'; npc: string; pos: [number, number]; duration: number; text: string }
  | { type: 'reach'; pos: [number, number]; radius: number; text: string }
  | { type: 'timedKill'; count: number; time: number; text: string };

export interface WaveDef {
  at: number | 'cleared';
  spawn: [number, number];
  radius: number;
  units: Array<[SoldierTypeId, number]>;
  ally?: boolean;
  message?: string;
  repeat?: number; // 重复间隔秒（持续增援）
}

export type BattleEvent =
  | { type: 'message'; text: string; style?: 'info' | 'warn' | 'good' }
  | { type: 'openGate'; id: string }
  | { type: 'horn' }
  | { type: 'allyBuff' };

export interface PhaseDef {
  objective: ObjectiveDef;
  events?: BattleEvent[];
  waves: WaveDef[];
}

export type SceneId = 'hulao' | 'changban' | 'chibi' | 'guandu' | 'chengdu' | 'luoyang';

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  scene: SceneId;
  desc: string;
  enemy: FactionColors;
  ally: FactionColors;
  start: [number, number];
  phases: PhaseDef[];
  parTime: number; // 评级标准时间
  rewards: { gold: number; xp: number; item?: string };
  unlockHero?: string;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'chaos';

export const DIFFICULTY: Record<Difficulty, { name: string; enemyHp: number; enemyAtk: number; reward: number; aggro: number }> = {
  easy: { name: '简单', enemyHp: 0.7, enemyAtk: 0.5, reward: 0.8, aggro: 0.7 },
  normal: { name: '普通', enemyHp: 1.0, enemyAtk: 1.0, reward: 1.0, aggro: 1.0 },
  hard: { name: '困难', enemyHp: 1.5, enemyAtk: 1.6, reward: 1.5, aggro: 1.3 },
  chaos: { name: '修罗', enemyHp: 2.4, enemyAtk: 2.6, reward: 2.5, aggro: 1.6 },
};
