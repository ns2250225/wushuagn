import * as THREE from 'three';
import type { Battle } from '../game/Battle';
import { GameState } from '../game/GameState';
import { SKILLS } from '../data/heroes';
import { keyLabel } from '../controls/KeyboardController';
import { isTouchDevice } from '../game/PerformanceManager';

// 战斗 HUD：头像、生命 / 无双条、连击、击杀、战场目标、小地图、Boss 血条、技能冷却、伤害数字、提示与横幅

const _v = new THREE.Vector3();

function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

interface DmgNum {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  active: boolean;
  vy: number;
}

export class HUD {
  root: HTMLDivElement;
  private q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
  private hpFill!: HTMLDivElement;
  private hpGhost!: HTMLDivElement;
  private hpText!: HTMLSpanElement;
  private muFill!: HTMLDivElement;
  private muWrap!: HTMLDivElement;
  private comboEl!: HTMLDivElement;
  private comboNum!: HTMLSpanElement;
  private comboRate!: HTMLSpanElement;
  private comboBar!: HTMLDivElement;
  private killsEl!: HTMLSpanElement;
  private bestEl!: HTMLSpanElement;
  private objEl!: HTMLDivElement;
  private objText!: HTMLDivElement;
  private objSub!: HTMLDivElement;
  private bossEl!: HTMLDivElement;
  private bossFill!: HTMLDivElement;
  private bossGhost!: HTMLDivElement;
  private bossName!: HTMLSpanElement;
  private bossPhase!: HTMLSpanElement;
  private toastBox!: HTMLDivElement;
  private bannerEl!: HTMLDivElement;
  private vignette!: HTMLDivElement;
  private flashEl!: HTMLDivElement;
  private mini!: HTMLCanvasElement;
  private miniCtx!: CanvasRenderingContext2D;
  private skillEls: HTMLDivElement[] = [];
  private dodgeEl!: HTMLDivElement;
  private buffEl!: HTMLDivElement;
  private lockEl!: HTMLDivElement;
  private arrowEl!: HTMLDivElement;
  private fpsEl!: HTMLDivElement;
  private timeEl!: HTMLSpanElement;
  private skillNameEl!: HTMLDivElement;
  private nums: DmgNum[] = [];
  private ghostHp = 1;
  private ghostBoss = 1;
  private lastCombo = 0;
  private miniAcc = 0;
  private hurtT = 0;
  private toasts: { el: HTMLDivElement; t: number }[] = [];
  onPause: (() => void) | null = null;

