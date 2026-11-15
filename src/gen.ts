// Chunk generation: terrain columns -> trees -> landmark structures.
import { B } from './blocks';
import { CHUNK, WORLD_H, SEA, heightAt, lakeField, townMask } from './terrain';
import { Writer, tree } from './builder';
import { applyStructures, excluded } from './structures';
import { hash2 } from './noise';

export const CHUNK_VOL = CHUNK * CHUNK * WORLD_H;

export function generateChunk(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK_VOL);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const P = CHUNK + 2;
  const H = new Int16Array(P * P);
  for (let dz = -1; dz <= CHUNK; dz++)
    for (let dx = -1; dx <= CHUNK; dx++) H[(dx + 1) + (dz + 1) * P] = heightAt(x0 + dx, z0 + dz);

  const L = CHUNK * CHUNK;
  for (let lz = 0; lz < CHUNK; lz++)
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const hi = (lx + 1) + (lz + 1) * P;
      const h = H[hi];
      const col = lx + lz * CHUNK;
      data[col] = B.BEDROCK;
      for (let y = 1; y < h && y < WORLD_H; y++) data[col + y * L] = B.STONE;
      const slope = Math.max(Math.abs(h - H[hi - 1]), Math.abs(h - H[hi + 1]), Math.abs(h - H[hi - P]), Math.abs(h - H[hi + P]));
      const lake = lakeField(x, z);
      let top: number = B.GRASS, sub: number = B.DIRT, depth = 3;
      if (h < SEA) {
        top = lake < 6 ? B.SAND : (hash2(x, z, 3) < 0.5 ? B.SAND : B.DIRT); sub = B.SAND; depth = 2;
      } else if (lake > -5 && h <= SEA + 1) {
        top = B.SAND; sub = B.SAND; depth = 3;
      } else if (slope >= 3 || h > 82 || (slope >= 2 && h > 52)) {
        top = B.STONE; sub = B.STONE;
      } else if (townMask(x, z) > 0.55) {
        top = B.COBBLE; sub = B.DIRT;
      }
      for (let d = 0; d < depth; d++) {
        const y = h - 1 - d;
        if (y < 1) break;
        data[col + y * L] = d === 0 ? top : sub;
      }
      for (let y = h; y < SEA; y++) data[col + y * L] = B.WATER;
    }

  const w = new Writer(data, x0, z0);
  // trees (neem / peepal on the plains, sparse scrub on the hills)
  for (let tz = z0 - 4; tz < z0 + CHUNK + 4; tz++)
    for (let tx = x0 - 4; tx < x0 + CHUNK + 4; tx++) {
      const rnd = hash2(tx, tz, 5);
      if (rnd > 0.03) continue;
      const lake = lakeField(tx, tz);
      if (lake > -3) continue;
      if (townMask(tx, tz) > 0.3 || excluded(tx, tz, 4)) continue;
      const h = heightAt(tx, tz);
      let density = 0.009 + 0.02 * (lake > -30 ? 1 : 0);
      if (h > 60) density = 0.004;
      if (rnd > density) continue;
      const big = hash2(tx, tz, 6);
      if (h > 60) tree(w, tx, h, tz, 3 + Math.floor(big * 2), 1.7, tx ^ tz);
      else tree(w, tx, h, tz, 4 + Math.floor(big * 3), 2.3 + big * 1.2, tx * 31 + tz);
    }
  applyStructures(w);
  return data;
}
