// Chunk streaming: worker-pool generation, budgeted meshing, edits, unloading.
import * as THREE from 'three';
import { B, SOLID } from './blocks';
import { CHUNK, WORLD_H } from './terrain';
import { meshChunk, MeshData } from './mesher';
import { generateChunk } from './gen';

const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class Chunk {
  data: Uint8Array;
  lamps: number[] = [];
  opaque: THREE.Mesh | null = null;
  water: THREE.Mesh | null = null;
  dirty = true;
  meshed = false;
  modified = false;
  constructor(public cx: number, public cz: number, data: Uint8Array) {
    this.data = data;
    this.scanLamps();
  }
  scanLamps() {
    this.lamps.length = 0;
    const d = this.data, L = CHUNK * CHUNK;
    for (let i = 0; i < d.length; i++) if (d[i] === B.LAMP) {
      const y = Math.floor(i / L), r = i - y * L, z = Math.floor(r / CHUNK), x = r - z * CHUNK;
      this.lamps.push(this.cx * CHUNK + x + 0.5, y + 0.5, this.cz * CHUNK + z + 0.5);
    }
  }
}

function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('aLight', new THREE.BufferAttribute(m.light, 2));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export class World {
  chunks = new Map<number, Chunk>();
  pending = new Set<number>();
  workers: Worker[] = [];
  busy: boolean[] = [];
  queue: [number, number][] = [];
  useWorkers = true;
  renderDistance = 10;
  group = new THREE.Group();
  stats = { chunks: 0, meshed: 0, tris: 0 };

  constructor(scene: THREE.Scene, public opaqueMat: THREE.Material, public waterMat: THREE.Material) {
    scene.add(this.group);
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onGenerated(i, e.data.cx, e.data.cz, e.data.data);
        w.onerror = (ev) => { console.warn("worker failed, generating on main thread", ev); this.useWorkers = false; this.pending.clear(); };
        this.workers.push(w); this.busy.push(false);
      }
    } catch {
      this.useWorkers = false;
    }
  }

  getChunk(cx: number, cz: number) { return this.chunks.get(key(cx, cz)); }

  /** Block id at world coords, or -1 when the chunk is not loaded. */
  get(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_H) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return -1;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    return c.data[lx + lz * CHUNK + y * CHUNK * CHUNK];
  }

  isSolid(x: number, y: number, z: number) {
    const b = this.get(x, y, z);
    return b < 0 ? true : SOLID[b] === 1;
  }

  set(x: number, y: number, z: number, id: number) {
    if (y < 1 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return false;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const i = lx + lz * CHUNK + y * CHUNK * CHUNK;
    const prev = c.data[i];
    c.data[i] = id;
    c.modified = true;
    if (prev === B.LAMP || id === B.LAMP) c.scanLamps();
    const lampChange = prev === B.LAMP || id === B.LAMP;
    // remesh this chunk and any neighbour touching the edit (lamps reach further)
    const reach = lampChange ? 8 : 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = lx + dx * reach, nz = lz + dz * reach;
      const ncx = Math.floor((cx * CHUNK + nx) / CHUNK), ncz = Math.floor((cz * CHUNK + nz) / CHUNK);
      const n = this.chunks.get(key(ncx, ncz));
      if (n) n.dirty = true;
    }
    this.remeshNow(c);
    return true;
  }

  private onGenerated(wi: number, cx: number, cz: number, data: Uint8Array) {
    this.busy[wi] = false;
    this.addChunk(cx, cz, data);
    this.dispatch();
  }

  private addChunk(cx: number, cz: number, data: Uint8Array) {
    const k = key(cx, cz);
    this.pending.delete(k);
    if (this.chunks.has(k)) return;
    const c = new Chunk(cx, cz, data);
    this.chunks.set(k, c);
  }

  private dispatch() {
    if (!this.useWorkers) return;
    for (let i = 0; i < this.workers.length; i++) {
      if (this.busy[i] || this.queue.length === 0) continue;
      const [cx, cz] = this.queue.shift()!;
      this.pending.add(key(cx, cz));
      this.busy[i] = true;
      this.workers[i].postMessage({ cx, cz });
    }
  }

  private neighbours(c: Chunk): Uint8Array[] | null {
    const out: Uint8Array[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(key(c.cx + dx, c.cz + dz));
      if (!n) return null;
      out.push(n.data);
    }
    return out;
  }

  private remeshNow(c: Chunk): boolean {
    const nb = this.neighbours(c);
    if (!nb) return false;
    const lamps: number[] = [];
    const x0 = c.cx * CHUNK - 8, x1 = c.cx * CHUNK + CHUNK + 8, z0 = c.cz * CHUNK - 8, z1 = c.cz * CHUNK + CHUNK + 8;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(key(c.cx + dx, c.cz + dz))!;
      const L = n.lamps;
      for (let i = 0; i < L.length; i += 3)
        if (L[i] > x0 && L[i] < x1 && L[i + 2] > z0 && L[i + 2] < z1) lamps.push(L[i], L[i + 1], L[i + 2]);
    }
    const m = meshChunk(c.cx, c.cz, nb, lamps);
    this.disposeMeshes(c);
    if (m.opaque) {
      c.opaque = new THREE.Mesh(toGeometry(m.opaque), this.opaqueMat);
      c.opaque.matrixAutoUpdate = false;
      this.group.add(c.opaque);
    }
    if (m.water) {
      c.water = new THREE.Mesh(toGeometry(m.water), this.waterMat);
      c.water.matrixAutoUpdate = false;
      c.water.renderOrder = 1;
      this.group.add(c.water);
    }
    c.dirty = false;
    c.meshed = true;
    return true;
  }

  private disposeMeshes(c: Chunk) {
    if (c.opaque) { this.group.remove(c.opaque); c.opaque.geometry.dispose(); c.opaque = null; }
    if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); c.water = null; }
  }

  /** Stream chunks around (px,pz). budgetMs limits main-thread work this frame. */
  update(px: number, pz: number, budgetMs: number, viewDir?: THREE.Vector3) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const R = this.renderDistance;
    const want: [number, number, number][] = [];
    for (let dz = -R - 1; dz <= R + 1; dz++)
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (R + 1.5) * (R + 1.5)) continue;
        let score = d2;
        if (viewDir && d2 > 4) {
          const len = Math.sqrt(d2);
          const dot = (dx * viewDir.x + dz * viewDir.z) / len;
          score = d2 * (1.6 - dot * 0.6);
        }
        want.push([pcx + dx, pcz + dz, score]);
      }
    want.sort((a, b) => a[2] - b[2]);

    // generation requests
    this.queue.length = 0;
    for (const [cx, cz] of want) {
      const k = key(cx, cz);
      if (this.chunks.has(k) || this.pending.has(k)) continue;
      if (this.useWorkers) { this.queue.push([cx, cz]); }
      else if (performance.now() - t0 < budgetMs * 0.5) { this.addChunk(cx, cz, generateChunk(cx, cz)); }
    }
    this.dispatch();

    // meshing (within render distance only)
    for (const [cx, cz] of want) {
      if (performance.now() - t0 > budgetMs) break;
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const c = this.chunks.get(key(cx, cz));
      if (!c || !c.dirty) continue;
      this.remeshNow(c);
    }

    // unload far chunks
    const U = R + 3;
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > U * U) {
        this.disposeMeshes(c);
        if (!c.modified) this.chunks.delete(k);
        else c.dirty = true;
      } else if (dx * dx + dz * dz > (R + 1) * (R + 1) && c.meshed) {
        this.disposeMeshes(c); c.meshed = false; c.dirty = true;
      }
    }
    this.stats.chunks = this.chunks.size;
  }

  /** Fraction of chunks within radius r that are meshed. */
  readiness(px: number, pz: number, r: number) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    let tot = 0, ok = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      tot++;
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (c && c.meshed && !c.dirty) ok++;
    }
    return ok / tot;
  }

  /** Voxel DDA raycast. Returns hit block + the face normal. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tdy = sy !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tdz = sz !== 0 ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const b = this.get(x, y, z);
      if (b > 0 && b !== B.WATER) return { x, y, z, nx, ny, nz, id: b };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
