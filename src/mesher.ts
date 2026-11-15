// Face-culled chunk mesher with Minecraft-style vertex AO and baked lantern glow.
import { BLOCKS, KIND, OCCLUDES_AO, Kind, B, ATLAS_COLS, ATLAS_ROWS } from './blocks';
import { CHUNK, WORLD_H, SEA } from './terrain';

const P = CHUNK + 2; // padded width
const PL = P * P;
export const padded = new Uint8Array(PL * WORLD_H);

// face: normal, 4 corner offsets (CCW from outside), shade
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.86, dir: 'side' },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.86, dir: 'side' },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, dir: 'top' },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62, dir: 'bottom' },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.76, dir: 'side' },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.76, dir: 'side' },
] as const;
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

// Precompute AO neighbour offsets per face/vertex: side1, side2, corner (padded index deltas)
const AO_OFF: number[][][] = FACES.map((f) => {
  const n = f.n;
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const others = [0, 1, 2].filter((a) => a !== axis);
  const idx = (d: number[]) => d[0] + d[2] * P + d[1] * PL;
  return f.v.map((c) => {
    const s1 = [n[0], n[1], n[2]], s2 = [n[0], n[1], n[2]], co = [n[0], n[1], n[2]];
    const a = others[0], b = others[1];
    const sa = c[a] === 1 ? 1 : -1, sb = c[b] === 1 ? 1 : -1;
    s1[a] += sa; s2[b] += sb; co[a] += sa; co[b] += sb;
    return [idx(s1), idx(s2), idx(co)];
  });
});
const NOFF = FACES.map((f) => f.n[0] + f.n[2] * P + f.n[1] * PL);

class Buf {
  pos: Float32Array; nor: Int8Array; uv: Float32Array; light: Float32Array; idx: Uint32Array;
  nv = 0; ni = 0;
  constructor(cap: number) {
    this.pos = new Float32Array(cap * 3); this.nor = new Int8Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.light = new Float32Array(cap * 2);
    this.idx = new Uint32Array(cap * 1.5);
  }
  ensure(extra: number) {
    if (this.nv + extra <= this.pos.length / 3) return;
    const cap = Math.max(this.pos.length / 3 * 2, this.nv + extra);
    const grow = <T extends Float32Array | Int8Array | Uint32Array>(a: T, n: number): T => { const b = new (a.constructor as any)(n); b.set(a); return b; };
    this.pos = grow(this.pos, cap * 3); this.nor = grow(this.nor, cap * 3);
    this.uv = grow(this.uv, cap * 2); this.light = grow(this.light, cap * 2);
    this.idx = grow(this.idx, cap * 1.5);
  }
  reset() { this.nv = 0; this.ni = 0; }
}

const opaqueBuf = new Buf(65536);
const waterBuf = new Buf(16384);

export interface MeshData {
  pos: Float32Array; nor: Int8Array; uv: Float32Array; light: Float32Array; idx: Uint32Array;
}
export interface ChunkMeshes { opaque: MeshData | null; water: MeshData | null; minY: number; maxY: number }

function take(b: Buf): MeshData | null {
  if (b.nv === 0) return null;
  return {
    pos: b.pos.slice(0, b.nv * 3), nor: b.nor.slice(0, b.nv * 3), uv: b.uv.slice(0, b.nv * 2),
    light: b.light.slice(0, b.nv * 2), idx: b.idx.slice(0, b.ni),
  };
}

const TW = 1 / ATLAS_COLS, TH = 1 / ATLAS_ROWS, EPS = 0.0008;

/**
 * neighbours: 3x3 chunk datas, index (dx+1)+(dz+1)*3, centre is [4]. All must exist.
 * lamps: world-space lamp centres (x,y,z triples) near this chunk.
 */
