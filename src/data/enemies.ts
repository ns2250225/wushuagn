import type { BossDef, SoldierType, SoldierTypeId } from './types';

export const SOLDIER_TYPES: Record<SoldierTypeId, SoldierType> = {
  sword: { id: 'sword', name: '刀盾兵', hp: 120, atk: 22, def: 30, spd: 3.6, range: 1.7, windup: 0.6, attackCd: 2.2, weapon: 'sword', shield: true, superArmor: 0, mounted: false, scale: 1, xp: 4, gold: 2, helmet: 'cap' },
  spear: { id: 'spear', name: '长枪兵', hp: 100, atk: 26, def: 15, spd: 3.8, range: 2.7, windup: 0.7, attackCd: 2.4, weapon: 'spear', shield: false, superArmor: 0, mounted: false, scale: 1, xp: 4, gold: 2, helmet: 'helm' },
  archer: { id: 'archer', name: '弓兵', hp: 80, atk: 18, def: 8, spd: 3.4, range: 16, windup: 0.9, attackCd: 3.2, weapon: 'bow', shield: false, superArmor: 0, mounted: false, scale: 1, xp: 4, gold: 2, helmet: 'hood' },
  heavy: { id: 'heavy', name: '重装兵', hp: 420, atk: 40, def: 60, spd: 2.8, range: 2.2, windup: 0.9, attackCd: 2.8, weapon: 'halberd', shield: false, superArmor: 0.8, mounted: false, scale: 1.22, xp: 12, gold: 6, helmet: 'heavy' },
  cavalry: { id: 'cavalry', name: '骑兵', hp: 260, atk: 45, def: 30, spd: 9.5, range: 2.0, windup: 0.3, attackCd: 3.5, weapon: 'lance', shield: false, superArmor: 0.3, mounted: true, scale: 1, xp: 10, gold: 5, helmet: 'helm' },
  elite: { id: 'elite', name: '精英兵', hp: 650, atk: 55, def: 50, spd: 4.4, range: 2.6, windup: 0.75, attackCd: 2.4, weapon: 'halberd', shield: false, superArmor: 0.5, mounted: false, scale: 1.12, xp: 25, gold: 12, helmet: 'elite' },
  ally: { id: 'ally', name: '友军刀兵', hp: 260, atk: 30, def: 30, spd: 4.0, range: 1.8, windup: 0.5, attackCd: 1.8, weapon: 'sword', shield: true, superArmor: 0, mounted: false, scale: 1, xp: 0, gold: 0, helmet: 'cap' },
  allySpear: { id: 'allySpear', name: '友军枪兵', hp: 240, atk: 32, def: 20, spd: 4.0, range: 2.7, windup: 0.6, attackCd: 2.0, weapon: 'spear', shield: false, superArmor: 0, mounted: false, scale: 1, xp: 0, gold: 0, helmet: 'helm' },
  allyArcher: { id: 'allyArcher', name: '友军弓兵', hp: 200, atk: 22, def: 10, spd: 3.6, range: 15, windup: 0.8, attackCd: 2.8, weapon: 'bow', shield: false, superArmor: 0, mounted: false, scale: 1, xp: 0, gold: 0, helmet: 'hood' },
};

const baseLook = {
  height: 1.05, bulk: 1.05, skin: 0xe0b090, hair: 0x101010, hairStyle: 'topknot' as const, beard: 'none' as const,
  headgear: 'hornHelmet' as const, headgearColor: 0x4a4a52, headgearAlt: 0xc8a040,
  armor: 0x3a3a44, armorTrim: 0xc8a040, cloth: 0x6a2a8a, clothAlt: 0x2a1a3a, pants: 0x2a2230, boots: 0x18141a,
  belt: 0xc8a040, shoulder: 'big' as const,
};

