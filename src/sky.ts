// Day–night cycle: Rajasthan sunset palette, sun/moon, stars, drifting voxel clouds.
import * as THREE from 'three';
import { shared, makeSkyMaterial, makeDiscMaterial, makeCloudMaterial } from './materials';
import { mulberry32, smoothstep } from './noise';

type Key = { e: number; top: string; hor: string; glow: string; anti: string; sun: string; sunI: number; sky: string; gnd: string; cloud: string };
// keyed by sun elevation (sin of altitude)
const KEYS: Key[] = [
  { e: -0.35, top: '#04060f', hor: '#0b1226', glow: '#000000', anti: '#000000', sun: '#5a6e9a', sunI: 0.22, sky: '#2a3555', gnd: '#141820', cloud: '#1a2033' },
  { e: -0.12, top: '#0b1030', hor: '#2a2346', glow: '#3a1a30', anti: '#120e22', sun: '#5a6e9a', sunI: 0.18, sky: '#30385a', gnd: '#1a1a24', cloud: '#2b2840' },
  { e: -0.02, top: '#22305e', hor: '#b86a58', glow: '#b8482a', anti: '#3a2a4e', sun: '#ff7a3a', sunI: 0.3, sky: '#62627e', gnd: '#3a2a26', cloud: '#b87a74' },
  { e: 0.08, top: '#3b5c9a', hor: '#eea270', glow: '#e0702e', anti: '#c87a8e', sun: '#ffb070', sunI: 0.85, sky: '#8a8aa0', gnd: '#5a4636', cloud: '#ffd2b0' },
  { e: 0.22, top: '#4a74b8', hor: '#efcfa6', glow: '#e89350', anti: '#6a6a8a', sun: '#ffd09a', sunI: 1.0, sky: '#9aa6bc', gnd: '#6a5a48', cloud: '#fff0dc' },
  { e: 0.5, top: '#3f7fd2', hor: '#b8d4ea', glow: '#ffe0b0', anti: '#000000', sun: '#fff4e0', sunI: 1.05, sky: '#a8c0dc', gnd: '#7a6a58', cloud: '#ffffff' },
  { e: 1.0, top: '#3a7ad0', hor: '#b2d0ea', glow: '#ffe8c0', anti: '#000000', sun: '#fff8ec', sunI: 1.05, sky: '#b0c8e2', gnd: '#7a6a58', cloud: '#ffffff' },
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpKey(e: number, field: keyof Key, out: THREE.Color) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
  tmpA.set(a[field] as string); tmpB.set(b[field] as string);
  return out.copy(tmpA).lerp(tmpB, t);
}
function lerpNum(e: number, field: 'sunI') {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
  return a[field] + (b[field] - a[field]) * t;
}

export class Sky {
  group = new THREE.Group();
  dome: THREE.Mesh;
  sun: THREE.Mesh; moon: THREE.Mesh;
  stars: THREE.Points;
  clouds: THREE.Mesh;
  skyMat = makeSkyMaterial();
  sunMat = makeDiscMaterial(new THREE.Color('#fff2c8'));
  moonMat = makeDiscMaterial(new THREE.Color('#dfe6ff'), true);
  cloudMat: THREE.ShaderMaterial;
  starMat: THREE.PointsMaterial;
  /** 0..1 day fraction; 0.25 sunrise (east), 0.5 noon, 0.75 sunset (west). */
  time = 0.715;
  sunDir = new THREE.Vector3();
  elevation = 0;

  constructor(scene: THREE.Scene) {
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const q = new THREE.PlaneGeometry(1, 1);
    this.sun = new THREE.Mesh(q, this.sunMat); this.sun.scale.setScalar(140); this.sun.renderOrder = -9;
    this.moon = new THREE.Mesh(q, this.moonMat); this.moon.scale.setScalar(90); this.moon.renderOrder = -9;
    this.sun.frustumCulled = this.moon.frustumCulled = false;
    this.group.add(this.sun, this.moon);

    const rnd = mulberry32(7);
    const pts: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const y = Math.abs(u), r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(th) * r * 700, y * 700 - 40, Math.sin(th) * r * 700);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
    scene.add(this.group);

    // blocky clouds
    const cc = document.createElement('canvas');
    cc.width = cc.height = 64;
    const ctx = cc.getContext('2d')!;
    const r2 = mulberry32(42);
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(r2() * 64), y = Math.floor(r2() * 64), w = 2 + Math.floor(r2() * 5), h = 1 + Math.floor(r2() * 3);
      ctx.fillStyle = '#fff';
      for (const ox of [0, 64, -64]) for (const oy of [0, 64, -64]) ctx.fillRect(x + ox, y + oy, w, h);
    }
    const ct = new THREE.CanvasTexture(cc);
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.magFilter = ct.minFilter = THREE.NearestFilter;
    ct.generateMipmaps = false;
    this.cloudMat = makeCloudMaterial(ct);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), this.cloudMat);
    this.clouds.position.y = 118;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
  }

  update(dt: number, camPos: THREE.Vector3, renderFar: number) {
    const a = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.28).normalize();
    const e = this.sunDir.y;
    this.elevation = e;
    const S = shared;
    S.uSunDir.value.copy(e > -0.08 ? this.sunDir : this.sunDir.clone().negate());
    lerpKey(e, 'sun', S.uSunColor.value).multiplyScalar(lerpNum(e, 'sunI'));
    // fade the light direction swap at the horizon
    const swap = smoothstep(-0.02, -0.12, e) + smoothstep(-0.02, 0.06, e);
    S.uSunColor.value.multiplyScalar(Math.min(1, 0.25 + 0.75 * Math.min(1, swap)));
    lerpKey(e, 'sky', S.uSkyAmb.value);
    lerpKey(e, 'gnd', S.uGroundAmb.value);
    lerpKey(e, 'hor', S.uFogColor.value);
    lerpKey(e, 'glow', S.uSunGlow.value);
    S.uNight.value = 1 - smoothstep(-0.14, 0.04, e);
    S.uFogFar.value = renderFar;
    S.uFogNear.value = renderFar * 0.62;
    lerpKey(e, 'top', this.skyMat.uniforms.uTop.value);
    lerpKey(e, 'hor', this.skyMat.uniforms.uHorizon.value);
    lerpKey(e, 'anti', this.skyMat.uniforms.uAnti.value);
    S.uTime.value += dt;

    this.group.position.copy(camPos);
    this.sun.position.copy(this.sunDir).multiplyScalar(700);
    this.sun.lookAt(new THREE.Vector3().copy(camPos));
    this.moon.position.copy(this.sunDir).multiplyScalar(-700);
    this.moon.lookAt(camPos);
    this.sunMat.uniforms.uOpacity.value = smoothstep(-0.12, 0.0, e);
    lerpKey(Math.max(e, 0.02), 'sun', this.sunMat.uniforms.uColor.value);
    this.moonMat.uniforms.uOpacity.value = smoothstep(0.05, -0.15, e);
    this.starMat.opacity = smoothstep(-0.02, -0.2, e) * 0.9;

    lerpKey(e, 'cloud', this.cloudMat.uniforms.uCloudColor.value);
    this.clouds.position.x = Math.floor(camPos.x / 32) * 32;
    this.clouds.position.z = Math.floor(camPos.z / 32) * 32;
    const off = this.cloudMat.uniforms.uOffset.value as THREE.Vector2;
    off.x = S.uTime.value * 1.2;
  }

  clockString() {
    const hrs = (this.time * 24) % 24;
    const h = Math.floor(hrs), m = Math.floor((hrs - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
