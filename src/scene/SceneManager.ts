import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';

// 渲染器 / 场景 / 相机的统一管理，负责尺寸变化与画质切换

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  webgl2: boolean;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);
    const ctxAttr: WebGLContextAttributes = { antialias: Perf.base.antialias, powerPreference: 'high-performance', alpha: false, stencil: false };
    const gl2 = this.canvas.getContext('webgl2', ctxAttr);
    this.webgl2 = !!gl2;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: (gl2 ?? undefined) as WebGL2RenderingContext | undefined, antialias: Perf.base.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
    this.applyQuality();
    this.resize();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
  }

  applyQuality(): void {
    const p = Perf.profile;
    this.renderer.setPixelRatio(p.pixelRatio);
    this.renderer.shadowMap.enabled = p.shadows;
    this.camera.far = p.drawDistance + 60;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / Math.max(1, h);
    // 竖向较窄的屏幕使用更大的视角，保证战场可见范围
    this.camera.fov = this.camera.aspect < 1.4 ? 62 : 55;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // 清空场景对象（保留相机）
  clearScene(): void {
    const s = this.scene;
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (m as any).isInstancedMesh) {
        if (m.geometry && (m as any).userData?.disposable !== false) geos.add(m.geometry);
        const mm = m.material;
        if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
        else if (mm) mats.add(mm);
      }
    });
    while (s.children.length) s.remove(s.children[0]);
    // 只释放场景专属的实例化几何体，共享的单位立方体和缓存材质会被复用
    geos.forEach((g) => {
      if ((g as any).userData?.shared) return;
      g.dispose();
    });
    mats.forEach((m) => {
      if (!m.userData?.cached) m.dispose();
    });
    s.fog = null;
    s.background = null;
  }
}
