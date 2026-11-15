import './style.css';
import * as THREE from 'three';
import { buildAtlasCanvas, makeAtlasTexture, makeWaterTexture, drawBlockIcon } from './atlas';
import { makeTerrainMaterial, makeWaterMaterial, shared } from './materials';
import { World } from './world';
import { Player } from './player';
import { Sky } from './sky';
import { BLOCKS, HOTBAR, B } from './blocks';
import { SPAWN, LANDMARKS } from './structures';
import { heightAt } from './terrain';
import { detectTouch, isLowEndDevice, isIOS, initTouch } from './touch';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('game') as HTMLCanvasElement;
const IS_TOUCH = detectTouch();
const LOW_END = IS_TOUCH && isLowEndDevice();
if (IS_TOUCH) document.body.classList.add('touch');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_END ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1600);
camera.rotation.order = 'YXZ';

const atlasCanvas = buildAtlasCanvas();
const atlas = makeAtlasTexture(atlasCanvas);
const terrainMat = makeTerrainMaterial(atlas);
const waterMat = makeWaterMaterial(makeWaterTexture());
const sky = new Sky(scene);

// Touch devices keep their own render-distance setting (lighter default).
const RD_KEY = IS_TOUCH ? 'uc.rd.touch' : 'uc.rd';
const settings = {
  renderDistance: Number(localStorage.getItem(RD_KEY) || (IS_TOUCH ? (LOW_END ? 5 : 6) : 10)),
  sensitivity: Number(localStorage.getItem('uc.sens') || 1),
};

const world = new World(scene, terrainMat, waterMat);
world.renderDistance = settings.renderDistance;
const player = new Player(world);
player.pos.set(SPAWN.x, Math.max(SPAWN.y, heightAt(Math.floor(SPAWN.x), Math.floor(SPAWN.z))), SPAWN.z);
player.yaw = SPAWN.yaw;
player.pitch = 0.02;

// block highlight
const hl = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x1a1208, transparent: true, opacity: 0.65 }),
);
hl.visible = false;
scene.add(hl);

// ---------------------------------------------------------------- HUD
const $ = (id: string) => document.getElementById(id)!;
const hud = $('hud'), title = $('title'), pause = $('pause');
const playBtn = $('play') as HTMLButtonElement;
const progress = $('progress');
let selected = 0;

const hotbarEl = $('hotbar');
HOTBAR.forEach((id, i) => {
  const d = BLOCKS[id];
  const slot = document.createElement('div');
  slot.className = 'slot' + (i === 0 ? ' sel' : '');
  slot.appendChild(drawBlockIcon(atlasCanvas, d.top, d.side, 44));
  const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
  slot.appendChild(n);
  hotbarEl.appendChild(slot);
  if (IS_TOUCH) slot.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'playing') select(i); });
});
let toastTimer = 0;
function select(i: number) {
  selected = (i + HOTBAR.length) % HOTBAR.length;
  [...hotbarEl.children].forEach((c, j) => c.classList.toggle('sel', j === selected));
  const d = BLOCKS[HOTBAR[selected]];
  const t = $('toast');
  t.innerHTML = `${d.name}${d.hindi ? `<span class="hi">${d.hindi}</span>` : ''}`;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 1400);
}

// compass strip
const strip = $('compass-strip');
const PX_PER_DEG = 3;
const CARD: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
for (let rep = -1; rep <= 1; rep++)
  for (let deg = 0; deg < 360; deg += 15) {
    const el = document.createElement('div');
    const label = CARD[deg];
    el.className = 'tick' + (label ? (label.length === 1 ? ' card' : '') : ' minor');
    if (label) el.textContent = label;
    el.style.left = `${(deg + rep * 360) * PX_PER_DEG}px`;
    strip.appendChild(el);
  }
let compassHalf = 210;
const measureCompass = () => { compassHalf = ($('compass').clientWidth || 420) / 2; };
function updateCompass() {
  let heading = (-player.yaw * 180) / Math.PI;
  heading = ((heading % 360) + 360) % 360;
  strip.style.transform = `translateX(${compassHalf - heading * PX_PER_DEG}px)`;
}

let currentLandmark = '';
function updateLandmark() {
  const p = player.pos;
  let best: (typeof LANDMARKS)[number] | null = null;
  for (const l of LANDMARKS) {
    const d = Math.hypot(p.x - l.x, p.z - l.z);
    if (d < l.r) { best = l; break; }
  }
  const el = $('landmark');
  const name = best ? best.name : '';
  if (name !== currentLandmark) {
    currentLandmark = name;
    if (best) {
      (el.querySelector('.lm-en') as HTMLElement).textContent = best.name;
      (el.querySelector('.lm-hi') as HTMLElement).textContent = best.hindi;
      el.classList.add('on');
    } else el.classList.remove('on');
  }
}

