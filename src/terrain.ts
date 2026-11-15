// Stylised Udaipur geography. +x = east, -z = north. 1 block ≈ a few metres.
import { Simplex2, smoothstep, lerp } from './noise';

export const CHUNK = 16;
export const WORLD_H = 128;
export const SEA = 30; // water fills y < SEA; surface sits at ~29.9

const nBase = new Simplex2(1337);
const nShore = new Simplex2(4242);
const nHill = new Simplex2(99);
const nDetail = new Simplex2(7);

// Lake Pichola shoreline control points: [z, westShoreX, eastShoreX]
const PICHOLA: [number, number, number][] = [
  [-134, -6, -6],
  [-118, -26, 16],
  [-100, -36, 34],
  [-80, -40, 50],
  [-60, -42, 56],
  [-30, -42, 56],
  [0, -38, 56],
  [30, -36, 54],
  [60, -46, 50],
  [95, -55, 56],
  [125, -48, 50],
  [148, -22, 26],
  [162, 2, 4],
];

function shoreAt(z: number): [number, number] | null {
  if (z <= PICHOLA[0][0] || z >= PICHOLA[PICHOLA.length - 1][0]) return null;
  for (let i = 0; i < PICHOLA.length - 1; i++) {
    const a = PICHOLA[i], b = PICHOLA[i + 1];
    if (z >= a[0] && z <= b[0]) {
      let t = (z - a[0]) / (b[0] - a[0]);
      t = t * t * (3 - 2 * t) * 0.5 + t * 0.5; // soften corners
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
  }
  return null;
}

/** Signed distance-ish (in blocks) into Lake Pichola; > 0 inside the water. */
export function picholaField(x: number, z: number): number {
  const s = shoreAt(z);
  const wob = nShore.noise(x / 28, z / 28) * 2.5 + nShore.noise(x / 9, z / 9) * 0.8;
  let d: number;
  if (!s) {
    d = -Math.min(Math.abs(z - PICHOLA[0][0]), Math.abs(z - PICHOLA[PICHOLA.length - 1][0])) - 6;
  } else {
    let xe = s[1];
    // straight, palace-side bank so the City Palace rises from the water
    if (z > -76 && z < 40) xe = 56;
    d = Math.min(x - s[0], xe - x);
    // round off the north/south tips
    const zt = Math.min(z - PICHOLA[0][0], PICHOLA[PICHOLA.length - 1][0] - z);
    d = Math.min(d, zt * 1.2);
    if (!(z > -76 && z < 40 && x > 20)) d += wob;
  }
  return d;
}

export function lakeField(x: number, z: number): number {
  return picholaField(x, z);
}

const bump = (x: number, z: number, cx: number, cz: number, amp: number, r: number) => {
  const d2 = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
  return amp * Math.exp(-d2 * 1.6);
};

/** 0..1, where 1 = dense old-city fabric. */
export function townMask(x: number, z: number): number {
  const n = nDetail.noise(x / 40, z / 40) * 8;
  const box = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = Math.min(x - x0, x1 - x) + n;
    const dz = Math.min(z - z0, z1 - z) + n;
    return smoothstep(0, 12, Math.min(dx, dz));
  };
  return Math.max(
    box(96, -180, 260, 90),   // old city east of the palace
    box(36, -180, 100, -78),  // Lal Ghat / Jagdish Chowk quarter
    box(-118, -78, -52, 20),  // Hanuman Ghat, west bank behind Ambrai
  );
}

/** Column height h: blocks y < h are solid ground. */
function heightRaw(x: number, z: number): number {
  let h = 33 + nBase.fbm(x / 90, z / 90, 3) * 3;

  // Aravalli ridges framing the valley
  const dc = Math.hypot(x - 20, (z + 30) / 1.2);
  const hillMask = smoothstep(150, 280, dc);
  const r = nHill.ridged(x / 150, z / 150, 4);
  h += hillMask * (r * r * 58 + nDetail.fbm(x / 35, z / 35, 2) * 6);

  // Named hills
  h += bump(x, z, -210, -40, 50, 55);   // Sajjangarh / Bansdara hill
  h += bump(x, z, -150, 60, 16, 45);    // western foothills behind Ambrai
  h += bump(x, z, 118, 150, 26, 32);    // Machla Magra (Karni Mata)
  h += bump(x, z, 80, -20, 5, 50);      // palace ridge

  // flatten the old city into gentle lanes
  const town = townMask(x, z);
  if (town > 0) h = lerp(h, 34 + nDetail.noise(x / 60, z / 60) * 1.5, town * 0.85);

  const lake = lakeField(x, z);
  if (lake > 0) {
    return Math.floor(SEA - 1 - Math.min(9, lake * 0.45));
  }
  // banks ease down to the waterline
  const t = smoothstep(0, 10, -lake);
  h = lerp(SEA + 0.6, h, t);
  return Math.max(SEA, Math.floor(h));
}

const hCache = new Map<number, number>();
/** Column height h: blocks y < h are solid ground (memoised). */
export function heightAt(x: number, z: number): number {
  const k = (x + 32768) * 65536 + (z + 32768);
  let v = hCache.get(k);
  if (v === undefined) {
    if (hCache.size > 400000) hCache.clear();
    v = heightRaw(x, z);
    hCache.set(k, v);
  }
  return v;
}
