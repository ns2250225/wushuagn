import type { FactionColors, LevelDef } from './types';

const DONG: FactionColors = { name: '董卓军', armor: 0x4a2a5a, trim: 0x9a7ab0, cloth: 0x6a2a8a, flag: 0x5a1a7a };
const COALITION: FactionColors = { name: '反董卓联军', armor: 0x2a6a3a, trim: 0xd0c060, cloth: 0x2a8a4a, flag: 0x1f8a3c };
const WEI: FactionColors = { name: '曹军', armor: 0x223a6a, trim: 0xb0c0e0, cloth: 0x2a50a0, flag: 0x1a3a9a };
const SHU: FactionColors = { name: '刘备军', armor: 0x2a6a3a, trim: 0xe0c060, cloth: 0x2a9a50, flag: 0x1a8a3a };
const YUAN: FactionColors = { name: '袁绍军', armor: 0x6a5420, trim: 0xe0c060, cloth: 0xc0a030, flag: 0xd0a010 };
const SUNLIU: FactionColors = { name: '孙刘联军', armor: 0x8a2a2a, trim: 0xe0c060, cloth: 0xc03030, flag: 0xc02020 };
const WEI2: FactionColors = { name: '魏军', armor: 0x2a2a5a, trim: 0xa090e0, cloth: 0x4a3aa0, flag: 0x3a2a9a };

