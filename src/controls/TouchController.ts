import { GameState } from '../game/GameState';
import type { Action, InputManager } from './InputManager';
import { VirtualJoystick } from './VirtualJoystick';

// 移动端触摸操作：左侧虚拟摇杆 + 右侧战斗按钮 + 右侧空白区域滑动旋转镜头
// 支持按钮透明度 / 大小 / 位置自定义（拖动编辑模式）

interface BtnDef {
  id: string;
  action: Action;
  label: string;
  right: number;
  bottom: number;
  size: number;
}

const BUTTONS: BtnDef[] = [
  { id: 'attack', action: 'attack', label: '普攻', right: 28, bottom: 26, size: 100 },
  { id: 'heavy', action: 'heavy', label: '重击', right: 142, bottom: 20, size: 76 },
  { id: 'dodge', action: 'dodge', label: '闪避', right: 234, bottom: 24, size: 64 },
  { id: 'skill1', action: 'skill1', label: '技一', right: 132, bottom: 110, size: 64 },
  { id: 'skill2', action: 'skill2', label: '技二', right: 52, bottom: 140, size: 64 },
  { id: 'musou', action: 'musou', label: '无双', right: 212, bottom: 106, size: 72 },
  { id: 'lock', action: 'lock', label: '锁定', right: 18, bottom: 216, size: 48 },
];

export class TouchController {
  layer: HTMLDivElement;
  joystick: VirtualJoystick;
  private camZone: HTMLDivElement;
  private btns = new Map<string, HTMLDivElement>();
  private camTouch: number | null = null;
  private lx = 0;
  private ly = 0;
  private editing = false;

