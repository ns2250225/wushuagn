import { GameState, type KeyBindings } from '../game/GameState';
import type { Action, InputManager } from './InputManager';

// PC 键鼠输入：WASD 移动、J/K/U/I/O/Space/Tab/Esc（可重新映射）、鼠标左右键、指针锁定视角

const MOVE_KEYS = ['up', 'down', 'left', 'right'] as const;

export class KeyboardController {
  private down = new Set<string>();
  private pointerLocked = false;
  active = false;
  onPause: (() => void) | null = null;
  onUnlock: (() => void) | null = null;
  rebinding: ((code: string) => void) | null = null;

  constructor(private input: InputManager, private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.reset());
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      // 按 Esc 退出指针锁定时浏览器可能不派发按键事件，此时视为暂停
      if (was && !this.pointerLocked) this.onUnlock?.();
    });
  }

  get keys(): KeyBindings {
    return GameState.settings.keys;
  }

  reset(): void {
    this.down.clear();
    this.input.releaseAll();
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  private actionFor(code: string): Action | null {
    const k = this.keys;
    for (const a of ['attack', 'heavy', 'skill1', 'skill2', 'musou', 'dodge', 'lock', 'pause'] as Action[]) if (k[a] === code) return a;
    return null;
  }

  private updateMove(): void {
    const k = this.keys;
    const has = (c: string) => this.down.has(c);
    const x = (has(k.right) || has('ArrowRight') ? 1 : 0) - (has(k.left) || has('ArrowLeft') ? 1 : 0);
    const y = (has(k.up) || has('ArrowUp') ? 1 : 0) - (has(k.down) || has('ArrowDown') ? 1 : 0);
    this.input.keyMove.x = x;
    this.input.keyMove.y = y;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.rebinding) {
      e.preventDefault();
      const cb = this.rebinding;
      this.rebinding = null;
      cb(e.code);
      return;
    }
    if (!this.active) return;
    const code = e.code;
    if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (this.down.has(code)) return;
    this.down.add(code);
    const a = this.actionFor(code);
    if (a === 'pause') {
      this.onPause?.();
      return;
    }
    if (a) this.input.press(a, 'k:' + code);
    if (MOVE_KEYS.some((m) => this.keys[m] === code) || code.startsWith('Arrow')) this.updateMove();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    this.down.delete(code);
    const a = this.actionFor(code);
    if (a) this.input.release(a, 'k:' + code);
    this.updateMove();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.active) return;
    if (!this.pointerLocked && e.button === 0 && this.canvas.requestPointerLock && !('ontouchstart' in window)) {
      try {
        const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        r?.catch?.(() => {});
      } catch {
        /* 某些浏览器不支持 */
      }
    }
    if (e.button === 0) this.input.press('attack', 'mouse0');
    if (e.button === 2) this.input.press('heavy', 'mouse2');
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.input.release('attack', 'mouse0');
    if (e.button === 2) this.input.release('heavy', 'mouse2');
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.active || !this.pointerLocked) return;
    this.input.addCamera(e.movementX, e.movementY);
  };

  // Q / E 键旋转镜头（无指针锁定时的备用方案）
  tick(dt: number): void {
    if (!this.active) return;
    const r = (this.down.has('KeyE') ? 1 : 0) - (this.down.has('KeyQ') ? 1 : 0);
    if (r) this.input.addCamera(r * 500 * dt, 0);
  }
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: '空格', Tab: 'Tab', Escape: 'Esc', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', Enter: '回车', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return map[code] ?? code;
}
