// 连击系统：命中计数、连击评级、里程碑提示、无双能量获取加成

const RATINGS: Array<[number, string]> = [
  [500, '神'],
  [300, '无双'],
  [200, '一骑当千'],
  [100, '万夫莫敌'],
  [50, '精彩'],
  [30, '很好'],
  [10, '好'],
];
const MILESTONES = [50, 100, 200, 300, 500, 1000];

export class ComboSystem {
  count = 0;
  best = 0;
  timer = 0;
  window = 3.0;
  onMilestone: ((n: number, label: string) => void) | null = null;

  hit(n = 1): void {
    const before = this.count;
    this.count += n;
    this.timer = this.window;
    if (this.count > this.best) this.best = this.count;
    for (const m of MILESTONES) if (before < m && this.count >= m) this.onMilestone?.(m, this.rating());
  }

  update(dt: number): void {
    if (this.count <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.count = 0;
      this.timer = 0;
    }
  }

  break(): void {
    this.count = 0;
    this.timer = 0;
  }

  rating(): string {
    for (const [n, r] of RATINGS) if (this.count >= n) return r;
    return '';
  }

  // 高连击提高无双能量获取效率
  musouMul(): number {
    return 1 + Math.min(this.count, 200) / 100;
  }
}