// ---------------------------------------------------------------- state
type State = 'title' | 'playing' | 'paused';
let state: State = 'title';
let noLock = IS_TOUCH;
let rotateHintArmed = false;

function enterPlay() {
  state = 'playing';
  title.classList.add('hidden');
  pause.classList.add('hidden');
  hud.classList.remove('hidden');
  measureCompass();
  document.body.classList.remove('paused');
  if (IS_TOUCH) {
    document.body.classList.add('in-game');
    if (!rotateHintArmed) { rotateHintArmed = true; setTimeout(() => document.body.classList.add('hint-done'), 6000); }
  }
  if (!noLock) {
    try {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* ignore */ }
  }
}
function enterPause() {
  if (state !== 'playing') return;
  state = 'paused';
  player.keys.clear();
  touch?.reset();
  pause.classList.remove('hidden');
  document.body.classList.add('paused');
  syncSeg();
}

function requestFullscreenSafe() {
  // Only on touch, never on iOS Safari (no element fullscreen; can misbehave), and never fatal.
  if (!IS_TOUCH || isIOS() || document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (el.requestFullscreen) { const r = el.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); }
    else el.webkitRequestFullscreen?.();
  } catch { /* ignore */ }
}
playBtn.addEventListener('click', () => { requestFullscreenSafe(); enterPlay(); });
$('resume').addEventListener('click', () => enterPlay());
$('show-controls').addEventListener('click', () => $('controls').classList.toggle('hidden'));
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'playing') enterPause();
});
canvas.addEventListener('click', () => {
  if (state === 'paused') enterPlay();
});

