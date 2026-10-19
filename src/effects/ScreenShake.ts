import * as THREE from 'three';

// 镜头震动：基于创伤值（trauma）的平滑噪声偏移，可在设置中关闭

export class ScreenShake {
  trauma = 0;
  enabled = true;
  offset = new THREE.Vector3();
  roll = 0;
  private t = 0;

  add(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    this.offset.set(n(37, 0) * s * 0.45, n(41, 3) * s * 0.35, n(29, 7) * s * 0.3);
    this.roll = n(23, 11) * s * 0.03;
  }

  reset(): void {
    this.trauma = 0;
    this.offset.set(0, 0, 0);
    this.roll = 0;
  }
}
