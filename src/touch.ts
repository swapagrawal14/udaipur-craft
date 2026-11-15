// Touch controls: floating analog joystick (left), drag-to-look (right), action buttons.
// Only initialised on touch-first devices; desktop never loads any of this behaviour.
import { Player } from './player';

/** Touch-first device: coarse primary pointer, or touch with no fine pointer at all.
 *  `?touch=1` / `?touch=0` force it for testing. */
export function detectTouch(): boolean {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  const mm = (s: string) => typeof matchMedia === 'function' && matchMedia(s).matches;
  if (mm('(pointer: coarse)')) return true;
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !mm('(any-pointer: fine)');
}

export function isLowEndDevice(): boolean {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  return mem <= 3 || cores <= 4;
}

export function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface TouchHooks {
  player: Player;
  isPlaying: () => boolean;
  /** Radians per CSS pixel of drag. */
  lookSpeed: () => number;
  /** 0 = break, 2 = place. */
  act: (button: number) => void;
  /** Hold-to-repeat, same as a held mouse button; -1 releases. */
  hold: (button: number) => void;
  pause: () => void;
}

const JOY_RADIUS = 56;     // px travel of the knob
const SPRINT_AT = 0.85;    // fraction of radius
const TAP_MS = 220, TAP_MOVE = 9, LONG_MS = 480;

export function initTouch(root: HTMLElement, h: TouchHooks) {
  const { player } = h;
  const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    up: svg('<path d="M5 15.5l7-7 7 7"/>'),
    down: svg('<path d="M5 8.5l7 7 7-7"/>'),
    pause: svg('<path d="M8.5 5v14M15.5 5v14"/>'),
    brk: svg('<path d="M4 4h16v16H4z"/><path d="M12 4l-1.5 5 3 2.5-2 3.5 1.5 5" class="thin"/>'),
    place: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 9v6M9 12h6" class="thin"/>'),
  };
  root.innerHTML = `
    <div class="t-zone t-move"></div>
    <div class="t-zone t-look"></div>
    <div class="t-joy"><div class="t-knob"></div></div>
    <button class="t-btn t-pause" aria-label="Pause">${IC.pause}</button>
    <button class="t-btn t-fly" aria-label="Toggle flight"><b>Fly</b></button>
    <button class="t-btn t-down" aria-label="Descend">${IC.down}</button>
    <button class="t-btn t-break" aria-label="Break block">${IC.brk}<b>Break</b></button>
    <button class="t-btn t-place" aria-label="Place block">${IC.place}<b>Place</b></button>
    <button class="t-btn t-jump" aria-label="Jump">${IC.up}</button>`;
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const moveZone = q('.t-move'), lookZone = q('.t-look');
  const joy = q('.t-joy'), knob = q('.t-knob');
  const flyBtn = q('.t-fly'), downBtn = q('.t-down');

  // ---------------------------------------------------------------- joystick
  let joyId = -1, cx = 0, cy = 0;
  const resetJoy = () => {
    joyId = -1;
    player.analogX = player.analogZ = 0;
    player.analogSprint = false;
    joy.classList.remove('active', 'sprint');
    joy.style.left = joy.style.top = '';
    knob.style.transform = '';
  };
  moveZone.addEventListener('pointerdown', (e) => {
    if (joyId !== -1 || !h.isPlaying()) return;
    e.preventDefault();
    joyId = e.pointerId;
    try { moveZone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    // float the joystick to where the thumb lands (unless it's already on the base)
    const r = joy.getBoundingClientRect();
    const hx = r.left + r.width / 2, hy = r.top + r.height / 2;
    if (Math.hypot(e.clientX - hx, e.clientY - hy) > r.width / 2) {
      cx = e.clientX; cy = e.clientY;
      joy.style.left = `${cx - r.width / 2}px`;
      joy.style.top = `${cy - r.height / 2}px`;
    } else { cx = hx; cy = hy; }
    joy.classList.add('active');
    moveJoy(e.clientX, e.clientY);
  });
  const moveJoy = (x: number, y: number) => {
    let dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) { dx *= JOY_RADIUS / d; dy *= JOY_RADIUS / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let nx = dx / JOY_RADIUS, nz = dy / JOY_RADIUS;
    const m = Math.hypot(nx, nz);
    // small dead zone, then rescale so movement starts smoothly
    if (m < 0.12) { nx = nz = 0; } else { const k = (m - 0.12) / (0.88 * m); nx *= k; nz *= k; }
    player.analogX = nx; player.analogZ = nz;
    player.analogSprint = m >= SPRINT_AT;
    joy.classList.toggle('sprint', player.analogSprint);
  };
  moveZone.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) { e.preventDefault(); moveJoy(e.clientX, e.clientY); } });
  const endJoy = (e: PointerEvent) => { if (e.pointerId === joyId) resetJoy(); };
  moveZone.addEventListener('pointerup', endJoy);
  moveZone.addEventListener('pointercancel', endJoy);
  moveZone.addEventListener('lostpointercapture', endJoy);

  // ---------------------------------------------------------------- look
  // Each finger on the look zone turns the camera; a quick tap breaks, a long press places.
  const looks = new Map<number, { x: number; y: number; t: number; moved: number; long: number }>();
  lookZone.addEventListener('pointerdown', (e) => {
    if (!h.isPlaying()) return;
    e.preventDefault();
    try { lookZone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    const st = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, long: 0 };
    st.long = window.setTimeout(() => {
      if (looks.get(e.pointerId) === st && st.moved < TAP_MOVE) { h.act(2); st.moved = Infinity; navigator.vibrate?.(12); }
    }, LONG_MS);
    looks.set(e.pointerId, st);
  });
  lookZone.addEventListener('pointermove', (e) => {
    const st = looks.get(e.pointerId);
    if (!st || !h.isPlaying()) return;
    e.preventDefault();
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    st.x = e.clientX; st.y = e.clientY;
    st.moved += Math.abs(dx) + Math.abs(dy);
    const s = h.lookSpeed();
    player.yaw -= dx * s;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - dy * s));
  });
  const endLook = (e: PointerEvent) => {
    const st = looks.get(e.pointerId);
    if (!st) return;
    looks.delete(e.pointerId);
    clearTimeout(st.long);
    if (e.type === 'pointerup' && st.moved < TAP_MOVE && performance.now() - st.t < TAP_MS && h.isPlaying()) h.act(0);
  };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);

  // ---------------------------------------------------------------- buttons
  const press = (el: HTMLElement, down: () => void, up?: () => void) => {
    let id = -1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (id !== -1) return;
      id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      el.classList.add('down');
      down();
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      el.classList.remove('down');
      up?.();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  };
  press(q('.t-jump'), () => player.setKey('Space', true), () => player.setKey('Space', false));
  press(downBtn, () => player.setKey('KeyC', true), () => player.setKey('KeyC', false));
  press(flyBtn, () => player.toggleFly());
  press(q('.t-break'), () => h.hold(0), () => h.hold(-1));
  press(q('.t-place'), () => h.hold(2), () => h.hold(-1));
  press(q('.t-pause'), () => h.pause());

  return {
    /** Release everything (on pause / blur). */
    reset() {
      resetJoy();
      for (const st of looks.values()) clearTimeout(st.long);
      looks.clear();
      player.setKey('Space', false); player.setKey('KeyC', false);
      root.querySelectorAll('.down').forEach((b) => b.classList.remove('down'));
      h.hold(-1);
    },
    /** Per-HUD-tick sync of flight-dependent buttons. */
    sync() {
      root.classList.toggle('flying', player.flying);
      flyBtn.classList.toggle('on', player.flying);
    },
  };
}