  constructor(private input: InputManager, root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    root.appendChild(this.layer);
    const left = document.createElement('div');
    left.className = 'touch-left';
    this.layer.appendChild(left);
    this.camZone = document.createElement('div');
    this.camZone.className = 'touch-cam';
    this.layer.appendChild(this.camZone);
    this.joystick = new VirtualJoystick(left, (x, y) => {
      input.stickMove.x = x;
      input.stickMove.y = y;
    });
    this.camZone.addEventListener('touchstart', this.camStart, { passive: false });
    this.camZone.addEventListener('touchmove', this.camMove, { passive: false });
    this.camZone.addEventListener('touchend', this.camEnd);
    this.camZone.addEventListener('touchcancel', this.camEnd);
    for (const d of BUTTONS) {
      const b = document.createElement('div');
      b.className = 'tbtn tbtn-' + d.id;
      b.innerHTML = `<span>${d.label}</span><i class="cd"></i>`;
      b.dataset.id = d.id;
      this.layer.appendChild(b);
      this.btns.set(d.id, b);
      const src = 't:' + d.id;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.editing) return;
        b.classList.add('down');
        input.press(d.action, src);
        this.vibrate(8);
      }, { passive: false });
      const up = (e: TouchEvent) => {
        e.preventDefault();
        b.classList.remove('down');
        input.release(d.action, src);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      // 鼠标同样可用（便于桌面调试触屏布局）
      b.addEventListener('mousedown', (e) => {
        if (this.editing) return;
        e.stopPropagation();
        input.press(d.action, src);
      });
      b.addEventListener('mouseup', () => input.release(d.action, src));
      b.addEventListener('mouseleave', () => input.release(d.action, src));
    }
    this.applySettings();
  }

  private vibrate(ms: number): void {
    if (GameState.settings.vibration && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* ignore */
      }
    }
  }

  setVisible(v: boolean): void {
    this.layer.style.display = v ? 'block' : 'none';
    if (!v) {
      this.joystick.reset();
      for (const b of this.btns.values()) b.classList.remove('down');
    }
  }

  applySettings(): void {
    const s = GameState.settings;
    for (const d of BUTTONS) {
      const b = this.btns.get(d.id)!;
      const off = s.buttonOffsets[d.id] ?? [0, 0];
      const size = d.size * s.buttonScale;
      b.style.width = b.style.height = size + 'px';
      b.style.right = `calc(${d.right * s.buttonScale - off[0]}px + env(safe-area-inset-right, 0px))`;
      b.style.bottom = `calc(${d.bottom * s.buttonScale - off[1]}px + env(safe-area-inset-bottom, 0px))`;
      b.style.opacity = String(s.buttonOpacity);
      b.style.fontSize = Math.max(12, size * 0.2) + 'px';
    }
    const jo = s.buttonOffsets['joystick'] ?? [0, 0];
    this.joystick.setScale(s.buttonScale);
    this.joystick.setOffset(jo[0], jo[1]);
    this.joystick.el.style.opacity = String(Math.max(0.3, s.buttonOpacity));
  }

  setMusouReady(ready: boolean, trueMusou: boolean): void {
    const b = this.btns.get('musou')!;
    b.classList.toggle('ready', ready);
    b.classList.toggle('true', ready && trueMusou);
  }

  setCooldown(i: number, frac: number): void {
    const b = this.btns.get(i === 0 ? 'skill1' : 'skill2')!;
    b.style.setProperty('--cd', String(frac));
    b.classList.toggle('cooling', frac > 0);
  }

  setLocked(on: boolean): void {
    this.btns.get('lock')!.classList.toggle('on', on);
  }

  private camStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.camTouch !== null) return;
    const t = e.changedTouches[0];
    this.camTouch = t.identifier;
    this.lx = t.clientX;
    this.ly = t.clientY;
  };

  private camMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.camTouch) continue;
      this.input.addCamera((t.clientX - this.lx) * 1.6, (t.clientY - this.ly) * 1.2);
      this.lx = t.clientX;
      this.ly = t.clientY;
    }
  };

  private camEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === this.camTouch) this.camTouch = null;
  };

  // 布局编辑：拖动按钮调整位置
  enterEditMode(onDone: () => void): void {
    this.editing = true;
    this.setVisible(true);
    this.layer.classList.add('editing');
    const bar = document.createElement('div');
    bar.className = 'edit-bar';
    bar.innerHTML = '<span>拖动按钮调整位置</span><button class="btn small" data-a="reset">重置</button><button class="btn small primary" data-a="done">完成</button>';
    this.layer.appendChild(bar);
    const s = GameState.settings;
    const handlers: Array<() => void> = [];
    const drag = (el: HTMLElement, id: string) => {
      let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
      const down = (x: number, y: number) => {
        on = true;
        sx = x;
        sy = y;
        const o = s.buttonOffsets[id] ?? [0, 0];
        ox = o[0];
        oy = o[1];
      };
      const move = (x: number, y: number) => {
        if (!on) return;
        s.buttonOffsets[id] = [ox + (x - sx), oy + (y - sy)];
        this.applySettings();
      };
      const ts = (e: TouchEvent) => {
        e.preventDefault();
        down(e.touches[0].clientX, e.touches[0].clientY);
      };
      const tm = (e: TouchEvent) => {
        e.preventDefault();
        move(e.touches[0].clientX, e.touches[0].clientY);
      };
      const md = (e: MouseEvent) => down(e.clientX, e.clientY);
      const mm = (e: MouseEvent) => move(e.clientX, e.clientY);
      const up = () => (on = false);
      el.addEventListener('touchstart', ts, { passive: false });
      el.addEventListener('touchmove', tm, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('mousedown', md);
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', up);
      handlers.push(() => {
        el.removeEventListener('touchstart', ts);
        el.removeEventListener('touchmove', tm);
        el.removeEventListener('touchend', up);
        el.removeEventListener('mousedown', md);
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', up);
      });
    };
    for (const [id, el] of this.btns) drag(el, id);
    drag(this.joystick.el, 'joystick');
    bar.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'reset') {
        s.buttonOffsets = {};
        this.applySettings();
      } else if (a === 'done') {
        handlers.forEach((h) => h());
        bar.remove();
        this.editing = false;
        this.layer.classList.remove('editing');
        GameState.save();
        onDone();
      }
    });
  }
}
