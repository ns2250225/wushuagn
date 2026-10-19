import type { BattleResult } from '../game/Battle';
import { DIFFICULTY } from '../data/types';

// 结算界面：胜负、战绩、评价与奖励

export interface ResultExtras {
  levelUps: number;
  newLevel: number;
  unlockedHero: string | null;
  item: string | null;
  achievements: string[];
  hasNext: boolean;
  newBestCombo: boolean;
}

export function renderResult(el: HTMLElement, r: BattleResult, x: ResultExtras, on: (a: 'next' | 'retry' | 'menu') => void): void {
  const t = Math.floor(r.time);
  const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  el.innerHTML = `
    <div class="result ${r.victory ? 'win' : 'lose'}">
      <h1>${r.victory ? '胜 利' : '战 败'}</h1>
      <h3>${r.level.name} · ${DIFFICULTY[r.difficulty].name}${r.reason ? ' · ' + r.reason : ''}</h3>
      <div class="rank rank-${r.rank}">${r.victory ? r.rank : ''}</div>
      <div class="stats">
        <div><span>用时</span><b>${time}</b></div>
        <div><span>击破数</span><b>${r.kills}</b></div>
        <div><span>最高连击</span><b>${r.maxCombo}${x.newBestCombo ? ' <em>新纪录</em>' : ''}</b></div>
        <div><span>受到伤害</span><b>${Math.round(r.damageTaken)}</b></div>
        <div><span>剩余生命</span><b>${Math.round(r.hpRatio * 100)}%</b></div>
        ${r.timedFailed ? '<div><span>限时任务</span><b class="bad">失败</b></div>' : ''}
      </div>
      <div class="rewards">
        <div>金币 <b>+${r.gold}</b></div>
        <div>经验 <b>+${r.xp}</b>${x.levelUps > 0 ? ` <em>等级提升！Lv${x.newLevel}</em>` : ''}</div>
        ${x.item ? `<div>获得装备 <b>${x.item}</b></div>` : ''}
        ${x.unlockedHero ? `<div class="unlock">解锁新武将：<b>${x.unlockedHero}</b></div>` : ''}
        ${x.achievements.map((a) => `<div class="ach">达成成就：<b>${a}</b></div>`).join('')}
      </div>
      <div class="actions">
        ${r.victory && x.hasNext ? '<button class="btn primary" data-a="next">下一关</button>' : ''}
        <button class="btn ${r.victory ? '' : 'primary'}" data-a="retry">再次挑战</button>
        <button class="btn" data-a="menu">返回主菜单</button>
      </div>
    </div>`;
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => on((b as HTMLElement).dataset.a as any)));
}
