// Landmark generators. Each structure is deterministic and written chunk-by-chunk
// through a clipping Writer, so it can span any number of chunks.
import { B } from './blocks';
import { Writer, tree } from './builder';
import { heightAt, lakeField, townMask, SEA } from './terrain';
import { hash2 } from './noise';

export interface Structure { x0: number; z0: number; x1: number; z1: number; build(w: Writer): void }

// ----------------------------------------------------------------- City Palace
const PALACE_B = 40;
const FH = 5;
const WINGS: [number, number, number, number, number][] = [
  // z0, z1, front x, back x, floors
  [-74, -58, 62, 88, 4],
  [-57, -38, 60, 90, 6],
  [-37, -12, 60, 92, 7],
  [-11, 10, 61, 90, 5],
  [11, 34, 63, 86, 4],
];

function palaceWing(w: Writer, idx: number) {
  const [z0, z1, xf, xb, floors] = WINGS[idx];
  const B0 = PALACE_B;
  const top = B0 + floors * FH;
  if (!w.overlaps(xf - 3, z0 - 3, xb + 3, z1 + 3)) return;
  w.fill(xf, B0 + 1, z0, xb, top + 12, z1, B.AIR);
  w.walls(xf, B0 + 1, z0, xb, top, z1, B.PLASTER);
  // sandstone ground storey with arcade toward the lake
  w.walls(xf, B0 + 1, z0, xb, B0 + FH - 1, z1, B.SANDSTONE);
  for (let z = z0 + 1; z < z1; z++) if ((z - z0) % 3 !== 0) w.fill(xf, B0 + 1, z, xf, B0 + 3, z, B.AIR);
  // floors, string-course ledges, windows
  for (let k = 1; k <= floors; k++) {
    const y = B0 + k * FH;
    w.fill(xf, y, z0, xb, y, z1, k === floors ? B.MARBLE : B.PLANKS);
    w.walls(xf, y, z0, xb, y, z1, B.MARBLE);
    // overhanging chajja on the lake facade, lamps strung along it
    for (let z = z0; z <= z1; z++) w.set(xf - 1, y, z, (k % 2 === 1 && z % 8 === 0) ? B.LAMP : B.MARBLE);
    if (k % 2 === 0) for (let z = z0 + 1; z < z1; z++) w.set(xf, y - 1, z, B.INLAY);
  }
  for (let k = 1; k < floors; k++) {
    const fb = B0 + k * FH;
    for (let z = z0 + 2; z <= z1 - 2; z += 3) {
      if (k % 2 === 1 && (z - z0) % 9 === 5) {
        w.jharokha(xf, fb + 1, z, 0, 1, B.MARBLE, B.MARBLE);
        w.set(xf, fb + 1, z, B.LAMP);
      } else w.fill(xf, fb + 2, z, xf, fb + 3, z, B.LATTICE);
    }
    for (let x = xf + 2; x <= xb - 2; x += 3) {
      w.fill(x, fb + 2, z0, x, fb + 3, z0, B.LATTICE);
      w.fill(x, fb + 2, z1, x, fb + 3, z1, B.LATTICE);
    }
    for (let z = z0 + 2; z <= z1 - 2; z += 4) w.fill(xb, fb + 2, z, xb, fb + 3, z, B.LATTICE);
  }
  // roofline
  w.crenel(xf, z0, xb, z1, top + 1, B.MARBLE, 4);
  for (const [cx, cz] of [[xf + 2, z0 + 2], [xf + 2, z1 - 2], [xb - 2, z0 + 2], [xb - 2, z1 - 2]])
    w.chhatri(cx, top + 1, cz, 1, B.MARBLE, B.MARBLE, B.GOLD);
  if (idx === 1 || idx === 3) {
    for (let z = z0 + 7; z <= z1 - 6; z += 6) w.chhatri(xf + 2, top + 1, z, 1, B.MARBLE, B.MARBLE, B.GOLD);
  }
  if (idx === 2) {
    // twin towers on the lake front + the great brass dome
    for (const tz of [z0 + 1, z1 - 5]) {
      const tx = xf;
      w.fill(tx, top + 1, tz, tx + 4, top + 9, tz + 4, B.PLASTER);
      w.fill(tx + 1, top + 1, tz + 1, tx + 3, top + 9, tz + 3, B.AIR);
      for (let y = top + 3; y <= top + 7; y += 4) {
        w.fill(tx, y, tz + 2, tx, y + 1, tz + 2, B.LATTICE);
        w.fill(tx + 2, y, tz, tx + 2, y + 1, tz, B.LATTICE);
        w.fill(tx + 2, y, tz + 4, tx + 2, y + 1, tz + 4, B.LATTICE);
      }
      w.fill(tx - 1, top + 10, tz - 1, tx + 5, top + 10, tz + 5, B.MARBLE);
      w.crenel(tx - 1, tz - 1, tx + 5, tz + 5, top + 11, B.MARBLE, 2);
      w.chhatri(tx + 2, top + 11, tz + 2, 1, B.MARBLE, B.GOLD, B.GOLD);
    }
    const cx = 78, cz = -25;
    w.cylinder(cx, top + 1, cz, 5.5, top + 3, B.MARBLE);
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      w.set(Math.round(cx + Math.cos(ang) * 5.5), top + 2, Math.round(cz + Math.sin(ang) * 5.5), B.LATTICE);
    }
    w.disk(cx, top + 4, cz, 6.2, B.MARBLE);
    w.dome(cx, top + 5, cz, 5, B.GOLD, B.GOLD);
    for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) w.chhatri(cx + ox, top + 1, cz + oz, 1, B.MARBLE, B.GOLD, B.GOLD);
  }
}