function syncSeg() {
  document.querySelectorAll<HTMLButtonElement>('#rd-seg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.rd) === world.renderDistance));
  document.querySelectorAll<HTMLButtonElement>('#time-seg button').forEach((b) => b.classList.toggle('on', Math.abs(Number(b.dataset.t) - sky.time) < 0.02));
  ($('sens') as HTMLInputElement).value = String(settings.sensitivity);
}
document.querySelectorAll<HTMLButtonElement>('#time-seg button').forEach((b) =>
  b.addEventListener('click', () => { sky.time = Number(b.dataset.t); syncSeg(); }));
document.querySelectorAll<HTMLButtonElement>('#rd-seg button').forEach((b) =>
  b.addEventListener('click', () => {
    world.renderDistance = settings.renderDistance = Number(b.dataset.rd);
    localStorage.setItem(RD_KEY, String(settings.renderDistance));
    syncSeg();
  }));
$('sens').addEventListener('input', (e) => {
  settings.sensitivity = Number((e.target as HTMLInputElement).value);
  localStorage.setItem('uc.sens', String(settings.sensitivity));
});

// ---------------------------------------------------------------- input
let debugOn = false;
window.addEventListener('keydown', (e) => {
  if (state !== 'playing') return;
  if (e.code === 'F3') { debugOn = !debugOn; $('debug').classList.toggle('hidden', !debugOn); e.preventDefault(); return; }
  if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) select(n - 1); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && noLock) { enterPause(); return; }
  player.setKey(e.code, true);
});
window.addEventListener('keyup', (e) => player.setKey(e.code, false));
window.addEventListener('blur', () => { player.keys.clear(); touch?.reset(); });
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  const s = 0.0022 * settings.sensitivity;
  player.yaw -= e.movementX * s;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * s));
});
window.addEventListener('wheel', (e) => { if (state === 'playing') select(selected + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
window.addEventListener('contextmenu', (e) => e.preventDefault());

let mouseHeld = -1, repeatT = 0;
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  mouseHeld = e.button;
  act(e.button);
  repeatT = 0.28;
});
window.addEventListener('mouseup', () => { mouseHeld = -1; });

const eye = new THREE.Vector3(), dir = new THREE.Vector3();
let target: ReturnType<World['raycast']> = null;
function act(button: number) {
  if (!target) return;
  if (button === 0) {
    if (target.y <= 0) return;
    world.set(target.x, target.y, target.z, B.AIR);
  } else if (button === 2) {
    const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
    const cur = world.get(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER) return;
    if (player.intersectsBlock(x, y, z)) return;
    world.set(x, y, z, HOTBAR[selected]);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  measureCompass();
}
window.addEventListener('resize', onResize);
if (IS_TOUCH) {
  // mobile browsers report the new size late after rotation / toolbar changes
  const late = () => { onResize(); setTimeout(onResize, 120); setTimeout(onResize, 450); };
  window.addEventListener('orientationchange', late);
  window.visualViewport?.addEventListener('resize', late);
  document.addEventListener('visibilitychange', () => { if (document.hidden) enterPause(); });
  // iOS pinch / double-tap zoom guards
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick'])
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
}

// ---------------------------------------------------------------- touch controls
const touch = IS_TOUCH
  ? initTouch($('touch'), {
      player,
      isPlaying: () => state === 'playing',
      lookSpeed: () => 0.0022 * settings.sensitivity * 1.8,
      act: (b) => act(b),
      hold: (b) => {
        if (b < 0) { mouseHeld = -1; return; }
        mouseHeld = b; act(b); repeatT = 0.28;
      },
      pause: () => enterPause(),
    })
  : null;

// ---------------------------------------------------------------- loop
let lastT = performance.now();
let titleT = 0, hudT = 0, fpsAcc = 0, fpsN = 0, fps = 0;
const DAY_SECONDS = 20 * 60;

function frame() {
  const nowT = performance.now();
  const dt = Math.min((nowT - lastT) / 1000, 0.05);
  lastT = nowT;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  if (state === 'playing') {
    const fast = player.keys.has('KeyT') ? 60 : 1;
    sky.time = (sky.time + (dt * fast) / DAY_SECONDS) % 1;
    player.update(dt);
  } else if (state === 'title') {
    titleT += dt;
  }

  // camera
  player.eyePosition(eye);
  camera.position.copy(eye);
  if (state === 'title') {
    camera.rotation.set(0.04 + Math.sin(titleT * 0.07) * 0.03, player.yaw + Math.sin(titleT * 0.05) * 0.32 - 0.12, 0);
  } else camera.rotation.set(player.pitch, player.yaw, 0);
  camera.getWorldDirection(dir);

  if (IS_TOUCH) world.update(eye.x, eye.z, state === 'title' ? 8 : 4, dir, state === 'title' ? 3 : 1);
  else world.update(eye.x, eye.z, state === 'title' ? 12 : 6, dir);
  sky.update(dt, camera.position, world.renderDistance * 16 * 0.94);

  // underwater
  const headBlock = world.get(Math.floor(eye.x), Math.floor(eye.y + 0.1), Math.floor(eye.z));
  const under = headBlock === B.WATER;
  $('underwater').classList.toggle('on', under);
  shared.uUnderwater.value = under ? 1 : 0;
  if (under) {
    shared.uFogNear.value = 1; shared.uFogFar.value = 26;
    shared.uFogColor.value.setRGB(0.08, 0.3, 0.38).multiplyScalar(1 - shared.uNight.value * 0.7);
  }

  // target block
  if (state === 'playing') {
    target = world.raycast(eye, dir, 7);
    if (target) { hl.visible = true; hl.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5); }
    else hl.visible = false;
    if (mouseHeld >= 0) { repeatT -= dt; if (repeatT <= 0) { act(mouseHeld); repeatT = 0.22; } }
  } else hl.visible = false;

  hudT -= dt;
  if (hudT <= 0 && state !== 'title') {
    hudT = 0.2;
    updateLandmark();
    $('clock-text').textContent = sky.clockString();
    const night = shared.uNight.value > 0.5;
    ($('clock-icon') as HTMLElement).style.background = night ? '#dfe6ff' : '#e9c47e';
    ($('clock-icon') as HTMLElement).style.boxShadow = night ? '0 0 10px #dfe6ff' : '0 0 10px #e9c47e';
    const m = $('mode');
    m.textContent = player.flying ? 'Flight' : player.inWater ? 'Swimming' : '';
    m.classList.toggle('on', player.flying || player.inWater);
    touch?.sync();
    if (debugOn) {
      const info = renderer.info.render;
      $('debug').textContent =
        `fps ${fps}\nxyz ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}\n` +
        `chunks ${world.chunks.size}  draw ${renderer.info.render.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
        `time ${sky.clockString()}  rd ${world.renderDistance}`;
    }
  }
  if (state !== 'title') updateCompass();

  // title readiness
  if (state === 'title') {
    const r = world.readiness(eye.x, eye.z, Math.min(7, world.renderDistance));
    (progress as HTMLElement).style.width = `${Math.round(r * 100)}%`;
    const label = playBtn.querySelector('.label')!;
    if (r >= 0.98 && playBtn.disabled) {
      playBtn.disabled = false;
      label.textContent = 'Enter Udaipur';
    } else if (playBtn.disabled) {
      label.textContent = r < 0.5 ? `Raising the Aravallis… ${Math.round(r * 100)}%` : `Filling Lake Pichola… ${Math.round(r * 100)}%`;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug / automation hook (used for screenshots)
(window as any).__udaipur = {
  setTime: (t: number) => { sky.time = t; },
  teleport: (x: number, y: number, z: number, yaw = player.yaw, pitch = player.pitch) => {
    player.pos.set(x, y, z); player.yaw = yaw; player.pitch = pitch; player.vel.set(0, 0, 0);
  },
  fly: (on = true) => { player.flying = on; },
  start: () => { noLock = true; enterPlay(); },
  ready: () => world.readiness(camera.position.x, camera.position.z, Math.min(7, world.renderDistance)),
  hideHud: (h = true) => hud.classList.toggle('hidden', h),
  stats: () => ({ fps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, chunks: world.chunks.size }),
};
