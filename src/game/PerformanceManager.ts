import type { QualityLevel } from './GameState';

export interface QualityProfile {
  name: 'low' | 'mid' | 'high';
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  maxParticles: number;
  particleMul: number;
  maxSoldiers: number;
  lodDistance: number;
  farUpdateInterval: number;
  drawDistance: number;
  trails: boolean;
  afterimages: boolean;
  backgroundArmy: number;
  antialias: boolean;
}

const PROFILES: Record<'low' | 'mid' | 'high', QualityProfile> = {
  low: { name: 'low', pixelRatio: 0.75, shadows: false, shadowSize: 512, maxParticles: 500, particleMul: 0.45, maxSoldiers: 45, lodDistance: 22, farUpdateInterval: 4, drawDistance: 90, trails: true, afterimages: false, backgroundArmy: 120, antialias: false },
  mid: { name: 'mid', pixelRatio: 1.25, shadows: true, shadowSize: 1024, maxParticles: 1200, particleMul: 0.75, maxSoldiers: 80, lodDistance: 32, farUpdateInterval: 3, drawDistance: 130, trails: true, afterimages: true, backgroundArmy: 300, antialias: false },
  high: { name: 'high', pixelRatio: 2, shadows: true, shadowSize: 2048, maxParticles: 2400, particleMul: 1, maxSoldiers: 120, lodDistance: 45, farUpdateInterval: 2, drawDistance: 170, trails: true, afterimages: true, backgroundArmy: 600, antialias: true },
};

export const isTouchDevice = (): boolean =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;

// 根据设备能力自动选择画质，并在运行时根据帧率动态降级 / 恢复
export class PerformanceManager {
  profile: QualityProfile = { ...PROFILES.mid };
  base: QualityProfile = { ...PROFILES.mid };
  dynamicScale = 1; // 渲染分辨率动态缩放
  densityScale = 1; // 特效 / 敌兵密度动态缩放
  autoAdjust = true;
  fps = 60;
  private acc = 0;
  private frames = 0;
  private lowStreak = 0;
  private highStreak = 0;
  private target = 55;
  onChange: (() => void) | null = null;

  detect(): 'low' | 'mid' | 'high' {
    const mobile = isTouchDevice();
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory || 4;
    let gpu = '';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (ext) gpu = String((gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
      }
    } catch {
      /* ignore */
    }
    if (mobile) {
      if (cores >= 8 && mem >= 6 && !/mali-[gt]5|adreno \(tm\) [3-5]/.test(gpu)) return 'mid';
      return 'low';
    }
    if (/intel.*(hd|uhd) graphics [2-6]/.test(gpu) || cores <= 2) return 'mid';
    return 'high';
  }

  apply(q: QualityLevel, autoAdjust: boolean): void {
    const name = q === 'auto' ? this.detect() : q;
    this.base = { ...PROFILES[name] };
    this.profile = { ...this.base };
    this.base.pixelRatio = Math.min(this.base.pixelRatio, window.devicePixelRatio || 1);
    this.target = isTouchDevice() ? (name === 'low' ? 30 : 45) : 55;
    this.autoAdjust = autoAdjust;
    this.dynamicScale = 1;
    this.densityScale = 1;
    this.recompute();
  }

  private recompute(): void {
    const b = this.base;
    this.profile.pixelRatio = Math.max(0.5, b.pixelRatio * this.dynamicScale);
    this.profile.particleMul = b.particleMul * this.densityScale;
    this.profile.maxSoldiers = Math.max(24, Math.round(b.maxSoldiers * (0.5 + 0.5 * this.densityScale)));
    this.profile.afterimages = b.afterimages && this.densityScale > 0.7;
    this.onChange?.();
  }

  // 每帧调用，dt 为真实帧间隔（秒）
  sample(dt: number): void {
    this.acc += dt;
    this.frames++;
    if (this.acc < 1.5) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (!this.autoAdjust) return;
    if (this.fps < this.target - 6) {
      this.lowStreak++;
      this.highStreak = 0;
      if (this.lowStreak >= 2) {
        this.lowStreak = 0;
        if (this.densityScale > 0.5) this.densityScale = Math.max(0.5, this.densityScale - 0.15);
        else if (this.dynamicScale > 0.6) this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
        this.recompute();
      }
    } else if (this.fps > this.target + 4) {
      this.highStreak++;
      this.lowStreak = 0;
      if (this.highStreak >= 6 && (this.dynamicScale < 1 || this.densityScale < 1)) {
        this.highStreak = 0;
        if (this.dynamicScale < 1) this.dynamicScale = Math.min(1, this.dynamicScale + 0.1);
        else this.densityScale = Math.min(1, this.densityScale + 0.1);
        this.recompute();
      }
    } else {
      this.lowStreak = 0;
      this.highStreak = 0;
    }
  }
}

export const Perf = new PerformanceManager();
