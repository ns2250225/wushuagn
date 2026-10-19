import { isTouchDevice } from '../game/PerformanceManager';

// 竖屏提示遮罩：竖屏时阻止进入正常战斗界面，横屏后自动隐藏

export class RotateOverlay {
  el: HTMLDivElement;
  portrait = false;
  onChange: ((portrait: boolean) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'rotate-overlay';
    this.el.innerHTML = `
      <div class="phone"><div class="screen"></div></div>
      <h2>请将设备旋转至横屏</h2>
      <p>为获得最佳战斗体验，请将手机旋转至横屏。</p>`;
    root.appendChild(this.el);
    const upd = () => this.update();
    window.addEventListener('resize', upd);
    window.addEventListener('orientationchange', () => setTimeout(upd, 120));
    (screen.orientation as ScreenOrientation | undefined)?.addEventListener?.('change', upd);
    document.addEventListener('fullscreenchange', () => setTimeout(upd, 120));
    this.update();
  }

  static isPortrait(): boolean {
    return window.innerHeight > window.innerWidth;
  }

  update(): void {
    // 仅对触屏设备强制横屏；桌面浏览器窗口变窄时不阻挡
    const p = isTouchDevice() && RotateOverlay.isPortrait();
    document.body.classList.toggle('portrait-mode', p);
    this.el.classList.toggle('show', p);
    if (p !== this.portrait) {
      this.portrait = p;
      this.onChange?.(p);
    }
  }
}

// 在用户交互后尝试全屏与锁定横屏；不支持时静默降级
export async function requestLandscape(fullscreen: boolean): Promise<void> {
  try {
    if (fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
    }
  } catch {
    /* 浏览器不支持全屏 */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (o && o.lock) await o.lock('landscape');
  } catch {
    /* 方向锁定不可用，依赖旋转提示 */
  }
}

export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function fullscreenSupported(): boolean {
  return !!document.documentElement.requestFullscreen;
}
