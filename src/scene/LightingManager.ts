import * as THREE from 'three';
import { Perf } from '../game/PerformanceManager';

export interface LightingPreset {
  sky: number;
  ground: number;
  sun: number;
  sunIntensity: number;
  ambient: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunDir: [number, number, number];
}

// 实时方向光 + 半球环境光 + 雾效，阴影只跟随玩家附近区域

export class LightingManager {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private dir = new THREE.Vector3();

  constructor(private scene: THREE.Scene, preset: LightingPreset) {
    this.hemi = new THREE.HemisphereLight(preset.sky, preset.ground, preset.ambient);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(preset.sun, preset.sunIntensity);
    this.dir.set(...preset.sunDir).normalize();
    this.sun.castShadow = Perf.profile.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(Perf.profile.shadowSize, Perf.profile.shadowSize);
    const r = 22;
    s.camera.left = -r;
    s.camera.right = r;
    s.camera.top = r;
    s.camera.bottom = -r;
    s.camera.near = 1;
    s.camera.far = 90;
    s.bias = -0.0008;
    s.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(preset.fog, preset.fogNear, Math.min(preset.fogFar, Perf.profile.drawDistance));
  }

  follow(p: THREE.Vector3): void {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.dir, 45);
  }

  applyQuality(): void {
    this.sun.castShadow = Perf.profile.shadows;
    const sz = Perf.profile.shadowSize;
    if (this.sun.shadow.mapSize.x !== sz) {
      this.sun.shadow.mapSize.set(sz, sz);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as any;
    }
  }
}
