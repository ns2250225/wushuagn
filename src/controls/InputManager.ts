// 统一输入层：键鼠与触摸输入合并为同一套动作状态

export type Action = 'attack' | 'heavy' | 'skill1' | 'skill2' | 'musou' | 'dodge' | 'lock' | 'pause';
export const ACTIONS: Action[] = ['attack', 'heavy', 'skill1', 'skill2', 'musou', 'dodge', 'lock', 'pause'];

export interface InputState {
  moveX: number; // 右为正
  moveY: number; // 前为正
  held: Record<Action, boolean>;
  pressed: Set<Action>;
  released: Set<Action>;
}

export class InputManager {
  state: InputState = {
    moveX: 0,
    moveY: 0,
    held: { attack: false, heavy: false, skill1: false, skill2: false, musou: false, dodge: false, lock: false, pause: false },
    pressed: new Set(),
    released: new Set(),
  };
  // 来源
  keyMove = { x: 0, y: 0 };
  stickMove = { x: 0, y: 0 };
  private sources = new Map<Action, Set<string>>();
  camDX = 0;
  camDY = 0;
  enabled = true;

  press(a: Action, src: string): void {
    if (!this.enabled) return;
    let s = this.sources.get(a);
    if (!s) this.sources.set(a, (s = new Set()));
    if (s.size === 0) {
      this.state.pressed.add(a);
      this.state.held[a] = true;
    }
    s.add(src);
  }

  release(a: Action, src: string): void {
    const s = this.sources.get(a);
    if (!s || !s.has(src)) return;
    s.delete(src);
    if (s.size === 0) {
      this.state.held[a] = false;
      this.state.released.add(a);
    }
  }

  releaseAll(): void {
    for (const [a, s] of this.sources) {
      if (s.size) this.state.released.add(a);
      s.clear();
      this.state.held[a] = false;
    }
    this.keyMove.x = this.keyMove.y = 0;
    this.stickMove.x = this.stickMove.y = 0;
  }

  addCamera(dx: number, dy: number): void {
    this.camDX += dx;
    this.camDY += dy;
  }

  takeCamera(): [number, number] {
    const r: [number, number] = [this.camDX, this.camDY];
    this.camDX = this.camDY = 0;
    return r;
  }

  // 每个逻辑步开始前合成移动向量
  sample(): InputState {
    let x = this.keyMove.x + this.stickMove.x;
    let y = this.keyMove.y + this.stickMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.state.moveX = x;
    this.state.moveY = y;
    return this.state;
  }

  // 每个逻辑步结束后清除边沿事件
  clearEdges(): void {
    this.state.pressed.clear();
    this.state.released.clear();
  }
}