export const LEVELS: LevelDef[] = [
  {
    id: 'hulao',
    name: '虎牢关突围战',
    subtitle: '公元 190 年 · 虎牢关',
    scene: 'hulao',
    desc: '反董卓联军进攻虎牢关。突破拒马防线，斩杀骁将华雄，挑战天下无双的飞将吕布！',
    enemy: DONG,
    ally: COALITION,
    start: [0, -54],
    parTime: 330,
    rewards: { gold: 1500, xp: 900, item: 'ar_leather' },
    unlockHero: 'zhangfei',
    phases: [
      {
        objective: { type: 'clearWaves', text: '清除第一批敌兵' },
        events: [{ type: 'message', text: '联军先锋已抵达虎牢关！击退前方敌兵！', style: 'info' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -30], radius: 9, units: [['sword', 12], ['spear', 8]] },
          { at: 'cleared', spawn: [0, -22], radius: 10, units: [['archer', 6], ['sword', 10], ['spear', 6]], message: '敌军援兵出现！' },
        ],
      },
      {
        objective: { type: 'destroy', targets: ['jm1', 'jm2', 'jm3'], text: '突破敌军防线：摧毁拒马 ({n}/{t})' },
        events: [{ type: 'message', text: '敌军以拒马封锁了道路，摧毁拒马突破防线！', style: 'warn' }],
        waves: [
          { at: 0, spawn: [0, -6], radius: 10, units: [['sword', 10], ['spear', 10], ['heavy', 2]] },
          { at: 0, spawn: [-18, 8], radius: 5, units: [['archer', 5]] },
          { at: 0, spawn: [18, 8], radius: 5, units: [['archer', 5]] },
          { at: 8, spawn: [0, -36], radius: 6, units: [['ally', 6], ['allySpear', 4]], ally: true, message: '联军友军前来支援！' },
          { at: 20, spawn: [0, 10], radius: 10, units: [['sword', 8], ['spear', 6]], repeat: 22 },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'huaxiong', pos: [0, 26], text: '击败敌方精英将领：华雄', guards: [['elite', 2], ['sword', 10]] },
        events: [{ type: 'message', text: '华雄：哼，无名鼠辈，也敢来虎牢关撒野！', style: 'warn' }],
        waves: [
          { at: 10, spawn: [-20, 30], radius: 6, units: [['cavalry', 4]], message: '敌军骑兵冲锋！' },
          { at: 25, spawn: [0, 34], radius: 10, units: [['sword', 8], ['spear', 8], ['heavy', 2]], repeat: 30 },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'lubu', pos: [0, 58], text: '挑战最终 Boss：吕布', guards: [['elite', 4], ['heavy', 2]] },
        events: [
          { type: 'openGate', id: 'gate' },
          { type: 'horn' },
          { type: 'message', text: '虎牢关城门开启！吕布出阵了！', style: 'warn' },
        ],
        waves: [{ at: 15, spawn: [0, 52], radius: 10, units: [['sword', 8], ['spear', 6], ['archer', 4]], repeat: 28 }],
      },
    ],
  },
  {
    id: 'changban',
    name: '长坂坡突围',
    subtitle: '公元 208 年 · 当阳长坂',
    scene: 'changban',
    desc: '曹军追兵铺天盖地。突破包围，保护糜夫人撤退，击败夏侯惇与张辽！',
    enemy: WEI,
    ally: SHU,
    start: [0, -54],
    parTime: 360,
    rewards: { gold: 2200, xp: 1300, item: 'ac_jade' },
    unlockHero: 'liubei',
    phases: [
      {
        objective: { type: 'killCount', count: 60, text: '突破曹军包围：击破敌兵 ({n}/{t})' },
        events: [{ type: 'message', text: '曹军大军压境！杀出一条血路！', style: 'warn' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -32], radius: 12, units: [['sword', 14], ['spear', 10]] },
          { at: 6, spawn: [-22, -20], radius: 6, units: [['archer', 6]] },
          { at: 15, spawn: [20, -18], radius: 8, units: [['sword', 10], ['spear', 8], ['heavy', 2]], repeat: 18 },
          { at: 30, spawn: [-25, -10], radius: 6, units: [['cavalry', 4]], message: '曹军骑兵从侧翼杀来！' },
        ],
      },
      {
        objective: { type: 'protect', npc: 'mifuren', pos: [0, 6], duration: 60, text: '保护糜夫人（坚守 {s} 秒）' },
        events: [{ type: 'message', text: '找到糜夫人了！在援军到来前保护她！', style: 'good' }],
        waves: [
          { at: 2, spawn: [-24, 18], radius: 8, units: [['sword', 8], ['spear', 6]], repeat: 14 },
          { at: 8, spawn: [24, 18], radius: 8, units: [['sword', 8], ['archer', 4]], repeat: 16 },
          { at: 20, spawn: [0, 30], radius: 8, units: [['heavy', 3], ['elite', 1]], message: '曹军精锐逼近！' },
          { at: 35, spawn: [-28, 0], radius: 6, units: [['cavalry', 5]] },
          { at: 45, spawn: [0, -24], radius: 6, units: [['ally', 6], ['allySpear', 6]], ally: true, message: '张飞率援军赶到！' },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'xiahoudun', pos: [0, 32], text: '击败敌将：夏侯惇', guards: [['elite', 2], ['spear', 10]] },
        events: [{ type: 'message', text: '夏侯惇：休走！吃我一刀！', style: 'warn' }],
        waves: [{ at: 15, spawn: [0, 40], radius: 10, units: [['sword', 8], ['spear', 6]], repeat: 25 }],
      },
      {
        objective: { type: 'defeat', boss: 'zhangliao', pos: [0, 54], text: '击败最终 Boss：张辽', guards: [['elite', 3], ['cavalry', 3]] },
        events: [{ type: 'horn' }, { type: 'message', text: '张辽率精骑拦住了去路！', style: 'warn' }],
        waves: [{ at: 12, spawn: [0, 50], radius: 10, units: [['sword', 8], ['archer', 4], ['heavy', 2]], repeat: 26 }],
      },
    ],
  },
  {
    id: 'guandu',
    name: '官渡之战',
    subtitle: '公元 200 年 · 官渡',
    scene: 'guandu',
    desc: '奇袭袁绍军乌巢粮仓！限时内烧毁全部粮仓，击败文丑、颜良。',
    enemy: YUAN,
    ally: WEI,
    start: [0, -54],
    parTime: 380,
    rewards: { gold: 3000, xp: 1800, item: 'ar_chain' },
    unlockHero: 'sunshangxiang',
    phases: [
      {
        objective: { type: 'timedKill', count: 45, time: 75, text: '限时击杀：{s} 秒内击破敌兵 ({n}/{t})' },
        events: [{ type: 'message', text: '限时任务：迅速击溃前沿守军！', style: 'warn' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -30], radius: 12, units: [['sword', 12], ['spear', 10], ['archer', 4]] },
          { at: 10, spawn: [-20, -20], radius: 8, units: [['sword', 8], ['spear', 6]], repeat: 15 },
          { at: 12, spawn: [20, -20], radius: 8, units: [['sword', 8], ['heavy', 2]], repeat: 18 },
        ],
      },
      {
        objective: { type: 'destroy', targets: ['granary1', 'granary2', 'granary3', 'granary4'], text: '烧毁乌巢粮仓 ({n}/{t})' },
        events: [{ type: 'message', text: '粮仓就在前方营寨中，全部烧毁！', style: 'info' }],
        waves: [
          { at: 0, spawn: [-22, 8], radius: 8, units: [['sword', 8], ['spear', 6], ['heavy', 2]] },
          { at: 0, spawn: [22, 8], radius: 8, units: [['sword', 8], ['spear', 6], ['archer', 4]] },
          { at: 15, spawn: [0, 20], radius: 8, units: [['sword', 8], ['spear', 6]], repeat: 18 },
          { at: 25, spawn: [-30, 0], radius: 6, units: [['cavalry', 5]], message: '袁军骑兵来援！' },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'wenchou', pos: [-12, 36], text: '击败敌将：文丑', guards: [['elite', 2], ['spear', 10]] },
        events: [{ type: 'message', text: '文丑：竟敢火烧乌巢，纳命来！', style: 'warn' }],
        waves: [{ at: 15, spawn: [0, 40], radius: 10, units: [['sword', 8], ['spear', 6], ['archer', 3]], repeat: 24 }],
      },
      {
        objective: { type: 'defeat', boss: 'yanliang', pos: [12, 56], text: '击败最终 Boss：颜良', guards: [['elite', 4], ['heavy', 3]] },
        events: [{ type: 'horn' }, { type: 'message', text: '袁绍军上将颜良出现！', style: 'warn' }],
        waves: [{ at: 10, spawn: [0, 52], radius: 10, units: [['sword', 10], ['heavy', 2]], repeat: 24 }],
      },
    ],
  },
  {
    id: 'chibi',
    name: '赤壁之战',
    subtitle: '公元 208 年 · 长江赤壁',
    scene: 'chibi',
    desc: '东风已起，火烧连环船！登上曹军战船，斩断连环锁，击败曹操。',
    enemy: WEI,
    ally: SUNLIU,
    start: [0, -54],
    parTime: 420,
    rewards: { gold: 4000, xp: 2400, item: 'ac_tiger' },
    unlockHero: 'caocao',
    phases: [
      {
        objective: { type: 'clearWaves', text: '肃清江岸曹军' },
        events: [{ type: 'message', text: '东南风起！孙刘联军发起总攻！', style: 'good' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -32], radius: 12, units: [['sword', 12], ['spear', 10], ['archer', 6]] },
          { at: 4, spawn: [0, -46], radius: 6, units: [['ally', 6], ['allyArcher', 4]], ally: true },
          { at: 'cleared', spawn: [0, -20], radius: 10, units: [['heavy', 3], ['sword', 10], ['spear', 6]], message: '曹军反扑！' },
        ],
      },
      {
        objective: { type: 'reach', pos: [0, 0], radius: 6, text: '登上曹军战船' },
        events: [{ type: 'message', text: '战船已被点燃！冲上甲板！', style: 'info' }],
        waves: [{ at: 0, spawn: [0, -6], radius: 8, units: [['sword', 8], ['spear', 6]] }],
      },
      {
        objective: { type: 'destroy', targets: ['chain1', 'chain2', 'chain3'], text: '斩断连环锁 ({n}/{t})' },
        events: [{ type: 'message', text: '斩断连环锁，让火势蔓延到整个船队！', style: 'warn' }],
        waves: [
          { at: 0, spawn: [-16, 14], radius: 6, units: [['sword', 6], ['spear', 6]] },
          { at: 0, spawn: [16, 14], radius: 6, units: [['sword', 6], ['archer', 4]] },
          { at: 12, spawn: [0, 18], radius: 8, units: [['heavy', 2], ['elite', 1], ['sword', 8]], repeat: 20 },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'yujin', pos: [0, 30], text: '击败敌将：于禁', guards: [['elite', 2], ['sword', 8]] },
        events: [],
        waves: [{ at: 15, spawn: [0, 36], radius: 8, units: [['sword', 8], ['spear', 6]], repeat: 22 }],
      },
      {
        objective: { type: 'defeat', boss: 'caocao', pos: [0, 56], text: '击败最终 Boss：曹操', guards: [['elite', 4], ['heavy', 2]] },
        events: [{ type: 'horn' }, { type: 'message', text: '曹操：天下英雄，唯使君与操耳！', style: 'warn' }],
        waves: [{ at: 12, spawn: [0, 50], radius: 10, units: [['sword', 8], ['archer', 4], ['spear', 6]], repeat: 25 }],
      },
    ],
  },
  {
    id: 'chengdu',
    name: '成都攻防战',
    subtitle: '公元 220 年 · 成都',
    scene: 'chengdu',
    desc: '魏军大举进犯成都！与刘备并肩坚守，摧毁攻城车，击败张郃。',
    enemy: WEI2,
    ally: SHU,
    start: [0, -50],
    parTime: 420,
    rewards: { gold: 5200, xp: 3200, item: 'ac_drum' },
    unlockHero: 'lubu',
    phases: [
      {
        objective: { type: 'protect', npc: 'liubei_npc', pos: [0, -36], duration: 70, text: '保护主公刘备（坚守 {s} 秒）' },
        events: [{ type: 'message', text: '魏军攻破外城！保护主公！', style: 'warn' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -14], radius: 10, units: [['sword', 12], ['spear', 8]] },
          { at: 8, spawn: [-24, -20], radius: 6, units: [['sword', 6], ['archer', 4]], repeat: 15 },
          { at: 12, spawn: [24, -20], radius: 6, units: [['spear', 6], ['heavy', 2]], repeat: 16 },
          { at: 30, spawn: [0, -4], radius: 8, units: [['elite', 2], ['heavy', 2]], message: '魏军精锐出现！' },
          { at: 40, spawn: [0, -56], radius: 5, units: [['ally', 6], ['allySpear', 4], ['allyArcher', 4]], ally: true, message: '成都守军赶到！' },
        ],
      },
      {
        objective: { type: 'destroy', targets: ['tower1', 'tower2'], text: '摧毁魏军攻城车 ({n}/{t})' },
        events: [{ type: 'message', text: '攻城车正在撞击城门，立刻摧毁！', style: 'warn' }],
        waves: [
          { at: 0, spawn: [-20, 14], radius: 8, units: [['sword', 8], ['heavy', 2], ['spear', 4]] },
          { at: 0, spawn: [20, 14], radius: 8, units: [['sword', 8], ['archer', 4], ['spear', 4]] },
          { at: 14, spawn: [0, 24], radius: 10, units: [['sword', 10], ['spear', 6]], repeat: 20 },
          { at: 22, spawn: [30, 0], radius: 6, units: [['cavalry', 5]] },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'zhanghe', pos: [0, 50], text: '击败最终 Boss：张郃', guards: [['elite', 4], ['heavy', 2], ['archer', 4]] },
        events: [{ type: 'horn' }, { type: 'message', text: '张郃：美丽的战斗，就由我来终结！', style: 'warn' }],
        waves: [{ at: 12, spawn: [0, 44], radius: 10, units: [['sword', 10], ['spear', 6], ['heavy', 2]], repeat: 24 }],
      },
    ],
  },
  {
    id: 'luoyang',
    name: '洛阳决战',
    subtitle: '终章 · 洛阳',
    scene: 'luoyang',
    desc: '最终决战！攻破洛阳宫门，击败李傕，与真·吕布展开最后的对决。',
    enemy: DONG,
    ally: COALITION,
    start: [0, -54],
    parTime: 480,
    rewards: { gold: 8000, xp: 5000, item: 'ac_seal' },
    phases: [
      {
        objective: { type: 'killCount', count: 90, text: '攻入洛阳：击破敌兵 ({n}/{t})' },
        events: [{ type: 'message', text: '决战之时！攻入洛阳！', style: 'warn' }, { type: 'horn' }],
        waves: [
          { at: 0, spawn: [0, -30], radius: 12, units: [['sword', 14], ['spear', 10], ['archer', 6]] },
          { at: 6, spawn: [0, -48], radius: 6, units: [['ally', 6], ['allySpear', 6]], ally: true },
          { at: 10, spawn: [-22, -16], radius: 8, units: [['sword', 8], ['heavy', 2], ['spear', 6]], repeat: 14 },
          { at: 12, spawn: [22, -16], radius: 8, units: [['sword', 8], ['elite', 1], ['spear', 6]], repeat: 15 },
          { at: 30, spawn: [0, -8], radius: 8, units: [['cavalry', 6]], message: '西凉铁骑来袭！' },
        ],
      },
      {
        objective: { type: 'destroy', targets: ['gate'], text: '攻破洛阳宫门' },
        events: [{ type: 'message', text: '宫门紧闭，破门而入！', style: 'info' }],
        waves: [
          { at: 0, spawn: [0, 4], radius: 10, units: [['heavy', 4], ['sword', 10], ['spear', 6]] },
          { at: 0, spawn: [-18, 10], radius: 5, units: [['archer', 5]] },
          { at: 0, spawn: [18, 10], radius: 5, units: [['archer', 5]] },
          { at: 15, spawn: [0, 0], radius: 10, units: [['sword', 8], ['elite', 1]], repeat: 18 },
        ],
      },
      {
        objective: { type: 'defeat', boss: 'lijue', pos: [0, 34], text: '击败敌将：李傕', guards: [['elite', 3], ['heavy', 3]] },
        events: [{ type: 'message', text: '李傕：休想靠近相国一步！', style: 'warn' }],
        waves: [{ at: 12, spawn: [0, 38], radius: 10, units: [['sword', 10], ['spear', 6]], repeat: 22 }],
      },
      {
        objective: { type: 'defeat', boss: 'shinlubu', pos: [0, 58], text: '最终决战：真·吕布', guards: [['elite', 4], ['heavy', 2], ['cavalry', 2]] },
        events: [{ type: 'horn' }, { type: 'message', text: '真·吕布：来吧！让我看看你的极限！', style: 'warn' }],
        waves: [{ at: 10, spawn: [0, 52], radius: 10, units: [['sword', 10], ['spear', 6], ['archer', 4], ['heavy', 2]], repeat: 24 }],
      },
    ],
  },
];