const cityPalace: Structure = {
  x0: 46, z0: -84, x1: 98, z1: 46,
  build(w) {
    const B0 = PALACE_B;
    w.foundation(56, -78, 95, 40, B0, B.SANDSTONE, 14);
    // fortified lakeside wall rising straight from the water
    w.fill(54, 18, -78, 59, B0, 40, B.SANDSTONE);
    for (let z = -78; z <= 40; z++) {
      if (z >= -7 && z <= -1) continue;
      w.set(54, B0 + 1, z, B.SANDSTONE);
      if (z % 2 === 0) w.set(54, B0 + 2, z, z % 8 === 0 ? B.LAMP : B.SANDSTONE);
    }
    // bastions with chhatris
    for (const bz of [-78, -50, -22, 14, 40]) {
      w.cylinder(54, 18, bz, 3.6, B0 + 2, B.SANDSTONE);
      w.disk(54, B0 + 3, bz, 3.6, B.MARBLE);
      w.chhatri(54, B0 + 4, bz, 1, B.MARBLE, B.MARBLE, B.GOLD);
    }
    // water stairs (ghat) up to the terrace
    for (let i = 0; i < 24; i++) {
      const x = 53 - i, top = B0 - 1 - i;
      if (top < 18) break;
      w.fill(x, 18, -7, x, top, -1, B.SANDSTONE);
      w.fill(x, top + 1, -7, x, B0 + 3, -1, B.AIR);
      if (top + 1 < SEA) w.fill(x, top + 1, -7, x, SEA - 1, -1, B.WATER);
    }
    w.fill(54, B0 + 1, -7, 59, B0 + 3, -1, B.AIR);
    w.fill(54, B0, -7, 59, B0, -1, B.SANDSTONE);
    for (let i = 0; i < WINGS.length; i++) palaceWing(w, i);
  },
};

