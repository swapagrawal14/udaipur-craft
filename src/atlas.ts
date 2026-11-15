// Procedural 16px pixel-art texture atlas, painted at runtime on a canvas.
import * as THREE from 'three';
import { T, ATLAS_COLS, ATLAS_ROWS } from './blocks';
import { mulberry32 } from './noise';

const S = 16;
type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Painter {
  img: ImageData;
  constructor(public w: number, public h: number) {
    this.img = new ImageData(w, h);
  }
  set(tile: number, x: number, y: number, c: RGB, a = 255) {
    const tx = (tile % ATLAS_COLS) * S + x;
    const ty = Math.floor(tile / ATLAS_COLS) * S + y;
    const i = (ty * this.w + tx) * 4;
    this.img.data[i] = Math.max(0, Math.min(255, c[0]));
    this.img.data[i + 1] = Math.max(0, Math.min(255, c[1]));
    this.img.data[i + 2] = Math.max(0, Math.min(255, c[2]));
    this.img.data[i + 3] = a;
  }
}

const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function noisy(p: Painter, tile: number, base: RGB, v: number, seed: number) {
  const r = mulberry32(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(tile, x, y, shade(base, 1 + (r() - 0.5) * v));
}

/** Soft blotchy wash (lime-wash walls). */
function wash(p: Painter, tile: number, base: RGB, v: number, seed: number, chips?: RGB) {
  const r = mulberry32(seed);
  const blot: number[] = [];
  for (let i = 0; i < 6; i++) blot.push(r() * 16, r() * 16, 2 + r() * 4, (r() - 0.5) * v * 1.6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let f = 1 + (r() - 0.5) * v * 0.5;
    for (let i = 0; i < blot.length; i += 4) {
      const d = Math.hypot(x - blot[i], y - blot[i + 1]);
      if (d < blot[i + 2]) f += blot[i + 3] * (1 - d / blot[i + 2]);
    }
    let c = shade(base, f);
    if (chips && r() < 0.035) c = chips;
    p.set(tile, x, y, c);
  }
}

export function buildAtlasCanvas(): HTMLCanvasElement {
  const W = ATLAS_COLS * S, H = ATLAS_ROWS * S;
  const p = new Painter(W, H);

  // --- Grass (olive, semi-arid Mewar)
  const grass = hex('#7d9a3c');
  {
    const r = mulberry32(11);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(grass, 0.85 + r() * 0.3);
      if (r() < 0.06) c = hex('#a3b04a');
      if (r() < 0.04) c = hex('#5f7a2c');
      p.set(T.GRASS_TOP, x, y, c);
    }
  }
  // --- Dirt
  const dirt = hex('#8a6242');
  {
    const r = mulberry32(12);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(dirt, 0.82 + r() * 0.3);
      if (r() < 0.07) c = hex('#6e4c33');
      if (r() < 0.04) c = hex('#a07a55');
      p.set(T.DIRT, x, y, c);
    }
  }
  // --- Grass side
  {
    const r = mulberry32(13);
    const drip: number[] = [];
    for (let x = 0; x < S; x++) drip.push(2 + Math.floor(r() * 3));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c: RGB;
      if (y < drip[x]) c = shade(grass, 0.82 + r() * 0.28);
      else {
        c = shade(dirt, 0.82 + r() * 0.3);
        if (r() < 0.06) c = hex('#6e4c33');
      }
      p.set(T.GRASS_SIDE, x, y, c);
    }
  }
  // --- Stone (Aravalli grey-brown)
  {
    const r = mulberry32(14);
    const base = hex('#8c8680');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, 0.85 + r() * 0.22);
      const crack = ((x * 7 + y * 3) % 11 === 0) || ((x + y * 5) % 13 === 0);
      if (crack && r() < 0.6) c = shade(base, 0.68);
      if (r() < 0.04) c = hex('#a59c90');
      p.set(T.STONE, x, y, c);
    }
  }
  // --- Sand
  {
    const r = mulberry32(15);
    const base = hex('#dcc596');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, 0.92 + r() * 0.14);
      if (r() < 0.05) c = hex('#c4a874');
      p.set(T.SAND, x, y, c);
    }
  }
  // --- Water (icon only; the lake uses its own animated shader)
  {
    const r = mulberry32(16);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const w = Math.sin((x + y * 0.5) * 0.9) * 0.08;
      p.set(T.WATER, x, y, shade(hex('#2f7f9a'), 0.9 + w + r() * 0.1), 255);
    }
  }
  // --- Sandstone side (layered) and top
  {
    const r = mulberry32(17);
    const base = hex('#d8b878');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const band = Math.floor(y / 4);
      let c = shade(base, 0.92 + (band % 2) * 0.06 + r() * 0.08);
      if (y % 4 === 3) c = shade(base, 0.8);
      if (r() < 0.03) c = hex('#c29a5c');
      p.set(T.SANDSTONE_SIDE, x, y, c);
      let t = shade(base, 0.95 + r() * 0.08);
      if (x === 0 || y === 0 || x === 15 || y === 15) t = shade(base, 0.82);
      p.set(T.SANDSTONE_TOP, x, y, t);
    }
  }
  // --- White marble with faint veins
  {
    const r = mulberry32(18);
    const base = hex('#f2efe8');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, 0.97 + r() * 0.05);
      const v = Math.sin((x * 0.7 + y * 0.35) + Math.sin(y * 0.8) * 1.6);
      if (v > 0.93) c = hex('#d8d6d2');
      if (x === 0 || y === 0) c = shade(c, 0.95);
      p.set(T.MARBLE, x, y, c);
    }
  }
  // --- Lime plaster (warm white / cream)
  wash(p, T.PLASTER, hex('#efe6d2'), 0.1, 19);
  // --- Rajasthani indigo blue lime-wash
  wash(p, T.BLUE, hex('#4f86c6'), 0.18, 20, hex('#d9e4ee'));
  // --- Ochre / haveli yellow
  wash(p, T.OCHRE, hex('#dca546'), 0.16, 21, hex('#f1d79c'));
  // --- Terracotta brick/tile
  {
    const r = mulberry32(22);
    const base = hex('#b85a33');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = Math.floor(y / 4);
      const off = row % 2 ? 4 : 0;
      let c = shade(base, 0.88 + r() * 0.2);
      if (y % 4 === 3 || (x + off) % 8 === 7) c = hex('#8a4224');
      p.set(T.TERRACOTTA, x, y, c);
    }
  }
  // --- Sheesham wood planks
  {
    const r = mulberry32(23);
    const base = hex('#8b5a32');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const plank = Math.floor(y / 4);
      let c = shade(base, 0.9 + (plank % 2) * 0.08 + r() * 0.08);
      if (y % 4 === 3) c = hex('#5d3a1e');
      if ((x + plank * 5) % 16 === 0) c = hex('#5d3a1e');
      p.set(T.PLANKS, x, y, c);
    }
  }
  // --- Log side / top
  {
    const r = mulberry32(24);
    const bark = hex('#5e4632');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(bark, 0.85 + r() * 0.25);
      if ((x + Math.floor(r() * 2)) % 4 === 0) c = shade(bark, 0.7);
      p.set(T.LOG_SIDE, x, y, c);
      const d = Math.hypot(x - 7.5, y - 7.5);
      let t = shade(hex('#b08a5a'), 0.9 + r() * 0.1);
      if (Math.floor(d) % 3 === 0) t = hex('#8d6a42');
      if (d > 7) t = shade(bark, 0.9);
      p.set(T.LOG_TOP, x, y, t);
    }
  }
  // --- Neem leaves (with holes)
  {
    const r = mulberry32(25);
    const base = hex('#4e7a2e');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hole = r() < 0.16;
      let c = shade(base, 0.75 + r() * 0.4);
      if (r() < 0.08) c = hex('#6f9a3a');
      p.set(T.LEAVES, x, y, c, hole ? 0 : 255);
    }
  }
  // --- Jharokha jaali lattice (sandstone frame, pierced star pattern)
  {
    const r = mulberry32(26);
    const base = hex('#e9dcc0');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const frame = x === 0 || y === 0 || x === 15 || y === 15;
      const lx = (x - 1) % 7, ly = (y - 1) % 7;
      // diamond holes in a 7px repeat
      const d = Math.abs(lx - 3) + Math.abs(ly - 3);
      const hole = !frame && x > 0 && y > 0 && x < 15 && y < 15 && (d === 1 || d === 2) ;
      const c = frame ? shade(base, 0.82) : shade(base, 0.93 + r() * 0.08);
      p.set(T.LATTICE, x, y, c, hole ? 0 : 255);
    }
  }
  // --- Brass / gold dome
  {
    const r = mulberry32(27);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const g = 0.5 + 0.5 * Math.sin((x * 0.5 - y * 0.3));
      let c = mix(hex('#b9862a'), hex('#f3d27a'), g * 0.8 + r() * 0.2);
      if ((x + y) % 9 === 0 && r() < 0.7) c = hex('#fff1bf');
      p.set(T.GOLD, x, y, c);
    }
  }
  // --- Diya lantern: brass cage, warm flame panes
  {
    const r = mulberry32(28);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const frame = x <= 1 || x >= 14 || y <= 1 || y >= 14 || x === 7 || x === 8;
      const d = Math.hypot((x < 8 ? x - 4 : x - 11), y - 8.5);
      let c: RGB = frame ? shade(hex('#7a5520'), 0.9 + r() * 0.2) : mix(hex('#fff6c8'), hex('#ff9a2a'), Math.min(1, d / 6));
      if (!frame && r() < 0.05) c = hex('#ffe08a');
      p.set(T.LAMP, x, y, c);
      let t: RGB = (x <= 1 || x >= 14 || y <= 1 || y >= 14) ? hex('#7a5520') : mix(hex('#ffe9a8'), hex('#ff8f2a'), Math.hypot(x - 7.5, y - 7.5) / 8);
      p.set(T.LAMP_TOP, x, y, t);
    }
  }
  // --- Old city paving (cobbles)
  {
    const r = mulberry32(29);
    const base = hex('#a99a86');
    const seeds: number[] = [];
    for (let i = 0; i < 9; i++) seeds.push(r() * 16, r() * 16, 0.85 + r() * 0.2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let best = 1e9, second = 1e9, f = 1;
      for (let i = 0; i < seeds.length; i += 3) {
        for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
          const d = Math.hypot(x - seeds[i] - ox, y - seeds[i + 1] - oy);
          if (d < best) { second = best; best = d; f = seeds[i + 2]; } else if (d < second) second = d;
        }
      }
      let c = shade(base, f + (r() - 0.5) * 0.08);
      if (second - best < 1.1) c = hex('#6f6456');
      p.set(T.COBBLE, x, y, c);
    }
  }
  // --- Pietra dura inlay: marble with a floral lozenge
  {
    const r = mulberry32(30);
    const base = hex('#f2efe8');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, 0.97 + r() * 0.04);
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (x === 1 || y === 1 || x === 14 || y === 14) c = hex('#2f5d8a');
      if (d < 2) c = hex('#b8323a');
      else if (d < 3.5) c = hex('#2f7a4a');
      else if (d < 4.5 && (x + y) % 2 === 0) c = hex('#c9a227');
      p.set(T.INLAY, x, y, c);
    }
  }
  noisy(p, T.BEDROCK, hex('#3b3836'), 0.5, 31);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.getContext('2d')!.putImageData(p.img, 0, 0);
  return canvas;
}

