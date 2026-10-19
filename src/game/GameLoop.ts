// 单一主循环：逻辑使用固定时间步长，渲染与逻辑频率分离

export const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.1; // 防止切后台恢复时时间步长过大导致角色瞬移

export class GameLoop {
  private last = 0;
  private acc = 0;
  private running = false;
  private raf = 0;
  timeScale = 1;

  constructor(
    private update: (dt: number) => void,
    private render: (frameDt: number, alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frame = (now - this.last) / 1000;
      this.last = now;
      if (frame > MAX_FRAME) frame = MAX_FRAME;
      if (frame < 0) frame = 0;
      this.acc += frame * this.timeScale;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.update(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= 5) this.acc = 0;
      this.render(frame, this.acc / FIXED_DT);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // 恢复前台时重置时间基准
  resetClock(): void {
    this.last = performance.now();
    this.acc = 0;
  }
}
