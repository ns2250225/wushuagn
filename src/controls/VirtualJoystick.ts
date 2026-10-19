// 虚拟摇杆：左下区域任意位置按下即生成摇杆（动态原点）

export class VirtualJoystick {
  el: HTMLDivElement;
  private knob: HTMLDivElement;
  private touchId: number | null = null;
  private ox = 0;
  private oy = 0;
  private radius = 56;
  x = 0;
  y = 0;
  private baseX = 0;
  private baseY = 0;

  constructor(private zone: HTMLElement, private onChange: (x: number, y: number) => void) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.el.appendChild(this.knob);
    zone.appendChild(this.el);
    zone.addEventListener('touchstart', this.start, { passive: false });
    zone.addEventListener('touchmove', this.move, { passive: false });
    zone.addEventListener('touchend', this.end, { passive: false });
    zone.addEventListener('touchcancel', this.end, { passive: false });
    this.placeDefault();
  }

  setScale(s: number): void {
    this.radius = 56 * s;
    this.el.style.width = this.el.style.height = 150 * s + 'px';
    this.knob.style.width = this.knob.style.height = 64 * s + 'px';
    this.placeDefault();
  }

  setOffset(dx: number, dy: number): void {
    this.baseX = dx;
    this.baseY = dy;
    this.placeDefault();
  }

  private placeDefault(): void {
    const r = this.zone.getBoundingClientRect();
    const w = this.el.offsetWidth || 150;
    this.el.style.left = 40 + this.baseX + 'px';
    this.el.style.top = (r.height || window.innerHeight) - w - 30 + this.baseY + 'px';
    this.el.classList.remove('active');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private start = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.touchId !== null) return;
    const t = e.changedTouches[0];
    this.touchId = t.identifier;
    const r = this.zone.getBoundingClientRect();
    this.ox = t.clientX;
    this.oy = t.clientY;
    const w = this.el.offsetWidth;
    this.el.style.left = t.clientX - r.left - w / 2 + 'px';
    this.el.style.top = t.clientY - r.top - w / 2 + 'px';
    this.el.classList.add('active');
    this.update(t.clientX, t.clientY);
  };

  private move = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) if (t.identifier === this.touchId) this.update(t.clientX, t.clientY);
  };

  private end = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.touchId) continue;
      this.touchId = null;
      this.x = this.y = 0;
      this.onChange(0, 0);
      this.placeDefault();
    }
  };

  private update(cx: number, cy: number): void {
    let dx = cx - this.ox;
    let dy = cy - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const k = Math.min(1, d / this.radius);
    const dead = 0.12;
    const m = k < dead ? 0 : (k - dead) / (1 - dead);
    this.x = d > 0 ? (dx / Math.max(d, 1)) * m : 0;
    this.y = d > 0 ? (-dy / Math.max(d, 1)) * m : 0;
    this.onChange(this.x, this.y);
  }

  reset(): void {
    this.touchId = null;
    this.x = this.y = 0;
    this.placeDefault();
  }
}