// ----------------------------------------------------------- Lake Palace (Jag Niwas)
const lakePalace: Structure = {
  x0: -12, z0: 0, x1: 34, z1: 31,
  build(w) {
    const B0 = SEA + 1;
    const X0 = -2, X1 = 30, Z0 = 3, Z1 = 27;
    const IX0 = 6, IX1 = 22, IZ0 = 9, IZ1 = 21;
    w.fill(X0 - 1, 16, Z0 - 1, X1 + 1, B0, Z1 + 1, B.MARBLE);
    w.fill(X0, B0 + 1, Z0, X1, B0 + 16, Z1, B.AIR);
    // ground storey arcades (outer + courtyard ring)
    const arcade = (ax: number, az: number, bx: number, bz: number, y: number) => {
      w.walls(ax, y, az, bx, y + 3, bz, B.MARBLE);
      for (let x = ax + 1; x < bx; x++) if (x % 2 === 0) { w.fill(x, y, az, x, y + 2, az, B.AIR); w.fill(x, y, bz, x, y + 2, bz, B.AIR); }
      for (let z = az + 1; z < bz; z++) if (z % 2 === 0) { w.fill(ax, y, z, ax, y + 2, z, B.AIR); w.fill(bx, y, z, bx, y + 2, z, B.AIR); }
    };
    arcade(X0, Z0, X1, Z1, B0 + 1);
    arcade(IX0, IZ0, IX1, IZ1, B0 + 1);
    // first floor slab with ledge
    w.fill(X0 - 1, B0 + 5, Z0 - 1, X1 + 1, B0 + 5, Z1 + 1, B.MARBLE);
    for (let x = X0 - 1; x <= X1 + 1; x += 3) { w.set(x, B0 + 5, Z0 - 1, B.LAMP); w.set(x, B0 + 5, Z1 + 1, B.LAMP); }
    // upper storey
    w.walls(X0, B0 + 6, Z0, X1, B0 + 9, Z1, B.MARBLE);
    w.walls(IX0, B0 + 6, IZ0, IX1, B0 + 9, IZ1, B.MARBLE);
    for (let x = X0 + 2; x < X1; x += 3) { w.fill(x, B0 + 7, Z0, x, B0 + 8, Z0, B.LATTICE); w.fill(x, B0 + 7, Z1, x, B0 + 8, Z1, B.LATTICE); }
    for (let z = Z0 + 2; z < Z1; z += 3) { w.fill(X0, B0 + 7, z, X0, B0 + 8, z, B.LATTICE); w.fill(X1, B0 + 7, z, X1, B0 + 8, z, B.LATTICE); }
    for (const [jx, jz, d] of [[X0, 15, 0], [14, Z0, 2], [14, Z1, 3], [X1, 15, 1]] as const) w.jharokha(jx, B0 + 6, jz, d, 1);
    w.fill(X0, B0 + 10, Z0, X1, B0 + 10, Z1, B.MARBLE);
    w.crenel(X0, Z0, X1, Z1, B0 + 11, B.MARBLE, 4);
    // open courtyard with pool and trees
    w.fill(IX0 + 1, B0 + 5, IZ0 + 1, IX1 - 1, B0 + 16, IZ1 - 1, B.AIR);
    w.fill(IX0 + 1, B0, IZ0 + 1, IX1 - 1, B0, IZ1 - 1, B.GRASS);
    w.fill(11, B0, 13, 17, B0, 17, B.MARBLE);
    w.fill(12, B0, 14, 16, B0, 16, B.WATER);
    w.set(14, B0 + 1, 15, B.MARBLE);
    w.set(14, B0 + 2, 15, B.LAMP);
    for (const [tx, tz] of [[9, 12], [19, 12], [9, 18], [19, 18]]) tree(w, tx, B0 + 1, tz, 4, 2.2, 3);
    // rooftop chhatris and domes
    for (const [cx, cz] of [[1, 6], [27, 6], [1, 24], [27, 24]]) w.chhatri(cx, B0 + 11, cz, 1);
    for (const [cx, cz] of [[1, 15], [27, 15]]) w.chhatri(cx, B0 + 11, cz, 1, B.MARBLE, B.MARBLE);
    for (const [cx, cz] of [[14, 6], [14, 24]]) {
      w.cylinder(cx, B0 + 11, cz, 2.6, B0 + 12, B.MARBLE);
      w.dome(cx, B0 + 13, cz, 2.6, B.MARBLE, B.GOLD);
    }
    // landing steps facing Ambrai
    for (let i = 0; i < 8; i++) w.fill(X0 - 2 - i, 16, 12, X0 - 2 - i, B0 - 1 - i, 18, B.MARBLE);
  },
};

// ------------------------------------------------------------------ Jag Mandir
function elephant(w: Writer, x: number, y: number, z: number) {
  w.fill(x - 1, y + 1, z + 1, x + 1, y + 2, z + 4, B.MARBLE);
  for (const [lx, lz] of [[x - 1, z + 1], [x + 1, z + 1], [x - 1, z + 4], [x + 1, z + 4]]) w.set(lx, y, lz, B.MARBLE);
  w.fill(x - 1, y + 2, z, x + 1, y + 3, z, B.MARBLE);
  w.set(x - 2, y + 2, z, B.MARBLE); w.set(x + 2, y + 2, z, B.MARBLE);
  w.fill(x, y, z - 1, x, y + 1, z - 1, B.MARBLE);
  w.fill(x, y + 3, z + 2, x, y + 3, z + 3, B.OCHRE);
}

