import * as THREE from 'three';

// 程序生成的 16x16 像素贴图（我的世界风格），运行时生成，无外部依赖

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number) => void;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hex(c: number, k = 1): string {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * k));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * k));
  const b = Math.min(255, Math.max(0, (c & 255) * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function noiseFill(ctx: CanvasRenderingContext2D, rnd: () => number, base: number, spread: number, size = 16): void {
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = hex(base, 1 - spread / 2 + rnd() * spread);
      ctx.fillRect(x, y, 1, 1);
    }
}

const PAINTERS: Record<string, Painter> = {
  grassTop: (c, r) => noiseFill(c, r, 0x5fa83a, 0.35),
  grassSide: (c, r) => {
    noiseFill(c, r, 0x8a6040, 0.3);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(r() * 3);
      for (let y = 0; y < h; y++) {
        c.fillStyle = hex(0x5fa83a, 0.8 + r() * 0.35);
        c.fillRect(x, y, 1, 1);
      }
    }
  },
  dirt: (c, r) => noiseFill(c, r, 0x8a6040, 0.35),
  path: (c, r) => {
    noiseFill(c, r, 0xa89878, 0.3);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = hex(0x807060, 0.8 + r() * 0.3);
      c.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 2, 1);
    }
  },
  stone: (c, r) => {
    noiseFill(c, r, 0x8a8a8e, 0.25);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = hex(0x6a6a70, 1);
      c.fillRect(Math.floor(r() * 14), Math.floor(r() * 16), 3, 1);
    }
  },
  cobble: (c, r) => {
    noiseFill(c, r, 0x7a7a80, 0.2);
    c.fillStyle = hex(0x4a4a50);
    for (let i = 0; i < 16; i += 4) {
      c.fillRect(0, i, 16, 1);
      const o = (i / 4) % 2 ? 2 : 6;
      c.fillRect(o, i, 1, 4);
      c.fillRect(o + 8, i, 1, 4);
    }
  },
  brick: (c, r) => {
    noiseFill(c, r, 0x9a9a98, 0.18);
    c.fillStyle = hex(0x5a5a5c);
    for (let y = 0; y < 16; y += 4) {
      c.fillRect(0, y + 3, 16, 1);
      const o = (y / 4) % 2 ? 0 : 4;
      c.fillRect(o, y, 1, 3);
      c.fillRect(o + 8, y, 1, 3);
    }
  },
  wallDark: (c, r) => {
    noiseFill(c, r, 0x5a5250, 0.2);
    c.fillStyle = hex(0x3a3432);
    for (let y = 0; y < 16; y += 4) {
      c.fillRect(0, y + 3, 16, 1);
      const o = (y / 4) % 2 ? 0 : 4;
      c.fillRect(o, y, 1, 3);
      c.fillRect(o + 8, y, 1, 3);
    }
  },
  planks: (c, r) => {
    noiseFill(c, r, 0xa07840, 0.2);
    c.fillStyle = hex(0x6a4a24);
    for (let y = 0; y < 16; y += 4) {
      c.fillRect(0, y + 3, 16, 1);
      c.fillRect(Math.floor(r() * 16), y, 1, 3);
    }
  },
  darkPlanks: (c, r) => {
    noiseFill(c, r, 0x5a3a20, 0.2);
    c.fillStyle = hex(0x3a2410);
    for (let y = 0; y < 16; y += 4) c.fillRect(0, y + 3, 16, 1);
  },
  log: (c, r) => {
    noiseFill(c, r, 0x6a4a2a, 0.25);
    c.fillStyle = hex(0x4a3018);
    for (let x = 1; x < 16; x += 3) c.fillRect(x, 0, 1, 16);
  },
  leaves: (c, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = r();
        c.fillStyle = v < 0.12 ? hex(0x1f4a18) : hex(0x3a8a2a, 0.7 + r() * 0.5);
        c.fillRect(x, y, 1, 1);
      }
  },
  sand: (c, r) => noiseFill(c, r, 0xd8c88a, 0.2),
  water: (c, r) => {
    noiseFill(c, r, 0x2a5a9a, 0.25);
    c.fillStyle = 'rgba(160,200,255,0.5)';
    for (let i = 0; i < 6; i++) c.fillRect(Math.floor(r() * 12), Math.floor(r() * 16), 4, 1);
  },
  roof: (c, r) => {
    noiseFill(c, r, 0x3a3a48, 0.2);
    c.fillStyle = hex(0x22222c);
    for (let y = 0; y < 16; y += 3) c.fillRect(0, y, 16, 1);
    for (let x = 0; x < 16; x += 4) c.fillRect(x, 0, 1, 16);
  },
  roofGold: (c, r) => {
    noiseFill(c, r, 0xc8a040, 0.2);
    c.fillStyle = hex(0x8a6a20);
    for (let y = 0; y < 16; y += 3) c.fillRect(0, y, 16, 1);
  },
  red: (c, r) => {
    noiseFill(c, r, 0xa8282a, 0.18);
    c.fillStyle = hex(0x7a1a1a);
    c.fillRect(0, 0, 16, 1);
    c.fillRect(0, 15, 16, 1);
  },
  gold: (c, r) => noiseFill(c, r, 0xe0b840, 0.25),
  hay: (c, r) => {
    noiseFill(c, r, 0xd0b050, 0.25);
    c.fillStyle = hex(0x9a7a20);
    for (let y = 2; y < 16; y += 5) c.fillRect(0, y, 16, 1);
  },
  cloth: (c, r) => noiseFill(c, r, 0xe8e0d0, 0.12),
  marble: (c, r) => {
    noiseFill(c, r, 0xd8d4cc, 0.12);
    c.fillStyle = hex(0xb0aca4);
    c.fillRect(0, 0, 16, 1);
    c.fillRect(0, 0, 1, 16);
  },
  mud: (c, r) => noiseFill(c, r, 0x5a4430, 0.3),
  snowStone: (c, r) => noiseFill(c, r, 0xb8b8b0, 0.2),
};

