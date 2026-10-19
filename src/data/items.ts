import type { Element, GearItem, WeaponItem } from './types';

export const ELEMENT_INFO: Record<Element, { name: string; color: number; desc: string }> = {
  none: { name: '无', color: 0xffffff, desc: '无附加属性' },
  fire: { name: '炎', color: 0xff6020, desc: '命中有几率使敌人持续灼烧' },
  thunder: { name: '雷', color: 0x80c0ff, desc: '命中有几率引发连锁雷击' },
  ice: { name: '冰', color: 0xa0f0ff, desc: '命中有几率冻结敌人使其减速' },
  slash: { name: '斩', color: 0xffe080, desc: '命中有几率造成敌人当前生命比例伤害' },
  wind: { name: '风', color: 0xa0ffb0, desc: '提升攻击范围与击退距离' },
};

function w(hero: string, tier: number, id: string, name: string, atk: number, element: Element, price: number, reqLevel: number, desc: string): WeaponItem {
  return { id, hero, tier, name, atk, element, price, reqLevel, desc };
}

export const WEAPONS: WeaponItem[] = [
  w('zhaoyun', 1, 'zy_w1', '龙胆枪', 0, 'none', 0, 1, '赵云的初始长枪，轻巧锐利。'),
  w('zhaoyun', 2, 'zy_w2', '涯角枪', 40, 'thunder', 2600, 8, '枪尖缠绕雷光，命中可引发连锁雷击。'),
  w('zhaoyun', 3, 'zy_w3', '龙胆亮银枪', 95, 'wind', 9000, 20, '传说中的亮银枪，枪风可扩大攻击范围。'),
  w('guanyu', 1, 'gy_w1', '青龙偃月刀', 0, 'none', 0, 1, '重八十二斤的偃月大刀。'),
  w('guanyu', 2, 'gy_w2', '冷艳锯', 45, 'slash', 2800, 8, '寒光逼人，可一击削去敌人大量生命。'),
  w('guanyu', 3, 'gy_w3', '青龙神刀', 100, 'fire', 9500, 20, '刀身燃烧青焰，命中使敌人灼烧。'),
  w('zhangfei', 1, 'zf_w1', '丈八蛇矛', 0, 'none', 0, 1, '矛身蜿蜒如蛇的长矛。'),
  w('zhangfei', 2, 'zf_w2', '点钢蛇矛', 48, 'fire', 2800, 8, '烈火淬炼的蛇矛。'),
  w('zhangfei', 3, 'zf_w3', '燕人神矛', 105, 'slash', 9800, 20, '震慑万军的神矛。'),
  w('lubu', 1, 'lb_w1', '方天画戟', 0, 'none', 0, 1, '飞将的象征。'),
  w('lubu', 2, 'lb_w2', '无双戟', 55, 'thunder', 3200, 8, '雷霆环绕的画戟。'),
  w('lubu', 3, 'lb_w3', '神鬼画戟', 120, 'slash', 12000, 20, '人中吕布，马中赤兔。'),
  w('liubei', 1, 'lbei_w1', '双股剑', 0, 'none', 0, 1, '刘备的雌雄双剑。'),
  w('liubei', 2, 'lbei_w2', '翡翠双剑', 40, 'ice', 2500, 8, '寒玉铸成，命中可使敌人冻结减速。'),
  w('liubei', 3, 'lbei_w3', '昭烈双剑', 92, 'thunder', 9000, 20, '仁德之剑，雷光护体。'),
  w('sunshangxiang', 1, 'ssx_w1', '乾坤圈', 0, 'none', 0, 1, '轻巧的双环刃。'),
  w('sunshangxiang', 2, 'ssx_w2', '日月乾坤圈', 42, 'fire', 2600, 8, '日月之光凝于环刃。'),
  w('sunshangxiang', 3, 'ssx_w3', '弓腰姬神环', 96, 'wind', 9200, 20, '环刃破风，范围更广。'),
  w('caocao', 1, 'cc_w1', '倚天剑', 0, 'none', 0, 1, '曹操的佩剑。'),
  w('caocao', 2, 'cc_w2', '青釭剑', 44, 'slash', 2800, 8, '削铁如泥的宝剑。'),
  w('caocao', 3, 'cc_w3', '魏武霸剑', 100, 'ice', 9600, 20, '霸者之剑，寒气逼人。'),
];

export const GEAR: GearItem[] = [
  { id: 'ar_leather', slot: 'armor', tier: 1, name: '皮甲', bonus: { def: 10, hp: 80 }, price: 600, desc: '基础的皮制护甲。' },
  { id: 'ar_chain', slot: 'armor', tier: 2, name: '锁子甲', bonus: { def: 25, hp: 200 }, price: 2400, desc: '铁环编织的铠甲。' },
  { id: 'ar_mingguang', slot: 'armor', tier: 3, name: '明光铠', bonus: { def: 45, hp: 420 }, price: 6800, desc: '胸前护心镜光可鉴人。' },
  { id: 'ar_dragon', slot: 'armor', tier: 4, name: '龙鳞宝甲', bonus: { def: 70, hp: 800 }, price: 15000, desc: '传说以龙鳞制成的宝甲。' },
  { id: 'ac_jade', slot: 'accessory', tier: 1, name: '玉佩', bonus: { musou: 0.15 }, price: 800, desc: '无双能量获取 +15%。' },
  { id: 'ac_tiger', slot: 'accessory', tier: 2, name: '虎符', bonus: { crit: 0.08, atk: 10 }, price: 2200, desc: '暴击率 +8%，攻击 +10。' },
  { id: 'ac_saddle', slot: 'accessory', tier: 2, name: '赤兔马鞍', bonus: { spd: 1.0, aspd: 0.05 }, price: 2600, desc: '移动速度 +1，攻速 +5%。' },
  { id: 'ac_drum', slot: 'accessory', tier: 3, name: '战鼓', bonus: { aspd: 0.12, atk: 15 }, price: 5200, desc: '攻速 +12%，攻击 +15。' },
  { id: 'ac_seal', slot: 'accessory', tier: 3, name: '传国玉玺', bonus: { musou: 0.35, hp: 200 }, price: 7600, desc: '无双能量获取 +35%，生命 +200。' },
  { id: 'ac_wings', slot: 'accessory', tier: 4, name: '雉羽金冠', bonus: { crit: 0.15, atk: 30, range: 0.1 }, price: 14000, desc: '暴击率 +15%，攻击 +30，范围 +10%。' },
];

export function weaponById(id: string): WeaponItem | undefined {
  return WEAPONS.find((x) => x.id === id);
}
export function gearById(id: string): GearItem | undefined {
  return GEAR.find((x) => x.id === id);
}

export const MAX_FORGE = 10;
export function forgeCost(tier: number, lv: number): number {
  return Math.round((300 + tier * 250) * Math.pow(1.35, lv));
}
export function forgeAtk(tier: number, lv: number): number {
  return Math.round(lv * (6 + tier * 3));
}

// 战场掉落道具
export type PickupKind = 'meat' | 'wine' | 'power' | 'gold' | 'shield';
export const PICKUPS: Record<PickupKind, { name: string; color: number }> = {
  meat: { name: '肉包', color: 0xffb070 },
  wine: { name: '美酒', color: 0x60c0ff },
  power: { name: '攻击力上升', color: 0xff4040 },
  shield: { name: '防御力上升', color: 0x60ff80 },
  gold: { name: '金币', color: 0xffe040 },
};