const jagMandir: Structure = {
  x0: -16, z0: 86, x1: 16, z1: 124,
  build(w) {
    const B0 = SEA + 1;
    w.fill(-14, 16, 98, 14, B0, 122, B.SANDSTONE);
    w.fill(-14, B0 + 1, 98, 14, B0 + 24, 122, B.AIR);
    w.fill(-13, B0, 99, 13, B0, 121, B.GRASS);
    w.crenel(-14, 98, 14, 122, B0 + 1, B.MARBLE, 4);
    w.fill(-2, B0 + 1, 98, 2, B0 + 2, 98, B.AIR);
    for (let i = 0; i < 9; i++) w.fill(-2, 16, 97 - i, 2, B0 - i, 97 - i, B.SANDSTONE);
    for (const ex of [-11, -7, 7, 11]) elephant(w, ex, B0 + 1, 100);
    // Gul Mahal: yellow sandstone pavilion with a great dome
    w.fill(-5, B0, 105, 5, B0, 115, B.MARBLE);
    w.walls(-5, B0 + 1, 105, 5, B0 + 9, 115, B.SANDSTONE);
    for (const [ax, az, bx, bz] of [[-1, 105, 1, 105], [-1, 115, 1, 115], [-5, 109, -5, 111], [5, 109, 5, 111]])
      w.fill(ax, B0 + 1, az, bx, B0 + 3, bz, B.AIR);
    w.walls(-5, B0 + 5, 105, 5, B0 + 5, 115, B.INLAY);
    for (const off of [-3, 3]) {
      w.fill(off, B0 + 6, 105, off, B0 + 8, 105, B.LATTICE); w.fill(off, B0 + 6, 115, off, B0 + 8, 115, B.LATTICE);
      w.fill(-5, B0 + 6, 110 + off, -5, B0 + 8, 110 + off, B.LATTICE); w.fill(5, B0 + 6, 110 + off, 5, B0 + 8, 110 + off, B.LATTICE);
    }
    w.fill(-6, B0 + 10, 104, 6, B0 + 10, 116, B.MARBLE);
    w.crenel(-6, 104, 6, 116, B0 + 11, B.MARBLE, 4);
    w.cylinder(0, B0 + 11, 110, 4, B0 + 12, B.MARBLE);
    w.dome(0, B0 + 13, 110, 4.5, B.MARBLE, B.GOLD);
    for (const [cx, cz] of [[-5, 105], [5, 105], [-5, 115], [5, 115]]) w.chhatri(cx, B0 + 11, cz, 1, B.MARBLE, B.GOLD);
    w.set(0, B0 + 1, 110, B.LAMP);
    for (const [tx, tz] of [[-10, 108], [10, 108], [-10, 118], [10, 118]]) tree(w, tx, B0 + 1, tz, 5, 2.6, 9);
    for (const [cx, cz] of [[-12, 120], [12, 120]]) w.chhatri(cx, B0 + 1, cz, 1);
  },
};

