import './ui/styles.css';
import { Game } from './game/Game';

// 入口：检测 WebGL 支持后启动游戏

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    // Three.js 新版本需要 WebGL 2.0
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;
if (!webglAvailable()) {
  app.innerHTML = '<div class="fatal">您的浏览器不支持 WebGL 2.0，无法运行本游戏。<br>请使用最新版 Chrome / Safari / Edge / Firefox。</div>';
} else {
  try {
    (window as any).game = new Game(app);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="fatal">游戏启动失败：${(e as Error).message}</div>`;
  }
}
document.getElementById('boot')?.remove();