  constructor(parent: HTMLElement, private b: Battle) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const h = b.player.hero;
    const k = GameState.settings.keys;
    const touch = isTouchDevice();
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="portrait" style="--c:${hexCss(h.color)}"><b>${h.name[0]}</b><em class="plv">Lv${GameState.hero(h.id).level}</em></div>
        <div class="bars">
          <div class="hname">${h.name}<small>${h.title}</small></div>
          <div class="hp"><div class="ghost"></div><div class="fill"></div><span></span></div>
          <div class="mu"><div class="fill"></div><span>无双</span></div>
          <div class="sub"><div class="dodge"></div><div class="buffs"></div></div>
        </div>
      </div>
      <div class="hud-tc">
        <div class="bossbar hidden"><div class="bn"><span class="name"></span><span class="phase"></span></div><div class="bb"><div class="ghost"></div><div class="fill"></div></div></div>
      </div>
      <div class="hud-tr">
        <canvas class="minimap" width="150" height="150"></canvas>
        <div class="objective"><div class="ot"></div><div class="os"></div></div>
        <div class="pausebtn" title="暂停">❚❚</div>
      </div>
      <div class="combo hidden"><span class="cn">0</span><em>连击</em><span class="cr"></span><div class="cbar"><div></div></div></div>
      <div class="killbox">击破 <span class="kills">0</span><br><small>最高连击 <span class="best">0</span> · <span class="time">0:00</span></small></div>
      <div class="skills ${touch ? 'hidden' : ''}">
        <div class="sk" data-i="0"><i></i><b>${SKILLS[h.skills[0]].name}</b><kbd>${keyLabel(k.skill1)}</kbd></div>
        <div class="sk" data-i="1"><i></i><b>${SKILLS[h.skills[1]].name}</b><kbd>${keyLabel(k.skill2)}</kbd></div>
        <div class="sk mu" data-i="2"><i></i><b>${SKILLS[h.musou].name}</b><kbd>${keyLabel(k.musou)}</kbd></div>
      </div>
      <div class="toasts"></div>
      <div class="banner"></div>
      <div class="skillname"></div>
      <div class="lockon hidden"></div>
      <div class="objarrow hidden">▲</div>
      <div class="vignette"></div>
      <div class="screenflash"></div>
      <div class="fps hidden"></div>
    `;
    parent.appendChild(this.root);
    this.hpFill = this.q('.hp .fill');
    this.hpGhost = this.q('.hp .ghost');
    this.hpText = this.q('.hp span');
    this.muFill = this.q('.mu .fill');
    this.muWrap = this.q('.mu');
    this.comboEl = this.q('.combo');
    this.comboNum = this.q('.combo .cn');
    this.comboRate = this.q('.combo .cr');
    this.comboBar = this.q('.combo .cbar div');
    this.killsEl = this.q('.kills');
    this.bestEl = this.q('.best');
    this.timeEl = this.q('.time');
    this.objEl = this.q('.objective');
    this.objText = this.q('.objective .ot');
    this.objSub = this.q('.objective .os');
    this.bossEl = this.q('.bossbar');
    this.bossFill = this.q('.bossbar .fill');
    this.bossGhost = this.q('.bossbar .ghost');
    this.bossName = this.q('.bossbar .name');
    this.bossPhase = this.q('.bossbar .phase');
    this.toastBox = this.q('.toasts');
    this.bannerEl = this.q('.banner');
    this.skillNameEl = this.q('.skillname');
    this.vignette = this.q('.vignette');
    this.flashEl = this.q('.screenflash');
    this.mini = this.q('.minimap');
    this.miniCtx = this.mini.getContext('2d')!;
    this.skillEls = Array.from(this.root.querySelectorAll('.sk')) as HTMLDivElement[];
    this.dodgeEl = this.q('.dodge');
    this.buffEl = this.q('.buffs');
    this.lockEl = this.q('.lockon');
    this.arrowEl = this.q('.objarrow');
    this.fpsEl = this.q('.fps');
    this.q('.pausebtn').addEventListener('click', () => this.onPause?.());
    this.q('.pausebtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onPause?.();
    });
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.nums.push({ el, pos: new THREE.Vector3(), t: 0, active: false, vy: 0 });
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  // ---------- 事件型 UI ----------
  damageNumber(pos: THREE.Vector3, value: number, crit: boolean, color?: number): void {
    if (!GameState.settings.damageNumbers) return;
    let n = this.nums.find((x) => !x.active);
    if (!n) n = this.nums.reduce((a, c) => (c.t > a.t ? c : a));
    n.active = true;
    n.t = 0;
    n.vy = 1.8;
    n.pos.set(pos.x + (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.6);
    n.el.textContent = String(Math.round(value));
    n.el.className = 'dmg' + (crit ? ' crit' : '');
    n.el.style.color = color !== undefined ? hexCss(color) : '';
    n.el.style.display = 'block';
  }

  hurt(): void {
    this.hurtT = 0.35;
  }

  flash(color: string, strength: number): void {
    if (!GameState.settings.strongFlash) strength *= 0.25;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = String(strength);
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity 0.45s ease-out';
    this.flashEl.style.opacity = '0';
  }

  toast(text: string, style: 'info' | 'warn' | 'good' = 'info'): void {
    const el = document.createElement('div');
    el.className = 'toast ' + style;
    el.textContent = text;
    this.toastBox.appendChild(el);
    this.toasts.push({ el, t: 3.2 });
    while (this.toasts.length > 4) this.toasts.shift()!.el.remove();
  }

  banner(text: string, color: number, sub = ''): void {
    this.bannerEl.innerHTML = `<div style="--c:${hexCss(color)}">${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  skillName(name: string, color: number): void {
    this.skillNameEl.textContent = name;
    this.skillNameEl.style.color = hexCss(color);
    this.skillNameEl.classList.remove('show');
    void this.skillNameEl.offsetWidth;
    this.skillNameEl.classList.add('show');
  }

  objective(text: string, isNew: boolean): void {
    this.objText.textContent = text;
    if (isNew) {
      this.objEl.classList.remove('new');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('new');
      this.banner('战场目标更新', 0xffd040, text);
    }
  }

  objectiveText(text: string): void {
    if (this.objText.textContent !== text) this.objText.textContent = text;
  }

  milestone(n: number, label: string): void {
    this.banner(`${n} 连击！`, 0xffd040, label);
  }

  // ---------- 每帧刷新 ----------
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const b = this.b;
    const p = b.player;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // 生命 / 无双
    const hpk = p.hp / p.maxHp;
    this.ghostHp = Math.max(hpk, this.ghostHp - dt * 0.4);
    this.hpFill.style.width = hpk * 100 + '%';
    this.hpGhost.style.width = this.ghostHp * 100 + '%';
    this.hpFill.classList.toggle('low', hpk < 0.25);
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.muFill.style.width = p.musou + '%';
    this.muWrap.classList.toggle('full', p.musou >= 100);
    this.muWrap.classList.toggle('true', p.musou >= 100 && hpk < 0.25);
    // 闪避体力
    let pips = '';
    for (let i = 0; i < p.dodgeMax; i++) pips += `<i class="${i < p.dodgeCharges ? 'on' : ''}"></i>`;
    if (this.dodgeEl.innerHTML !== pips) this.dodgeEl.innerHTML = pips;
    // 增益
    let buffs = '';
    if (p.atkBuff.t > 0) buffs += `<span class="bf atk">攻 ${Math.ceil(p.atkBuff.t)}</span>`;
    if (p.defBuff.t > 0) buffs += `<span class="bf def">防 ${Math.ceil(p.defBuff.t)}</span>`;
    if (p.tyrantT > 0) buffs += `<span class="bf ty">霸 ${Math.ceil(p.tyrantT)}</span>`;
    if (p.orbitT > 0) buffs += `<span class="bf or">环 ${Math.ceil(p.orbitT)}</span>`;
    if (this.buffEl.innerHTML !== buffs) this.buffEl.innerHTML = buffs;
    // 连击
    const c = b.combo;
    if (c.count > 1) {
      this.comboEl.classList.remove('hidden');
      if (c.count !== this.lastCombo) {
        this.comboNum.textContent = String(c.count);
        this.comboEl.classList.remove('pop');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('pop');
        this.comboRate.textContent = c.rating();
      }
      this.comboBar.style.width = (c.timer / c.window) * 100 + '%';
    } else this.comboEl.classList.add('hidden');
    this.lastCombo = c.count;
    this.killsEl.textContent = String(b.stats.kills);
    this.bestEl.textContent = String(c.best);
    const tt = Math.floor(b.stats.time);
    this.timeEl.textContent = `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`;
    // 技能冷却
    for (let i = 0; i < 2; i++) {
      const f = p.skillMax[i] > 0 ? p.skillCd[i] / p.skillMax[i] : 0;
      const el = this.skillEls[i];
      el.style.setProperty('--cd', String(f));
      el.classList.toggle('cooling', f > 0);
      b.touch?.setCooldown(i, f);
    }
    this.skillEls[2].classList.toggle('ready', p.musou >= 100);
    b.touch?.setMusouReady(p.musou >= 100, hpk < 0.25);
    // Boss 血条（当前交战中的敌将）
    const boss = b.engagedBoss();
    if (boss) {
      this.bossEl.classList.remove('hidden');
      const k = boss.hp / boss.maxHp;
      this.ghostBoss = Math.max(k, Math.min(this.ghostBoss, 1) - dt * 0.3);
      if (this.ghostBoss < k) this.ghostBoss = k;
      this.bossFill.style.width = k * 100 + '%';
      this.bossGhost.style.width = this.ghostBoss * 100 + '%';
      this.bossName.textContent = `${boss.def.tier === 'boss' ? '敌将' : '副将'} · ${boss.name}`;
      this.bossPhase.textContent = boss.phaseLabel;
      this.bossEl.classList.toggle('enraged', boss.enraged);
      this.bossEl.classList.toggle('vuln', boss.vulnerable > 0);
    } else {
      this.bossEl.classList.add('hidden');
      this.ghostBoss = 1;
    }
    // 保护目标血量
    const npc = b.npcs.find((n) => n.alive);
    const sub = npc ? `${npc.name} 生命 ${Math.round((npc.hp / npc.maxHp) * 100)}%` : '';
    if (this.objSub.textContent !== sub) this.objSub.textContent = sub;
    // 受伤红晕
    this.hurtT = Math.max(0, this.hurtT - dt);
    const low = hpk < 0.25 ? 0.35 + Math.sin(performance.now() / 200) * 0.15 : 0;
    this.vignette.style.opacity = String(Math.max(this.hurtT * 2, low));
    // 提示
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t -= dt;
      if (t.t < 0.4) t.el.style.opacity = String(Math.max(0, t.t / 0.4));
      if (t.t <= 0) {
        t.el.remove();
        this.toasts.splice(i, 1);
      }
    }
    // 伤害数字
    for (const n of this.nums) {
      if (!n.active) continue;
      n.t += dt;
      n.pos.y += n.vy * dt;
      n.vy *= 0.92;
      if (n.t > 0.8) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      _v.copy(n.pos).project(camera);
      if (_v.z > 1) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      const x = (_v.x * 0.5 + 0.5) * W;
      const y = (-_v.y * 0.5 + 0.5) * H;
      const s = n.t < 0.1 ? 1.4 - n.t * 4 : 1;
      n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
      n.el.style.opacity = String(n.t > 0.55 ? 1 - (n.t - 0.55) / 0.25 : 1);
    }
    // 锁定标记
    const lock = b.lockTarget;
    if (lock && lock.alive) {
      _v.set(lock.pos.x, 1.2, lock.pos.z).project(camera);
      if (_v.z < 1) {
        this.lockEl.classList.remove('hidden');
        this.lockEl.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px) translate(-50%, -50%)`;
      } else this.lockEl.classList.add('hidden');
    } else this.lockEl.classList.add('hidden');
    // 目标方向指示
    const markers = b.levelMgr.objective?.markers ?? [];
    if (markers.length) {
      let best = markers[0];
      let bd = Infinity;
      for (const m of markers) {
        const d = m.distanceToSquared(p.pos);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      _v.set(best.x, 1.5, best.z).project(camera);
      const on = _v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.85;
      if (!on && bd > 36) {
        const ang = Math.atan2(best.x - p.pos.x, best.z - p.pos.z) - b.cam.yaw;
        this.arrowEl.classList.remove('hidden');
        const r = Math.min(W, H) * 0.32;
        const ax = W / 2 - Math.sin(ang) * r;
        const ay = H / 2 - Math.cos(ang) * r;
        this.arrowEl.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -50%) rotate(${-ang}rad)`;
      } else this.arrowEl.classList.add('hidden');
    } else this.arrowEl.classList.add('hidden');
    // 小地图
    this.miniAcc += dt;
    if (this.miniAcc > 0.1) {
      this.miniAcc = 0;
      this.drawMinimap(markers);
    }
    const sf = GameState.settings.showFps;
    this.fpsEl.classList.toggle('hidden', !sf);
    if (sf) this.fpsEl.textContent = `${Math.round(b.perfFps())} FPS · 敌 ${b.pool.countTeam(1)} · 粒子 ${b.fx.particles.active}`;
  }

  private drawMinimap(markers: THREE.Vector3[]): void {
    const b = this.b;
    const ctx = this.miniCtx;
    const S = 150;
    const R = 34; // 显示半径（米）
    const p = b.player.pos;
    const yaw = b.cam.yaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const map = (x: number, z: number): [number, number] => {
      const dx = x - p.x, dz = z - p.z;
      // 旋转使镜头朝向为上
      const rx = -dx * cs + dz * sn;
      const rz = dx * sn + dz * cs;
      return [S / 2 + (rx / R) * (S / 2), S / 2 - (rz / R) * (S / 2)];
    };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,16,10,0.55)';
    ctx.fill();
    ctx.clip();
    // 建筑碰撞体
    ctx.fillStyle = 'rgba(200,190,160,0.35)';
    for (const c of b.env.colliders) {
      if (c.off || c.h < 1.5) continue;
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      if (Math.abs(cx - p.x) > R + 30 || Math.abs(cz - p.z) > R + 30) continue;
      const pts = [map(c.minX, c.minZ), map(c.maxX, c.minZ), map(c.maxX, c.maxZ), map(c.minX, c.maxZ)];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.fill();
    }
    for (const s of b.pool.active) {
      if (s.dying) continue;
      const [x, y] = map(s.pos.x, s.pos.z);
      ctx.fillStyle = s.team === 1 ? (s.type.id === 'elite' ? '#ffb030' : '#ff4040') : '#40a0ff';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const n of b.npcs) {
      if (!n.alive) continue;
      const [x, y] = map(n.pos.x, n.pos.z);
      ctx.fillStyle = '#40ff80';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const bo of b.bosses) {
      if (!bo.alive) continue;
      const [x, y] = map(bo.pos.x, bo.pos.z);
      ctx.fillStyle = '#ff2050';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    for (const m of markers) {
      let [x, y] = map(m.x, m.z);
      const dx = x - S / 2, dy = y - S / 2;
      const d = Math.hypot(dx, dy);
      if (d > S / 2 - 8) {
        x = S / 2 + (dx / d) * (S / 2 - 8);
        y = S / 2 + (dy / d) * (S / 2 - 8);
      }
      ctx.fillStyle = '#ffe040';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', x, y + 4);
    }
    ctx.restore();
    // 玩家箭头
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-(b.player.facing - yaw));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,220,140,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  dispose(): void {
    this.root.remove();
  }
}