// ------------------------------------------------------- Sajjangarh (Monsoon Palace)
const SAJ_X = -210, SAJ_Z = -40;
const sajjangarh: Structure = {
  x0: SAJ_X - 20, z0: SAJ_Z - 18, x1: SAJ_X + 20, z1: SAJ_Z + 18,
  build(w) {
    const B0 = heightAt(SAJ_X, SAJ_Z) + 1;
    const X0 = SAJ_X - 12, X1 = SAJ_X + 12, Z0 = SAJ_Z - 10, Z1 = SAJ_Z + 10;
    w.foundation(X0 - 4, Z0 - 4, X1 + 4, Z1 + 4, B0, B.SANDSTONE, 40);
    w.crenel(X0 - 4, Z0 - 4, X1 + 4, Z1 + 4, B0 + 1, B.SANDSTONE, 4);
    const floors = 3, top = B0 + floors * FH;
    w.walls(X0, B0 + 1, Z0, X1, top, Z1, B.PLASTER);
    for (let k = 1; k <= floors; k++) {
      const y = B0 + k * FH;
      w.fill(X0, y, Z0, X1, y, Z1, B.MARBLE);
      w.walls(X0 - 1, y, Z0 - 1, X1 + 1, y, Z1 + 1, B.MARBLE);
    }
    for (let k = 0; k < floors; k++) {
      const fb = B0 + k * FH;
      for (let x = X0 + 2; x <= X1 - 2; x += 3) { w.fill(x, fb + 2, Z0, x, fb + 3, Z0, B.LATTICE); w.fill(x, fb + 2, Z1, x, fb + 3, Z1, B.LATTICE); }
      for (let z = Z0 + 2; z <= Z1 - 2; z += 3) { w.fill(X0, fb + 2, z, X0, fb + 3, z, B.LATTICE); w.fill(X1, fb + 2, z, X1, fb + 3, z, B.LATTICE); }
    }
    w.fill(SAJ_X - 1, B0 + 1, Z1, SAJ_X + 1, B0 + 3, Z1, B.AIR);
    w.crenel(X0, Z0, X1, Z1, top + 1, B.PLASTER, 2);
    // central tower + dome
    w.fill(SAJ_X - 3, top + 1, SAJ_Z - 3, SAJ_X + 3, top + 9, SAJ_Z + 3, B.PLASTER);
    for (let y = top + 2; y <= top + 8; y += 3) {
      w.set(SAJ_X, y, SAJ_Z - 3, B.LATTICE); w.set(SAJ_X, y, SAJ_Z + 3, B.LATTICE);
      w.set(SAJ_X - 3, y, SAJ_Z, B.LATTICE); w.set(SAJ_X + 3, y, SAJ_Z, B.LATTICE);
    }
    w.fill(SAJ_X - 4, top + 10, SAJ_Z - 4, SAJ_X + 4, top + 10, SAJ_Z + 4, B.MARBLE);
    w.crenel(SAJ_X - 4, SAJ_Z - 4, SAJ_X + 4, SAJ_Z + 4, top + 11, B.MARBLE, 2);
    w.dome(SAJ_X, top + 11, SAJ_Z, 3, B.MARBLE, B.GOLD);
    for (const [cx, cz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
      w.cylinder(cx, B0 + 1, cz, 2.4, top + 4, B.PLASTER);
      w.disk(cx, top + 5, cz, 2.8, B.MARBLE);
      w.chhatri(cx, top + 6, cz, 1, B.MARBLE, B.MARBLE, B.GOLD);
      w.set(cx, top + 5, cz - 3, B.LAMP); w.set(cx, top + 5, cz + 3, B.LAMP);
    }
    for (let z = Z0 + 3; z <= Z1 - 3; z += 6) { w.chhatri(X0 + 2, top + 1, z, 1); w.chhatri(X1 - 2, top + 1, z, 1); }
  },
};

// ---------------------------------------------------------------- Ghats
const ambraiGhat: Structure = {
  x0: -74, z0: -52, x1: -26, z1: -8,
  build(w) {
    const P = SEA + 3; // plaza top block
    w.foundation(-62, -44, -47, -14, P, B.SANDSTONE, 16);
    for (let i = 0; i < 20; i++) {
      const x = -46 + i, top = P - 1 - i;
      if (top < 18) break;
      w.fill(x, 16, -42, x, top, -16, B.SANDSTONE);
      w.fill(x, top + 1, -42, x, P + 12, -16, B.AIR);
      if (top + 1 < SEA) w.fill(x, top + 1, -42, x, SEA - 1, -16, B.WATER);
    }
    // side walls of the ghat
    for (let x = -46; x <= -40; x++) {
      const top = P - 1 - (x + 46);
      w.fill(x, 16, -43, x, Math.max(top + 1, SEA), -43, B.SANDSTONE);
      w.fill(x, 16, -15, x, Math.max(top + 1, SEA), -15, B.SANDSTONE);
    }
    w.chhatri(-49, P + 1, -40, 1, B.PLASTER, B.MARBLE, B.GOLD);
    w.chhatri(-49, P + 1, -18, 1, B.PLASTER, B.MARBLE, B.GOLD);
    for (const z of [-37, -21]) { w.fill(-47, P + 1, z, -47, P + 2, z, B.SANDSTONE); w.set(-47, P + 3, z, B.LAMP); }
    tree(w, -57, P + 1, -47, 6, 3.6, 21);
    tree(w, -58, P + 1, -11, 5, 3, 22);
  },
};

const gangaurGhat: Structure = {
  x0: 26, z0: -110, x1: 62, z1: -80,
  build(w) {
    const P = SEA + 3;
    w.foundation(48, -106, 60, -84, P, B.SANDSTONE, 18);
    for (let i = 0; i < 20; i++) {
      const x = 47 - i, top = P - 1 - i;
      if (top < 18) break;
      w.fill(x, 16, -104, x, top, -86, B.SANDSTONE);
      w.fill(x, top + 1, -104, x, P + 12, -86, B.AIR);
      if (top + 1 < SEA) w.fill(x, top + 1, -104, x, SEA - 1, -86, B.WATER);
    }
    // Tripolia-style triple-arched gateway
    const gx = 55;
    w.fill(gx, P + 1, -104, gx + 1, P + 10, -86, B.MARBLE);
    w.fill(gx, P + 1, -97, gx + 1, P + 6, -93, B.AIR);
    w.fill(gx, P + 1, -102, gx + 1, P + 4, -100, B.AIR);
    w.fill(gx, P + 1, -90, gx + 1, P + 4, -88, B.AIR);
    w.fill(gx - 1, P + 8, -104, gx - 1, P + 8, -86, B.INLAY);
    for (let z = -103; z <= -87; z += 4) w.fill(gx - 1, P + 9, z, gx - 1, P + 9, z, B.LATTICE);
    w.crenel(gx - 1, -105, gx + 2, -85, P + 11, B.MARBLE, 4);
    for (const z of [-101, -95, -89]) w.chhatri(gx, P + 11, z, 1, B.MARBLE, B.MARBLE, B.GOLD);
    for (const z of [-99, -91]) w.set(gx - 1, P + 3, z, B.LAMP);
  },
};

// ------------------------------------------------------------ Jagdish Temple
const JX = 110, JZ = -92;
const jagdish: Structure = {
  x0: JX - 24, z0: JZ - 12, x1: JX + 12, z1: JZ + 12,
  build(w) {
    const P = 40;
    w.foundation(JX - 10, JZ - 10, JX + 10, JZ + 10, P, B.SANDSTONE, 34);
    w.crenel(JX - 10, JZ - 10, JX + 10, JZ + 10, P + 1, B.MARBLE, 4);
    w.fill(JX - 10, P + 1, JZ - 2, JX - 10, P + 2, JZ + 2, B.AIR);
    for (let i = 1; i < 14; i++) {
      const top = P - i;
      const x = JX - 10 - i;
      if (top < heightAt(x, JZ) - 1) break;
      w.fill(x, top - 4, JZ - 2, x, top, JZ + 2, B.SANDSTONE);
      w.fill(x, top + 1, JZ - 2, x, top + 6, JZ + 2, B.AIR);
    }
    // mandapa
    w.walls(JX - 7, P + 1, JZ - 4, JX - 1, P + 5, JZ + 4, B.MARBLE);
    w.fill(JX - 7, P + 1, JZ - 1, JX - 7, P + 3, JZ + 1, B.AIR);
    w.fill(JX - 8, P + 6, JZ - 5, JX, P + 6, JZ + 5, B.MARBLE);
    w.dome(JX - 4, P + 7, JZ, 3.2, B.MARBLE, B.GOLD);
    w.set(JX - 4, P + 1, JZ, B.LAMP);
    // shikhara: curvilinear tower
    const H = 22;
    for (let k = 0; k < H; k++) {
      const hw = Math.round(3.6 * (1 - Math.pow(k / (H + 1), 1.7)) + 0.2);
      const id = k % 4 === 3 ? B.SANDSTONE : B.MARBLE;
      w.fill(JX + 4 - hw, P + 1 + k, JZ - hw, JX + 4 + hw, P + 1 + k, JZ + hw, id);
      if (hw >= 2 && k % 4 === 1) for (const s of [-1, 1]) {
        w.set(JX + 4 + s * (hw + 1), P + 1 + k, JZ, id);
        w.set(JX + 4, P + 1 + k, JZ + s * (hw + 1), id);
      }
    }
    w.disk(JX + 4, P + 1 + H, JZ, 1.5, B.SANDSTONE);
    w.fill(JX + 4, P + 2 + H, JZ, JX + 4, P + 3 + H, JZ, B.GOLD);
    for (const [cx, cz] of [[JX - 9, JZ - 9], [JX + 9, JZ - 9], [JX - 9, JZ + 9], [JX + 9, JZ + 9]]) w.chhatri(cx, P + 1, cz, 1);
  },
};

// --------------------------------------------- Karni Mata temple on Machla Magra
const karniMata: Structure = {
  x0: 110, z0: 142, x1: 126, z1: 158,
  build(w) {
    const P = heightAt(118, 150) + 1;
    w.foundation(113, 145, 123, 155, P, B.MARBLE, 20);
    w.chhatri(118, P + 1, 150, 2, B.MARBLE, B.MARBLE, B.GOLD);
    w.crenel(113, 145, 123, 155, P + 1, B.MARBLE, 4);
  },
};

// ------------------------------------------------------------------ Boats
function boat(w: Writer, x: number, z: number, alongX: boolean, canopy: number) {
  const L = 3, Wd = 1;
  const ax = alongX ? L : Wd, az = alongX ? Wd : L;
  w.fill(x - ax, SEA - 1, z - az, x + ax, SEA - 1, z + az, B.PLANKS);
  w.walls(x - ax, SEA, z - az, x + ax, SEA, z + az, B.PLANKS);
  if (alongX) { w.set(x - ax - 1, SEA, z, B.PLANKS); w.set(x + ax + 1, SEA, z, B.PLANKS); }
  else { w.set(x, SEA, z - az - 1, B.PLANKS); w.set(x, SEA, z + az + 1, B.PLANKS); }
  const cx = alongX ? 1 : Wd, cz = alongX ? Wd : 1;
  for (const [px, pz] of [[x - cx, z - cz], [x + cx, z - cz], [x - cx, z + cz], [x + cx, z + cz]]) w.fill(px, SEA + 1, pz, px, SEA + 2, pz, B.LOG);
  w.fill(x - cx, SEA + 3, z - cz, x + cx, SEA + 3, z + cz, canopy);
}
const BOATS: [number, number, boolean, number][] = [
  [-22, -58, true, B.OCHRE], [6, -34, false, B.BLUE], [34, -48, true, B.TERRACOTTA], [-24, 42, false, B.OCHRE],
  [38, 66, true, B.BLUE], [-18, 82, true, B.TERRACOTTA], [16, -96, false, B.OCHRE], [-28, -6, true, B.BLUE],
  [-12, 135, true, B.OCHRE], [42, 40, false, B.PLASTER],
];
const boats: Structure[] = BOATS.map(([x, z, ax, c]) => ({ x0: x - 5, z0: z - 5, x1: x + 5, z1: z + 5, build: (w: Writer) => boat(w, x, z, ax, c) }));

// --------------------------------------------------------------- Old city
const EXCLUDE: [number, number, number, number][] = [
  [44, -84, 100, 46],       // City Palace
  [24, -112, 64, -78],      // Gangaur Ghat
  [JX - 26, JZ - 14, JX + 14, JZ + 14], // Jagdish
  [-76, -54, -24, -4],      // Ambrai
];
export function excluded(x: number, z: number, pad = 0) {
  for (const [a, b, c, d] of EXCLUDE) if (x >= a - pad && x <= c + pad && z >= b - pad && z <= d + pad) return true;
  return false;
}

const CELL = 11;
const PALETTE = [B.OCHRE, B.OCHRE, B.OCHRE, B.PLASTER, B.PLASTER, B.PLASTER, B.BLUE, B.BLUE, B.TERRACOTTA, B.SANDSTONE];

function haveli(w: Writer, x0: number, z0: number, sx: number, sz: number, seed: number) {
  const r = (k: number) => hash2(seed, k, 913);
  const x1 = x0 + sx - 1, z1 = z0 + sz - 1;
  const cx = x0 + (sx >> 1), cz = z0 + (sz >> 1);
  const g = heightAt(cx, cz) - 1;
  const floors = 2 + Math.floor(r(1) * 3.2);
  const top = g + floors * 4;
  const wall = PALETTE[Math.floor(r(2) * PALETTE.length)];
  const trim = wall === B.PLASTER ? (r(3) < 0.5 ? B.SANDSTONE : B.MARBLE) : wall === B.SANDSTONE ? B.MARBLE : B.PLASTER;
  w.foundation(x0, z0, x1, z1, g, B.SANDSTONE, floors * 4 + 9);
  w.walls(x0, g + 1, z0, x1, top, z1, wall);
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) w.fill(px, g + 1, pz, px, top, pz, trim);
  for (let k = 1; k <= floors; k++) {
    const y = g + 4 * k;
    w.fill(x0 + 1, y, z0 + 1, x1 - 1, y, z1 - 1, k === floors ? B.PLASTER : B.PLANKS);
    w.walls(x0, y, z0, x1, y, z1, trim);
  }
  const step = r(4) < 0.5 ? 2 : 3;
  for (let k = 0; k < floors; k++) {
    const yb = g + 4 * k;
    for (let x = x0 + 2; x <= x1 - 2; x += step) { w.fill(x, yb + 2, z0, x, yb + 3, z0, B.LATTICE); w.fill(x, yb + 2, z1, x, yb + 3, z1, B.LATTICE); }
    for (let z = z0 + 2; z <= z1 - 2; z += step) { w.fill(x0, yb + 2, z, x0, yb + 3, z, B.LATTICE); w.fill(x1, yb + 2, z, x1, yb + 3, z, B.LATTICE); }
  }
  // door + lanterns on the street face
  const front = r(5) < 0.5 ? z0 : z1;
  const dir = front === z0 ? 2 : 3;
  w.fill(cx, g + 1, front, cx, g + 3, front, B.AIR);
  w.set(cx - 1, g + 2, front, B.LAMP);
  w.set(cx + 1, g + 2, front, B.LAMP);
  w.set(cx, g + 4, front, B.INLAY);
  // a lit room upstairs
  if (r(6) < 0.6) w.set(x0 + 1, g + 4 * (floors - 1) + 1, front === z0 ? z0 + 1 : z1 - 1, B.LAMP);
  if (floors >= 3 && r(7) < 0.55) w.jharokha(cx, g + 5, front, dir, 1, trim, trim);
  // roof
  w.crenel(x0, z0, x1, z1, top + 1, wall);
  if (r(8) < 0.35 && sx >= 7) w.chhatri(x1 - 2, top + 1, z1 - 2, 1, trim, B.PLASTER, B.GOLD);
  else if (r(8) < 0.6) {
    w.fill(x0 + 1, top + 1, z0 + 1, x0 + 3, top + 2, z0 + 3, wall);
    w.fill(x0 + 1, top + 3, z0 + 1, x0 + 3, top + 3, z0 + 3, B.TERRACOTTA);
  }
  if (r(9) < 0.3) w.set(x1, top + 2, front, B.LAMP);
}