const texCache = new Map<string, THREE.Texture>();

export function blockTexture(name: string): THREE.Texture {
  let t = texCache.get(name);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const ctx = cv.getContext('2d')!;
  const p = PAINTERS[name] ?? PAINTERS.stone;
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = seed * 31 + name.charCodeAt(i);
  p(ctx, rng(seed));
  t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(name, t);
  return t;
}

// 角色用的灰度像素噪声贴图，乘以颜色得到像素质感
let pixelNoise: THREE.Texture | null = null;
export function pixelNoiseTexture(): THREE.Texture {
  if (pixelNoise) return pixelNoise;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const ctx = cv.getContext('2d')!;
  const r = rng(1234);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const v = 205 + Math.floor(r() * 50);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.fillStyle = 'rgb(175,175,175)';
  ctx.fillRect(0, 7, 8, 1);
  ctx.fillRect(7, 0, 1, 8);
  pixelNoise = new THREE.CanvasTexture(cv);
  pixelNoise.magFilter = THREE.NearestFilter;
  pixelNoise.minFilter = THREE.NearestFilter;
  pixelNoise.colorSpace = THREE.SRGBColorSpace;
  return pixelNoise;
}

const matCache = new Map<string, THREE.Material>();

export function colorMat(color: number): THREE.MeshLambertMaterial {
  const key = 'c' + color;
  let m = matCache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, map: pixelNoiseTexture() });
    m.userData.cached = true;
    matCache.set(key, m);
  }
  return m;
}

export function glowMat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  const key = 'g' + color + '_' + opacity;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    m.userData.cached = true;
    matCache.set(key, m);
  }
  return m;
}

export function blockMat(name: string, tint = 0xffffff): THREE.MeshLambertMaterial {
  const key = 'b' + name + tint;
  let m = matCache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: blockTexture(name), color: tint });
    m.userData.cached = true;
    matCache.set(key, m);
  }
  return m;
}

// 天空渐变背景
export function skyTexture(top: number, bottom: number): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex(top));
  g.addColorStop(0.65, hex(bottom));
  g.addColorStop(1, hex(bottom, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 法阵 / 符文贴图
let circleTex: THREE.Texture | null = null;
export function magicCircleTexture(): THREE.Texture {
  if (circleTex) return circleTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const put = (x: number, y: number) => ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  ctx.fillStyle = '#fff';
  for (const rad of [30, 26, 14]) {
    for (let a = 0; a < Math.PI * 2; a += 0.02) put(32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad);
  }
  // 六芒星
  for (let k = 0; k < 2; k++) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2;
      pts.push([32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26]);
    }
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % 3];
      for (let t = 0; t <= 1; t += 0.01) put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }
  // 符文方块
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(Math.round(32 + Math.cos(a) * 28) - 1, Math.round(32 + Math.sin(a) * 28) - 1, 3, 3);
  }
  circleTex = new THREE.CanvasTexture(cv);
  circleTex.magFilter = THREE.NearestFilter;
  circleTex.minFilter = THREE.NearestFilter;
  return circleTex;
}

// 旗帜贴图：带文字
export function flagTexture(color: number, text: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, 32, 48);
  ctx.fillStyle = hex(color, 0.7);
  ctx.fillRect(0, 0, 32, 3);
  ctx.fillRect(0, 45, 32, 3);
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(6, 12, 20, 22);
  ctx.fillStyle = hex(color, 0.5);
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, 24);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
