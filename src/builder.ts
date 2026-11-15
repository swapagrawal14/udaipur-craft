// Chunk-clipped voxel writer + architectural helpers (chhatris, domes, jharokhas...).
import { B } from './blocks';
import { CHUNK, WORLD_H, heightAt } from './terrain';

export class Writer {
  constructor(public data: Uint8Array, public x0: number, public z0: number) {}
  get x1() { return this.x0 + CHUNK - 1; }
  get z1() { return this.z0 + CHUNK - 1; }

  overlaps(ax: number, az: number, bx: number, bz: number) {
    return bx >= this.x0 && ax <= this.x0 + CHUNK - 1 && bz >= this.z0 && az <= this.z0 + CHUNK - 1;
  }
  set(x: number, y: number, z: number, id: number) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 1 || y >= WORLD_H) return;
    this.data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
  }
  get(x: number, y: number, z: number): number {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= WORLD_H) return -1;
    return this.data[lx + lz * CHUNK + y * CHUNK * CHUNK];
  }
  /** Set only if currently air (or water when allowWater). */
  soft(x: number, y: number, z: number, id: number) {
    const c = this.get(x, y, z);
    if (c === B.AIR) this.set(x, y, z, id);
  }
  fill(ax: number, ay: number, az: number, bx: number, by: number, bz: number, id: number) {
    const x0 = Math.max(Math.min(ax, bx), this.x0), x1 = Math.min(Math.max(ax, bx), this.x0 + CHUNK - 1);
    const z0 = Math.max(Math.min(az, bz), this.z0), z1 = Math.min(Math.max(az, bz), this.z0 + CHUNK - 1);
    const y0 = Math.max(Math.min(ay, by), 1), y1 = Math.min(Math.max(ay, by), WORLD_H - 1);
    if (x0 > x1 || z0 > z1 || y0 > y1) return;
    const d = this.data;
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const row = (z - this.z0) * CHUNK + y * CHUNK * CHUNK - this.x0;
        for (let x = x0; x <= x1; x++) d[row + x] = id;
      }
  }
  /** Four walls (perimeter only) of a box. */
  walls(ax: number, ay: number, az: number, bx: number, by: number, bz: number, id: number) {
    this.fill(ax, ay, az, bx, by, az, id);
    this.fill(ax, ay, bz, bx, by, bz, id);
    this.fill(ax, ay, az, ax, by, bz, id);
    this.fill(bx, ay, az, bx, by, bz, id);
  }
  /** Fill each column of a footprint down from y to the terrain (foundations). */
  foundation(ax: number, az: number, bx: number, bz: number, y: number, id: number, clearAbove = 0) {
    const x0 = Math.max(ax, this.x0), x1 = Math.min(bx, this.x0 + CHUNK - 1);
    const z0 = Math.max(az, this.z0), z1 = Math.min(bz, this.z0 + CHUNK - 1);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const h = Math.min(heightAt(x, z), y);
        for (let yy = Math.max(1, h - 3); yy <= y; yy++) this.set(x, yy, z, id);
        if (clearAbove) for (let yy = y + 1; yy <= y + clearAbove; yy++) this.set(x, yy, z, B.AIR);
      }
  }
  /** Horizontal disk. */
  disk(cx: number, y: number, cz: number, r: number, id: number) {
    const R = Math.ceil(r);
    if (!this.overlaps(cx - R, cz - R, cx + R, cz + R)) return;
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= r * r + 0.3) this.set(cx + dx, y, cz + dz, id);
  }
  /** Rajput dome: slightly bulbous profile, finial on top. cx,cz block centre; r radius. */
  dome(cx: number, y: number, cz: number, r: number, id: number, finial: number = B.GOLD, even = false) {
    const h = Math.max(2, Math.round(r * 1.25));
    const R = Math.ceil(r + 1);
    if (!this.overlaps(cx - R - 1, cz - R - 1, cx + R + 1, cz + R + 1)) return;
    const ox = even ? 0.5 : 0;
    for (let dy = 0; dy <= h; dy++) {
      const t = dy / (h + 0.6);
      const rad = r * Math.sqrt(Math.max(0, 1 - t * t)) * (t < 0.4 ? 1.08 : 1) + 0.35;
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          const fx = dx - ox, fz = dz - ox;
          if (fx * fx + fz * fz <= rad * rad) this.set(cx + dx, y + dy, cz + dz, id);
        }
    }
    if (finial >= 0) {
      if (even) {
        this.fill(cx, y + h + 1, cz, cx - 1, y + h + 1, cz - 1, finial);
      } else {
        this.set(cx, y + h + 1, cz, finial);
        if (r >= 3) this.set(cx, y + h + 2, cz, finial);
      }
    }
  }
  /** Chhatri: domed kiosk on four pillars. (x,z) = centre; y = floor level. */
  chhatri(x: number, y: number, z: number, r = 1, pillar: number = B.MARBLE, domeId: number = B.MARBLE, finial: number = B.GOLD) {
    if (!this.overlaps(x - r - 2, z - r - 2, x + r + 2, z + r + 2)) return;
    this.fill(x - r, y, z - r, x + r, y, z + r, pillar);
    const ph = 2 + Math.min(r, 2);
    for (const [px, pz] of [[x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]])
      this.fill(px, y + 1, pz, px, y + ph, pz, pillar);
    this.fill(x - r, y + 1, z - r, x + r, y + ph, z + r, B.AIR);
    for (const [px, pz] of [[x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]])
      this.fill(px, y + 1, pz, px, y + ph, pz, pillar);
    // chajja (overhanging eave)
    this.fill(x - r - 1, y + ph + 1, z - r - 1, x + r + 1, y + ph + 1, z + r + 1, pillar);
    this.dome(x, y + ph + 2, z, r + 0.5, domeId, finial);
  }
  /** Parapet with alternating merlons along the edge of a rectangle at height y. */
  crenel(ax: number, az: number, bx: number, bz: number, y: number, id: number, lampEvery = 0) {
    for (let x = ax; x <= bx; x++)
      for (const z of [az, bz]) {
        this.set(x, y, z, id);
        if ((x - ax) % 2 === 0) this.set(x, y + 1, z, lampEvery && (x - ax) % lampEvery === 0 ? B.LAMP : id);
      }
    for (let z = az; z <= bz; z++)
      for (const x of [ax, bx]) {
        this.set(x, y, z, id);
        if ((z - az) % 2 === 0) this.set(x, y + 1, z, lampEvery && (z - az) % lampEvery === 0 ? B.LAMP : id);
      }
  }
  /** Jharokha: projecting enclosed balcony. dir: 0=-x,1=+x,2=-z,3=+z. (x,z) wall cell; y floor of balcony. */
  jharokha(x: number, y: number, z: number, dir: number, wide = 1, frame: number = B.MARBLE, roof: number = B.MARBLE) {
    const ox = dir === 0 ? -1 : dir === 1 ? 1 : 0;
    const oz = dir === 2 ? -1 : dir === 3 ? 1 : 0;
    const tx = oz !== 0 ? 1 : 0, tz = ox !== 0 ? 1 : 0;
    const fx = x + ox, fz = z + oz;
    for (let i = -wide; i <= wide; i++) {
      const bx = fx + tx * i, bz = fz + tz * i;
      this.set(bx, y, bz, frame);            // corbelled base
      this.set(bx, y + 1, bz, i === -wide || i === wide ? frame : B.LATTICE);
      this.set(bx, y + 2, bz, i === -wide || i === wide ? frame : B.LATTICE);
      this.set(bx, y + 3, bz, roof);          // chajja
      // wall opening behind
      this.set(x + tx * i, y + 1, z + tz * i, B.AIR);
      this.set(x + tx * i, y + 2, z + tz * i, B.AIR);
    }
    this.set(fx + ox, y + 3, fz + oz, B.AIR);
    this.set(fx, y + 4, fz, roof);
    this.set(fx, y + 5, fz, B.GOLD);
  }
  /** Cylinder (bastion / tower drum). */
  cylinder(cx: number, y0: number, cz: number, r: number, y1: number, id: number) {
    const R = Math.ceil(r);
    if (!this.overlaps(cx - R, cz - R, cx + R, cz + R)) return;
    for (let y = y0; y <= y1; y++) this.disk(cx, y, cz, r, id);
  }
}

/** Neem / peepal tree. */
export function tree(w: Writer, x: number, y: number, z: number, h: number, r: number, seed: number) {
  if (!w.overlaps(x - r - 1, z - r - 1, x + r + 1, z + r + 1)) return;
  for (let i = 0; i < h; i++) w.set(x, y + i, z, B.LOG);
  const cy = y + h - 1;
  const R = Math.ceil(r);
  for (let dy = -2; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        const ry = dy < 0 ? dy * 1.4 : dy * 1.25;
        const d = dx * dx + dz * dz + ry * ry;
        if (d > r * r + 0.5) continue;
        // ragged edges
        const hh = ((x + dx) * 73856093) ^ ((y + dy) * 19349663) ^ ((z + dz) * 83492791) ^ seed;
        if (d > (r - 1) * (r - 1) && (hh & 7) === 0) continue;
        w.soft(x + dx, cy + dy, z + dz, B.LEAVES);
      }
}
