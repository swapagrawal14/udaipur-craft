// First-person controller: AABB vs voxel collision, gravity, swimming, flying.
import * as THREE from 'three';
import { World } from './world';
import { B } from './blocks';

const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62;

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  onGround = false;
  flying = false;
  inWater = false;
  headInWater = false;
  keys = new Set<string>();
  eyeOffset = 0; // smooth step-up
  private lastSpace = 0;

  constructor(public world: World) {}

  setKey(code: string, down: boolean) {
    if (down) {
      if (code === 'Space' && !this.keys.has('Space')) {
        const now = performance.now();
        if (now - this.lastSpace < 280) { this.toggleFly(); this.lastSpace = 0; }
        else this.lastSpace = now;
      }
      if (code === 'KeyF' && !this.keys.has('KeyF')) this.toggleFly();
      this.keys.add(code);
    } else this.keys.delete(code);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.y = 0;
  }

  eyePosition(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + EYE - this.eyeOffset, this.pos.z);
  }

  collides(x: number, y: number, z: number) {
    const w = this.world;
    const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 1e-6);
    const z0 = Math.floor(z - HALF), z1 = Math.floor(z + HALF - 1e-6);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++)
      if (w.isSolid(xx, yy, zz)) return true;
    return false;
  }

  /** Is the block cell overlapping the player AABB (for placement checks). */
  intersectsBlock(bx: number, by: number, bz: number) {
    return bx + 1 > this.pos.x - HALF && bx < this.pos.x + HALF &&
      by + 1 > this.pos.y && by < this.pos.y + HEIGHT &&
      bz + 1 > this.pos.z - HALF && bz < this.pos.z + HALF;
  }

  update(dt: number) {
    const k = this.keys;
    const w = this.world;
    // chunk under us not ready? hold position
    if (w.get(Math.floor(this.pos.x), 0, Math.floor(this.pos.z)) < 0) return;

    const feet = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    const head = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    this.inWater = feet === B.WATER || w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z)) === B.WATER;
    this.headInWater = head === B.WATER;

    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');

    let speed = this.flying ? (sprint ? 26 : 12) : sprint ? 6.2 : 4.3;
    if (this.inWater && !this.flying) speed *= 0.5;

    const accel = this.flying ? 10 : this.onGround ? 14 : this.inWater ? 6 : 4;
    const blend = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * blend;
    this.vel.z += (wz * speed - this.vel.z) * blend;

    if (this.flying) {
      let vy = 0;
      if (k.has('Space')) vy += speed * 0.8;
      if (k.has('KeyC') || k.has('ControlLeft')) vy -= speed * 0.8;
      this.vel.y += (vy - this.vel.y) * blend;
    } else if (this.inWater) {
      this.vel.y -= 9 * dt;
      this.vel.y *= Math.exp(-3 * dt);
      if (k.has('Space')) this.vel.y = Math.min(this.vel.y + 22 * dt, 3.2);
      this.vel.y = Math.max(this.vel.y, -3.5);
    } else {
      this.vel.y -= 28 * dt;
      if (this.vel.y < -48) this.vel.y = -48;
      if (k.has('Space') && this.onGround) this.vel.y = 8.6;
    }

    // integrate with sub-steps
    const steps = Math.ceil(Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt / 0.35) || 1;
    const sdt = dt / steps;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      this.moveAxis(0, this.vel.x * sdt);
      this.moveAxis(2, this.vel.z * sdt);
      this.moveAxis(1, this.vel.y * sdt);
    }
    this.eyeOffset = Math.max(0, this.eyeOffset - dt * 6);
    if (this.pos.y < -20) this.pos.y = 120;
  }

  private moveAxis(axis: number, d: number) {
    if (d === 0) return;
    const p = this.pos;
    if (axis === 1) {
      p.y += d;
      if (this.collides(p.x, p.y, p.z)) {
        if (d < 0) { p.y = Math.floor(p.y) + 1; this.onGround = true; if (this.flying) this.flying = false; }
        else p.y = Math.floor(p.y + HEIGHT) - HEIGHT - 1e-4;
        this.vel.y = 0;
      }
      return;
    }
    const ox = p.x, oz = p.z;
    if (axis === 0) p.x += d; else p.z += d;
    if (!this.collides(p.x, p.y, p.z)) return;
    // auto step-up one block when walking into a ledge (ghat steps!)
    const wasGrounded = this.collides(ox, p.y - 0.05, oz);
    if ((wasGrounded || this.inWater) && !this.flying && !this.collides(p.x, p.y + 1.01, p.z)) {
      const target = Math.floor(p.y) + 1;
      if (target - p.y <= 1.01 && !this.collides(p.x, target, p.z)) {
        this.eyeOffset += target - p.y;
        p.y = target;
        return;
      }
    }
    if (axis === 0) {
      p.x = d > 0 ? Math.floor(p.x + HALF) - HALF - 1e-4 : Math.floor(p.x - HALF) + 1 + HALF + 1e-4;
      this.vel.x = 0;
    } else {
      p.z = d > 0 ? Math.floor(p.z + HALF) - HALF - 1e-4 : Math.floor(p.z - HALF) + 1 + HALF + 1e-4;
      this.vel.z = 0;
    }
  }
}