export const BOSSES: Record<string, BossDef> = {
  huaxiong: {
    id: 'huaxiong', name: '华雄', title: '董卓军骁将', weaponType: 'broadsword', tier: 'officer', color: 0xb060ff,
    hp: 6000, atk: 70, def: 60, spd: 6.0, moves: ['combo3', 'dashStrike', 'slamAoE'],
    look: { ...baseLook, height: 1.15, bulk: 1.3, skin: 0xc89070, beard: 'thick', beardColor: 0x2a1a10, cloth: 0x5a2070 },
  },
  zhangliao: {
    id: 'zhangliao', name: '张辽', title: '威震逍遥津', weaponType: 'twinHooks', tier: 'boss', color: 0x4080ff,
    hp: 11000, atk: 80, def: 55, spd: 9.0, moves: ['combo3', 'blink', 'dashStrike', 'spinAoE', 'waveShot', 'finalBurst'],
    look: { ...baseLook, height: 1.05, bulk: 1.0, beard: 'goatee', headgear: 'helmetPlume', headgearColor: 0x2a3a6a, headgearAlt: 0x1a2a8a, armor: 0x24305a, armorTrim: 0xc0c8d8, cloth: 0x2a4aa0, clothAlt: 0x1a2a4a, cape: 0x1a2a6a },
  },
  lubu: {
    id: 'lubu', name: '吕布', title: '飞将军', weaponType: 'halberd', tier: 'boss', color: 0xff3040, heroRef: 'lubu',
    hp: 16000, atk: 100, def: 70, spd: 7.6, moves: ['combo3', 'dashStrike', 'spinAoE', 'slamAoE', 'waveShot', 'leapSlam', 'finalBurst'],
    look: {
      height: 1.15, bulk: 1.15, skin: 0xe8b890, hair: 0x101010, hairStyle: 'long', beard: 'none',
      headgear: 'pheasant', headgearColor: 0xe0b030, headgearAlt: 0xd02020,
      armor: 0x1a1214, armorTrim: 0xc81e28, cloth: 0xb01020, clothAlt: 0xe0b030, pants: 0x221418, boots: 0x140c0c,
      belt: 0xe0b030, cape: 0xa01020, shoulder: 'spiked',
    },
  },
  xiahoudun: {
    id: 'xiahoudun', name: '夏侯惇', title: '独眼猛将', weaponType: 'broadsword', tier: 'officer', color: 0x4060c0,
    hp: 7500, atk: 75, def: 65, spd: 6.4, moves: ['combo3', 'dashStrike', 'spinAoE'],
    look: { ...baseLook, headgear: 'eyepatch', headgearColor: 0x2a3050, beard: 'goatee', armor: 0x2a3050, cloth: 0x203a80, clothAlt: 0x101a30 },
  },
  wenchou: {
    id: 'wenchou', name: '文丑', title: '河北名将', weaponType: 'spear', tier: 'officer', color: 0xe0c040,
    hp: 8000, atk: 78, def: 60, spd: 7.0, moves: ['combo3', 'dashStrike', 'waveShot'],
    look: { ...baseLook, beard: 'thick', armor: 0x5a4a20, armorTrim: 0xe0c040, cloth: 0xc0a030, clothAlt: 0x4a3a10 },
  },
  yanliang: {
    id: 'yanliang', name: '颜良', title: '袁绍军上将', weaponType: 'glaive', tier: 'boss', color: 0xe0a020,
    hp: 13000, atk: 88, def: 70, spd: 6.6, moves: ['combo3', 'slamAoE', 'spinAoE', 'waveShot', 'leapSlam', 'summon', 'finalBurst'],
    look: { ...baseLook, height: 1.18, bulk: 1.3, beard: 'long', beardColor: 0x3a2a1a, armor: 0x6a5420, armorTrim: 0xffe060, cloth: 0xd0a020, clothAlt: 0x5a4010, cape: 0x8a6a10 },
  },
  yujin: {
    id: 'yujin', name: '于禁', title: '曹军督将', weaponType: 'axe', tier: 'officer', color: 0x3a70d0,
    hp: 8500, atk: 80, def: 70, spd: 6.0, moves: ['combo3', 'slamAoE', 'dashStrike'],
    look: { ...baseLook, beard: 'mustache', armor: 0x22305a, cloth: 0x2a50a0, clothAlt: 0x1a2a50 },
  },
  caocao: {
    id: 'caocao', name: '曹操', title: '魏武', weaponType: 'sword', tier: 'boss', color: 0x9050ff, heroRef: 'caocao',
    hp: 14000, atk: 92, def: 68, spd: 7.2, moves: ['combo3', 'waveShot', 'pillars', 'dashStrike', 'summon', 'finalBurst'],
    look: {
      height: 1.0, bulk: 1.02, skin: 0xe8c0a0, hair: 0x1a1210, hairStyle: 'topknot', beard: 'mustache', beardColor: 0x1a1210,
      headgear: 'crown', headgearColor: 0x1a1a24, headgearAlt: 0xd0b040,
      armor: 0x1c2238, armorTrim: 0xd0b040, cloth: 0x4a2a7a, clothAlt: 0x2a2a3a, pants: 0x1a1a28, boots: 0x101018,
      belt: 0xd0b040, cape: 0x3a1a6a, shoulder: 'big',
    },
  },
  zhanghe: {
    id: 'zhanghe', name: '张郃', title: '巧变名将', weaponType: 'twinHooks', tier: 'boss', color: 0x6a50ff,
    hp: 14500, atk: 90, def: 62, spd: 8.6, moves: ['combo3', 'blink', 'spinAoE', 'waveShot', 'leapSlam', 'finalBurst'],
    look: { ...baseLook, hairStyle: 'long', hair: 0x3a1a4a, headgear: 'circlet', headgearColor: 0xe0c060, armor: 0x3a2a6a, armorTrim: 0xe0c060, cloth: 0x6a4ab0, clothAlt: 0xe0d0ff, cape: 0x4a2a8a },
  },
  lijue: {
    id: 'lijue', name: '李傕', title: '西凉悍将', weaponType: 'axe', tier: 'officer', color: 0xa04040,
    hp: 9000, atk: 85, def: 70, spd: 6.4, moves: ['combo3', 'slamAoE', 'spinAoE', 'dashStrike'],
    look: { ...baseLook, bulk: 1.25, beard: 'thick', armor: 0x3a1a1a, cloth: 0x6a1a2a, clothAlt: 0x2a0a10 },
  },
  shinlubu: {
    id: 'shinlubu', name: '真·吕布', title: '天下无双', weaponType: 'halberd', tier: 'boss', color: 0xff1020, heroRef: 'lubu',
    hp: 24000, atk: 120, def: 80, spd: 8.2, moves: ['combo3', 'dashStrike', 'spinAoE', 'slamAoE', 'waveShot', 'leapSlam', 'blink', 'summon', 'finalBurst'],
    look: {
      height: 1.22, bulk: 1.2, skin: 0xe8b890, hair: 0x101010, hairStyle: 'long', beard: 'none',
      headgear: 'pheasant', headgearColor: 0xffc030, headgearAlt: 0xff1010,
      armor: 0x100808, armorTrim: 0xff1e28, cloth: 0xd01020, clothAlt: 0xffc030, pants: 0x1a0a0c, boots: 0x0c0606,
      belt: 0xffc030, cape: 0xc01020, shoulder: 'spiked',
    },
  },
};