export function makeAtlasTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Tileable 16px ripple texture for the lake surface. */
export function makeWaterTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(32, 32);
  const r = mulberry32(99);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = Math.sin((x / 32) * Math.PI * 4 + Math.sin((y / 32) * Math.PI * 2) * 1.5);
    const b = Math.sin((y / 32) * Math.PI * 6 + Math.cos((x / 32) * Math.PI * 2) * 2.0);
    let v = 0.5 + 0.25 * a + 0.2 * b + (r() - 0.5) * 0.1;
    v = Math.round(v * 5) / 5; // posterize -> pixel-art ripples
    const i = (y * 32 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v * 255));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Draw an isometric block icon (for the hotbar) from atlas tiles. */
export function drawBlockIcon(atlas: HTMLCanvasElement, top: number, side: number, size = 44): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const s = size / 32;
  const cx = size / 2;
  const ax = s * 0.866 * 16 / 16, ay = s * 0.5;
  const face = (tile: number, a: number, b: number, cc: number, d: number, e: number, f: number, dark: number) => {
    ctx.setTransform(a, b, cc, d, e, f);
    const sx = (tile % ATLAS_COLS) * 16, sy = Math.floor(tile / ATLAS_COLS) * 16;
    ctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
    if (dark > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, 16, 16);
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  // top rhombus
  face(top, ax, ay, -ax, ay, cx, 0, 0);
  // left
  face(side, ax, ay, 0, s, cx - 16 * ax, 16 * ay, 0.22);
  // right
  face(side, ax, -ay, 0, s, cx, 32 * ay, 0.38);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