export function levelById(id: string): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

export const ACHIEVEMENTS: Array<{ id: string; name: string; desc: string; gold: number }> = [
  { id: 'first_clear', name: '初出茅庐', desc: '首次完成任意关卡', gold: 500 },
  { id: 'kill100', name: '百人斩', desc: '单场击破 100 名敌兵', gold: 600 },
  { id: 'kill300', name: '一骑当千', desc: '单场击破 300 名敌兵', gold: 1500 },
  { id: 'combo100', name: '连击达人', desc: '达成 100 连击', gold: 800 },
  { id: 'combo300', name: '无双乱舞', desc: '达成 300 连击', gold: 2000 },
  { id: 'nodamage', name: '毫发无伤', desc: '以 90% 以上生命值完成关卡', gold: 1200 },
  { id: 'rankS', name: '万夫莫敌', desc: '获得 S 评价', gold: 1500 },
  { id: 'allheroes', name: '群英荟萃', desc: '解锁全部武将', gold: 3000 },
  { id: 'campaign', name: '天下统一', desc: '完成全部战役', gold: 5000 },
  { id: 'chaos', name: '修罗之道', desc: '以修罗难度完成任意关卡', gold: 5000 },
  { id: 'forge10', name: '神兵利器', desc: '将任意武器强化至 +10', gold: 3000 },
  { id: 'lv30', name: '百战名将', desc: '任意武将达到 30 级', gold: 3000 },
];