function buildOldCity(w: Writer) {
  const i0 = Math.floor((w.x0 - 12) / CELL), i1 = Math.floor((w.x0 + 16 + 12) / CELL);
  const j0 = Math.floor((w.z0 - 12) / CELL), j1 = Math.floor((w.z0 + 16 + 12) / CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const ox = i * CELL, oz = j * CELL;
      const mx = ox + 5, mz = oz + 5;
      if (townMask(mx, mz) < 0.6) continue;
      if (excluded(mx, mz, 6)) continue;
      if (lakeField(ox, oz) > -5 || lakeField(ox + CELL, oz + CELL) > -5 || lakeField(ox + CELL, oz) > -5 || lakeField(ox, oz + CELL) > -5) continue;
      const h = hash2(i, j, 4321);
      if (h < 0.07) {
        // chowk with a neem tree
        tree(w, mx, heightAt(mx, mz), mz, 5, 3, i * 31 + j);
        continue;
      }
      const sx = 7 + Math.floor(hash2(i, j, 1) * 4);
      const sz = 7 + Math.floor(hash2(i, j, 2) * 4);
      const x0 = ox + 1 + Math.floor(hash2(i, j, 3) * (CELL - 1 - sx));
      const z0 = oz + 1 + Math.floor(hash2(i, j, 5) * (CELL - 1 - sz));
      if (!w.overlaps(x0 - 3, z0 - 3, x0 + sx + 3, z0 + sz + 3)) continue;
      haveli(w, x0, z0, sx, sz, i * 7919 + j * 104729);
    }
}

