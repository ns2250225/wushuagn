import * as THREE from 'three';
import type { Environment } from './Environment';
import type { ScreenShake } from '../effects/ScreenShake';

// 第三人称跟随摄像机：后上方视角、敌军密集时拉远、锁定目标、技能短暂特写、墙体遮挡处理

export class CameraController {
  yaw = 0;
  pitch = 0.42;
  distance = 9;
  sensitivity = 1;
  invertY = false;
  private curDist = 9;
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private focusT = 0;
  private focusDist = 6;
  private focusYaw = 0;
  private extraDist = 0;
  lockTarget: THREE.Vector3 | null = null;

  constructor(public camera: THREE.PerspectiveCamera) {}

  snap(p: THREE.Vector3, yaw: number): void {
    this.yaw = yaw;
    this.target.copy(p);
    this.curDist = this.distance;
    this.apply(null, null, 0);
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * 0.004 * this.sensitivity;
    this.pitch += dy * 0.003 * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = Math.max(0.12, Math.min(1.1, this.pitch));
  }

  // 技能镜头：短暂聚焦（不长时间锁定）
  focus(dur: number, dist: number, yawOff: number): void {
    this.focusT = dur;
    this.focusDist = dist;
    this.focusYaw = yawOff;
  }

  setCrowd(n: number): void {
    this.extraDist = Math.min(4, n * 0.12);
  }

  update(dt: number, follow: THREE.Vector3, env: Environment | null, shake: ScreenShake | null): void {
    this.target.lerp(follow, Math.min(1, dt * 10));
    // 锁定：缓慢转向使目标处于画面前方
    if (this.lockTarget) {
      const want = Math.atan2(this.lockTarget.x - follow.x, this.lockTarget.z - follow.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 3);
    }
    let dist = this.distance + this.extraDist;
    let yawOff = 0;
    if (this.focusT > 0) {
      this.focusT -= dt;
      const k = Math.min(1, this.focusT * 3);
      dist = dist + (this.focusDist - dist) * k;
      yawOff = this.focusYaw * k;
    }
    this.curDist += (dist - this.curDist) * Math.min(1, dt * 4);
    this.apply(env, shake, yawOff);
  }

  private apply(env: Environment | null, shake: ScreenShake | null, yawOff: number): void {
    const yaw = this.yaw + yawOff;
    const cp = Math.cos(this.pitch);
    this.look.set(this.target.x, this.target.y + 1.6, this.target.z);
    this.desired.set(
      this.look.x - Math.sin(yaw) * cp * this.curDist,
      this.look.y + Math.sin(this.pitch) * this.curDist,
      this.look.z - Math.cos(yaw) * cp * this.curDist,
    );
    // 墙体遮挡：将摄像机拉近到遮挡物之前
    if (env) {
      const t = env.rayHit(this.look, this.desired);
      if (t < 1) this.desired.lerpVectors(this.look, this.desired, Math.max(0.15, t - 0.05));
    }
    if (this.desired.y < 0.6) this.desired.y = 0.6;
    this.camera.position.copy(this.desired);
    if (shake) this.camera.position.add(shake.offset);
    this.camera.lookAt(this.look);
    if (shake) this.camera.rotateZ(shake.roll);
  }
}