export function meshChunk(cx: number, cz: number, neighbours: Uint8Array[], lamps: number[]): ChunkMeshes {
  // Build padded volume
  let minY = WORLD_H, maxY = 0;
  const L = CHUNK * CHUNK;
  for (let nz = -1; nz <= 1; nz++)
    for (let nx = -1; nx <= 1; nx++) {
      const src = neighbours[(nx + 1) + (nz + 1) * 3];
      const lx0 = nx === -1 ? CHUNK - 1 : 0, lx1 = nx === 1 ? 0 : CHUNK - 1;
      const lz0 = nz === -1 ? CHUNK - 1 : 0, lz1 = nz === 1 ? 0 : CHUNK - 1;
      const px0 = nx === -1 ? 0 : nx === 0 ? 1 : CHUNK + 1;
      const pz0 = nz === -1 ? 0 : nz === 0 ? 1 : CHUNK + 1;
      for (let y = 0; y < WORLD_H; y++) {
        const sy = y * L, py = y * PL;
        for (let lz = lz0, pz = pz0; lz <= lz1; lz++, pz++) {
          const srow = sy + lz * CHUNK, prow = py + pz * P;
          for (let lx = lx0, px = px0; lx <= lx1; lx++, px++) padded[prow + px] = src[srow + lx];
        }
      }
    }
  const centre = neighbours[4];
  for (let y = WORLD_H - 1; y >= 0 && maxY === 0; y--) {
    const sy = y * L;
    for (let i = 0; i < L; i++) if (centre[sy + i] !== 0) { maxY = y; break; }
  }
  minY = 0;

  opaqueBuf.reset(); waterBuf.reset();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const nl = lamps.length;

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const pi = (x + 1) + (z + 1) * P + y * PL;
        const id = padded[pi];
        if (id === 0) continue;
        const kind = KIND[id];
        const def = BLOCKS[id];
        if (kind === Kind.Water) {
          const above = y + 1 < WORLD_H ? padded[pi + PL] : 0;
          const topH = above === B.WATER ? 1 : 0.875;
          for (let f = 0; f < 6; f++) {
            const ny = y + FACES[f].n[1];
            const nid = ny < 0 || ny >= WORLD_H ? 0 : padded[pi + NOFF[f]];
            if (nid === B.WATER) continue;
            const nk = KIND[nid];
            if (nk === Kind.Opaque || nk === Kind.Emissive) continue;
            if (f === 3 && nid !== 0) continue;
            emitWater(f, x0 + x, y, z0 + z, topH, lamps, nl);
          }
          continue;
        }
        const emissive = kind === Kind.Emissive;
        for (let f = 0; f < 6; f++) {
          const ny = y + FACES[f].n[1];
          if (ny < 0) continue;
          const nid = ny >= WORLD_H ? 0 : padded[pi + NOFF[f]];
          const nk = KIND[nid];
          if (nk === Kind.Opaque || nk === Kind.Emissive) continue;
          if (kind === Kind.Cutout && nid === id) continue;
          const fd = FACES[f];
          const tile = fd.dir === 'top' ? def.top : fd.dir === 'bottom' ? def.bottom : def.side;
          const u0 = (tile % ATLAS_COLS) * TW, v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) * TH;
          const b = opaqueBuf;
          b.ensure(4);
          const base = b.nv;
          const wx = x0 + x, wz = z0 + z;
          // glow from nearby lanterns (sampled at face centre)
          let glow = 0;
          if (emissive) glow = 2;
          else if (nl) {
            const fcx = wx + 0.5 + fd.n[0] * 0.6, fcy = y + 0.5 + fd.n[1] * 0.6, fcz = wz + 0.5 + fd.n[2] * 0.6;
            for (let i = 0; i < nl; i += 3) {
              const dx = lamps[i] - fcx, dy = lamps[i + 1] - fcy, dz = lamps[i + 2] - fcz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < 36) { const t = 1 - Math.sqrt(d2) / 6; glow += t * t * 0.8; }
            }
            if (glow > 1) glow = 1;
          }
          const ao = AO_OFF[f];
          let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
          for (let k = 0; k < 4; k++) {
            const o = ao[k];
            const s1 = OCCLUDES_AO[padded[pi + o[0]]], s2 = OCCLUDES_AO[padded[pi + o[1]]], c = OCCLUDES_AO[padded[pi + o[2]]];
            const lvl = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
            if (k === 0) a0 = lvl; else if (k === 1) a1 = lvl; else if (k === 2) a2 = lvl; else a3 = lvl;
            const vv = fd.v[k];
            const vi = b.nv * 3;
            b.pos[vi] = wx + vv[0]; b.pos[vi + 1] = y + vv[1]; b.pos[vi + 2] = wz + vv[2];
            b.nor[vi] = fd.n[0]; b.nor[vi + 1] = fd.n[1]; b.nor[vi + 2] = fd.n[2];
            const ui = b.nv * 2;
            const uu = UVS[k];
            b.uv[ui] = u0 + (uu[0] ? TW - EPS : EPS); b.uv[ui + 1] = v0 + (uu[1] ? TH - EPS : EPS);
            b.light[ui] = (emissive ? 1 : AO_CURVE[lvl]) * fd.shade; b.light[ui + 1] = glow;
            b.nv++;
          }
          const ii = b.ni;
          if (a0 + a2 < a1 + a3) {
            b.idx[ii] = base + 1; b.idx[ii + 1] = base + 2; b.idx[ii + 2] = base + 3;
            b.idx[ii + 3] = base + 1; b.idx[ii + 4] = base + 3; b.idx[ii + 5] = base;
          } else {
            b.idx[ii] = base; b.idx[ii + 1] = base + 1; b.idx[ii + 2] = base + 2;
            b.idx[ii + 3] = base; b.idx[ii + 4] = base + 2; b.idx[ii + 5] = base + 3;
          }
          b.ni += 6;
        }
      }
    }
  }
  return { opaque: take(opaqueBuf), water: take(waterBuf), minY, maxY };
}

function emitWater(f: number, wx: number, y: number, wz: number, topH: number, lamps: number[], nl: number) {
  const b = waterBuf;
  b.ensure(4);
  const fd = FACES[f];
  const base = b.nv;
  let glow = 0;
  if (nl && y >= SEA - 2) {
    for (let i = 0; i < nl; i += 3) {
      const dx = lamps[i] - (wx + 0.5), dy = lamps[i + 1] - (y + 1), dz = lamps[i + 2] - (wz + 0.5);
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 64) { const t = 1 - Math.sqrt(d2) / 8; glow += t * t; }
    }
    if (glow > 1) glow = 1;
  }
  for (let k = 0; k < 4; k++) {
    const vv = fd.v[k];
    const vi = b.nv * 3;
    b.pos[vi] = wx + vv[0]; b.pos[vi + 1] = y + (vv[1] ? topH : 0); b.pos[vi + 2] = wz + vv[2];
    b.nor[vi] = fd.n[0]; b.nor[vi + 1] = fd.n[1]; b.nor[vi + 2] = fd.n[2];
    const ui = b.nv * 2;
    b.uv[ui] = 0; b.uv[ui + 1] = 0;
    b.light[ui] = fd.shade; b.light[ui + 1] = glow;
    b.nv++;
  }
  const ii = b.ni;
  b.idx[ii] = base; b.idx[ii + 1] = base + 1; b.idx[ii + 2] = base + 2;
  b.idx[ii + 3] = base; b.idx[ii + 4] = base + 2; b.idx[ii + 5] = base + 3;
  b.ni += 6;
}
