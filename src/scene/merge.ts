import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 将一个组内的直接子网格按材质合并为单个网格，大幅减少绘制调用
// 返回被合并前各立方体的局部矩阵（供残影等效果使用）

export interface MergedBox {
  parent: THREE.Object3D;
  local: THREE.Matrix4;
}

export function mergeChildren(group: THREE.Object3D, boxes?: MergedBox[], keep?: Set<THREE.Object3D>): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || (m as any).isInstancedMesh || keep?.has(m) || Array.isArray(m.material)) continue;
    let arr = byMat.get(m.material as THREE.Material);
    if (!arr) byMat.set(m.material as THREE.Material, (arr = []));
    arr.push(m);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2 && !boxes) continue;
    const geos: THREE.BufferGeometry[] = [];
    let cast = false;
    for (const m of list) {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      geos.push(g);
      if (boxes) boxes.push({ parent: group, local: m.matrix.clone() });
      cast = cast || m.castShadow;
      group.remove(m);
    }
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    for (const g of geos) if (g !== merged) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
}

// 递归合并整棵子树（每个子组单独合并，保持各组可独立变换）
export function mergeTree(root: THREE.Object3D, boxes?: MergedBox[], keep?: Set<THREE.Object3D>): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) groups.push(o);
  });
  for (const g of groups) mergeChildren(g, boxes, keep);
}