export const LANDMARK_STRUCTURES: Structure[] = [
  ambraiGhat, gangaurGhat, cityPalace, lakePalace, jagMandir, sajjangarh, jagdish, karniMata, ...boats,
];

export function applyStructures(w: Writer) {
  buildOldCity(w);
  for (const s of LANDMARK_STRUCTURES) if (w.overlaps(s.x0, s.z0, s.x1, s.z1)) s.build(w);
}

export const SPAWN = { x: -51.5, y: SEA + 4, z: -29.5, yaw: -Math.PI / 2 };

export interface Landmark { name: string; hindi: string; x: number; z: number; r: number }
export const LANDMARKS: Landmark[] = [
  { name: 'Ambrai Ghat', hindi: 'अमराई घाट', x: -46, z: -29, r: 22 },
  { name: 'Gangaur Ghat', hindi: 'गणगौर घाट', x: 46, z: -95, r: 22 },
  { name: 'Jagdish Temple', hindi: 'जगदीश मंदिर', x: JX, z: JZ, r: 26 },
  { name: 'Karni Mata Temple', hindi: 'करणी माता मंदिर', x: 118, z: 150, r: 28 },
  { name: 'Jag Mandir', hindi: 'जग मंदिर', x: 0, z: 110, r: 34 },
  { name: 'Lake Palace · Jag Niwas', hindi: 'जग निवास', x: 14, z: 15, r: 34 },
  { name: 'Sajjangarh · Monsoon Palace', hindi: 'सज्जनगढ़', x: SAJ_X, z: SAJ_Z, r: 50 },
  { name: 'City Palace', hindi: 'सिटी पैलेस', x: 76, z: -20, r: 66 },
  { name: 'Old City', hindi: 'पुराना शहर', x: 170, z: -40, r: 110 },
  { name: 'Hanuman Ghat', hindi: 'हनुमान घाट', x: -85, z: -30, r: 40 },
  { name: 'Lake Pichola', hindi: 'पिछोला झील', x: 5, z: 10, r: 150 },
];