// 需要保护的友军 NPC
export const NPCS: Record<string, { name: string; hp: number; look: BossDef['look']; weaponType: BossDef['weaponType'] }> = {
  mifuren: {
    name: '糜夫人', hp: 2500, weaponType: 'sword',
    look: {
      height: 0.92, bulk: 0.85, skin: 0xf6d6b8, hair: 0x1a1210, hairStyle: 'bun', beard: 'none', headgear: 'circlet',
      headgearColor: 0xe0c060, headgearAlt: 0xff6080, armor: 0xf0d0e0, armorTrim: 0xe0c060, cloth: 0xf8e0ea, clothAlt: 0xd08aa0,
      pants: 0xf0d0e0, boots: 0x8a5a6a, belt: 0xe0c060, shoulder: 'none', robe: true, female: true,
    },
  },
  liubei_npc: {
    name: '刘备', hp: 4000, weaponType: 'twinSwords',
    look: {
      height: 1.0, bulk: 1.0, skin: 0xf0c8a0, hair: 0x1a1210, hairStyle: 'topknot', beard: 'goatee', beardColor: 0x1a1210,
      headgear: 'scholarHat', headgearColor: 0x1a1a1a, headgearAlt: 0xe0c060,
      armor: 0x2e8a5a, armorTrim: 0xe0c060, cloth: 0x3aa870, clothAlt: 0xf0e8d0, pants: 0x204a34, boots: 0x2a2018,
      belt: 0xe0c060, cape: 0xf0e8d0, shoulder: 'round', robe: true,
    },
  },
};
