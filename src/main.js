/**
 * Game entry point: boots the renderer, builds Onett, and runs the loop.
 */
import * as THREE from 'three';
import { PixelRenderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { FollowCamera } from './core/camera.js';
import { AudioEngine } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { initTouchControls } from './ui/touch.js';
import { moveActor } from './world/collision.js';
import { buildOnett } from './world/onett.js';
import { bakeStatic } from './world/zone.js';
import { INTERIOR_BUILDERS } from './world/interiors.js';
import { TIMES, TIME_ORDER, DEFAULT_TIME, timePreset } from './world/daylight.js';
import { setWindowsLit, setLampsLit } from './world/build.js';
import { Actor, DIR_YAW } from './entities/actor.js';

const canvas = document.getElementById('view');

/**
 * Show a readable failure instead of a dead button.
 *
 * Everything below used to run at module scope, so a single throw — no WebGL2 on
 * an older phone, a shader the driver won't compile — left the page looking
 * fine, the START button wired to nothing, and no clue as to why.
 */
let reported = false;

function fatal(err, hint = '') {
  // The first report is the specific one. Rethrowing to halt the module trips
  // the global error handler, which would otherwise paper over it.
  if (reported) return;
  reported = true;
  const el = document.getElementById('boot-error');
  if (!el) return;
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  el.querySelector('.what').textContent = msg;
  el.querySelector('.hint').textContent = hint;
  el.classList.remove('hidden');
  document.getElementById('title')?.classList.add('hidden');
  console.error('[onett] boot failed:', err);
}

/** three.js needs WebGL2; say so plainly rather than throwing something cryptic. */
function webgl2Support() {
  try {
    if (!window.WebGL2RenderingContext) return 'missing';
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'blocked';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return 'ok';
  } catch {
    return 'blocked';
  }
}

let running = false;
let started = false;

window.addEventListener('error', (ev) => {
  if (!running) fatal(ev.error ?? ev.message, 'This happened while starting up.');
});
window.addEventListener('unhandledrejection', (ev) => {
  if (!running) fatal(ev.reason, 'This happened while starting up.');
});

const support = webgl2Support();
if (support !== 'ok') {
  fatal(
    new Error(support === 'missing' ? 'This browser has no WebGL2.' : 'WebGL2 is present but the browser refused a context.'),
    support === 'missing'
      ? 'The renderer needs WebGL2 (iOS 15+, or any current desktop browser). On iOS, Settings → Safari → Advanced → Experimental Features → WebGL 2.0 must be on.'
      : 'This usually means hardware acceleration is off, the tab is low on memory, or a data-saver/lite mode is blocking WebGL. Try closing other tabs or another browser.',
  );
  throw new Error('WebGL2 unavailable');
}

const renderer = new PixelRenderer(canvas, { internalHeight: 336, levels: 30 });
const input = new Input();
const audio = new AudioEngine();
const hud = new HUD(audio);
const cam = new FollowCamera(renderer.aspect);

const WALK_SPEED = 4.4;
const RUN_SPEED = 7.4;

/** Time of day. Dusk by default: the meteorite fell tonight. */
let timeName = DEFAULT_TIME;

const zones = new Map();
function getZone(name) {
  if (zones.has(name)) return zones.get(name);
  const z = name === 'onett' ? buildOnett(timeName) : INTERIOR_BUILDERS[name]?.();
  if (!z) throw new Error(`unknown zone: ${name}`);
  // Collapse the pile of little primitives into a few big buffers.
  z.baked = bakeStatic(z.scene);
  z.occluders = z.baked.occluders;
  zones.set(name, z);
  return z;
}

const player = new Actor('hero', { x: 0, y: 0, z: 0, speed: WALK_SPEED });
player.name = 'hero';

const game = {
  zone: null,
  t: 0,
  transition: 0,
  pending: null,
  doorCooldown: 0,
  stepAcc: 0,
  talking: null,
};

// --- zone switching --------------------------------------------------------

function enterZone(name, spawnKey, { silent = false } = {}) {
  const zone = getZone(name);
  if (game.zone) game.zone.scene.remove(player.group);
  game.zone = zone;
  zone.scene.add(player.group);

  const sp = zone.spawns[spawnKey] ?? zone.spawns.start ?? { x: 0, z: 0, y: 0, dir: 'down' };
  player.pos.set(sp.x, sp.y ?? 0, sp.z);
  const grounded = zone.ground.sample(sp.x, sp.z, sp.y ?? 0);
  if (grounded !== null) player.pos.y = grounded;
  player.yaw = DIR_YAW[sp.dir ?? 'down'] ?? 0;
  player.targetYaw = player.yaw;
  player.model.rotation.y = player.yaw;
  player.syncTransform();

  cam.setMode(zone.interior ? 'interior' : 'exterior');
  cam.resetYaw();
  cam.first = true;
  cam.update(0.016, player.pos, zone.occluders);

  // A spawn point normally sits right in the doorway you came through, which
  // means it also sits inside that door's trigger. Suppress any trigger the
  // player starts inside until they step out of it, or standing still in a
  // doorway would bounce you back and forth between rooms.
  game.suppressed = new Set();
  for (const d of zone.doors) {
    const dx = d.x - player.pos.x;
    const dz = d.z - player.pos.z;
    if (dx * dx + dz * dz < ((d.r ?? 1.2) + 0.2) ** 2) game.suppressed.add(d);
  }

  game.doorCooldown = 0.45;
  hud.showPlace(zone.label);
  audio.playMusic(zone.music);
  if (!silent) audio.sfx('enter');
}

/** Switch the time of day across every zone that has been built. */
function setTime(name) {
  if (!TIMES[name]) return;
  timeName = name;
  const p = timePreset(name);
  for (const z of zones.values()) z.applyTime?.(p);
  renderer.setGrade(p.grade);
  setWindowsLit(p.lamps);
  setLampsLit(p.lamps);
  if (game.zone) hud.showPlace(p.label);
}

function beginTransition(door) {
  if (game.transition > 0) return;
  if (!door.target) {
    hud.say(['It is locked.'], door.label ?? '');
    game.doorCooldown = 0.5;
    audio.sfx('cancel');
    return;
  }
  audio.sfx(door.sound ?? 'door');
  game.pending = door;
  game.transition = 0.001;
  hud.fade(true);
}

// --- interaction -----------------------------------------------------------

/** Nearest thing the player is facing, within reach. */
function findInteraction() {
  const zone = game.zone;
  const px = player.pos.x;
  const pz = player.pos.z;
  // a point slightly ahead of the player, in the direction they face
  const f = facingVector();
  const ax = px + f.x * 1.0;
  const az = pz + f.z * 1.0;

  let best = null;
  let bestD = 2.3 * 2.3;
  for (const n of zone.npcs) {
    const dx = n.pos.x - ax;
    const dz = n.pos.z - az;
    const dy = Math.abs(n.pos.y - player.pos.y);
    if (dy > 1.6) continue;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = { kind: 'npc', actor: n, lines: n.lines, name: prettyName(n.kind) }; }
  }
  for (const it of zone.interactables) {
    const dx = it.x - px;
    const dz = it.z - pz;
    const d = dx * dx + dz * dz;
    if (d < (it.r ?? 1.5) ** 2 && d < bestD * 1.6) {
      best = { kind: 'thing', lines: it.lines, name: '' };
      bestD = d;
    }
  }
  return best;
}

function prettyName(kind) {
  return ({
    mom: 'MOM', sister: 'SISTER', cop: 'OFFICER', nurse: 'NURSE',
    neighborKid: 'NEIGHBOUR', neighborKidSmall: 'KID', granny: 'OLD WOMAN',
    businessman: 'MAN IN A SUIT', punk: 'TOUGH KID', photographer: 'PHOTOGRAPHER',
    shopkeeper: 'SHOPKEEPER', townsman: 'TOWNSMAN', townswoman: 'TOWNSWOMAN',
    dog: 'DOG',
  })[kind] ?? '';
}

const _f = new THREE.Vector3();
function facingVector() {
  // The model faces where it walks, so its yaw is the answer directly.
  return _f.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
}

// --- npc behaviour ---------------------------------------------------------

const _tmp = new THREE.Vector3();
const _blockers = [];

/** Everyone except `self`, as collision discs. */
function blockersFor(zone, self) {
  _blockers.length = 0;
  for (const n of zone.npcs) {
    if (n === self) continue;
    _blockers.push({ x: n.pos.x, y: n.pos.y, z: n.pos.z, r: n.radius });
  }
  if (self !== player) _blockers.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, r: player.radius });
  return _blockers;
}

function updateNpcs(zone, dt) {
  for (const n of zone.npcs) {
    if (n.wanderRadius <= 0) {
      n.animate(0, dt, game.t);
      continue;
    }
    n.wanderTimer = (n.wanderTimer ?? Math.random() * 3) - dt;
    if (n.wanderTimer <= 0) {
      n.wanderTimer = 1.6 + Math.random() * 3.4;
      if (Math.random() < 0.4) {
        n.target = null; // pause
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * n.wanderRadius;
        n.target = _tmp.clone().set(
          n.home.x + Math.cos(a) * r, n.pos.y, n.home.z + Math.sin(a) * r,
        );
      }
    }
    let dist = 0;
    if (n.target && n !== game.talking?.actor) {
      const dx = n.target.x - n.pos.x;
      const dz = n.target.z - n.pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.15) {
        n.target = null;
      } else {
        const step = Math.min(len, n.speed * dt);
        const vx = (dx / len) * step;
        const vz = (dz / len) * step;
        const res = moveActor(zone.ground, zone.solids, n.pos.x, n.pos.z, n.pos.y,
          vx, vz, n.radius, 0.62, blockersFor(zone, n));
        if (res.blocked) n.target = null;
        dist = Math.hypot(res.x - n.pos.x, res.z - n.pos.z);
        n.pos.set(res.x, res.y, res.z);
        n.face(vx, vz);
        n.syncTransform();
      }
    }
    n.animate(dist, dt, game.t);
  }
}

// --- main loop -------------------------------------------------------------

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!running) return;
  game.t += dt;

  const zone = game.zone;

  // --- screen transitions ------------------------------------------------
  if (game.transition > 0) {
    game.transition += dt;
    if (game.transition > 0.22 && game.pending) {
      const door = game.pending;
      game.pending = null;
      enterZone(door.target, door.spawn ?? 'front');
      hud.fade(false);
    }
    if (game.transition > 0.5) game.transition = 0;
  }

  // --- input -------------------------------------------------------------
  if (input.once('camLeft')) cam.nudgeYaw(Math.PI / 8);
  if (input.once('camRight')) cam.nudgeYaw(-Math.PI / 8);
  if (input.once('camReset')) cam.resetYaw();

  if (input.once('action')) {
    if (hud.open) {
      hud.advance();
      if (!hud.open) game.talking = null;
    } else {
      const it = findInteraction();
      if (it) {
        game.talking = it;
        if (it.actor) {
          it.actor.facePoint(player.pos.x, player.pos.z);
          it.actor.target = null;
        }
        audio.sfx('select');
        hud.say(it.lines, it.name);
      }
    }
  }
  if (input.once('cancel') && hud.open) {
    hud.close();
    game.talking = null;
    audio.sfx('cancel');
  }

  // --- player movement ---------------------------------------------------
  const frozen = hud.open || game.transition > 0;
  let moved = 0;
  if (!frozen) {
    const axis = input.readAxis();
    if (axis.lengthSq() > 0.02) {
      const speed = input.held('run') ? RUN_SPEED : WALK_SPEED;
      const fwd = cam.forward(new THREE.Vector3()).multiplyScalar(axis.y);
      const rgt = cam.right(new THREE.Vector3()).multiplyScalar(axis.x);
      const dir = fwd.add(rgt);
      if (dir.lengthSq() > 1) dir.normalize();
      const vx = dir.x * speed * dt;
      const vz = dir.z * speed * dt;
      const res = moveActor(zone.ground, zone.solids, player.pos.x, player.pos.z, player.pos.y,
        vx, vz, player.radius, 0.62, blockersFor(zone, player));
      moved = Math.hypot(res.x - player.pos.x, res.z - player.pos.z);
      if (res.blocked && moved < 0.001) {
        game.bumpAcc = (game.bumpAcc ?? 0) - dt;
        if (game.bumpAcc <= 0) { audio.sfx('bump'); game.bumpAcc = 0.4; }
      }
      player.pos.set(res.x, res.y, res.z);
      player.face(vx, vz);
      player.syncTransform();
    }
  }
  player.animate(moved, dt, game.t);

  // footsteps, keyed to the surface underfoot
  if (moved > 0) {
    game.stepAcc += moved;
    if (game.stepAcc > 1.24) {
      game.stepAcc = 0;
      const s = zone.surfaceAt(player.pos.x, player.pos.z);
      audio.sfx(s === 'grass' ? 'stepGrass' : s === 'wood' ? 'stepWood' : 'step');
    }
  }

  // --- doors -------------------------------------------------------------
  game.doorCooldown = Math.max(0, game.doorCooldown - dt);
  let nearDoor = null;
  for (const d of zone.doors) {
    if (Math.abs((d.y ?? 0) - player.pos.y) > 2.0) continue;
    const dx = d.x - player.pos.x;
    const dz = d.z - player.pos.z;
    const inside = dx * dx + dz * dz < (d.r ?? 1.2) ** 2;
    if (game.suppressed?.has(d)) {
      if (!inside) game.suppressed.delete(d);   // stepped clear; it's armed again
      continue;
    }
    if (inside) { nearDoor = d; break; }
  }
  if (nearDoor && !frozen && game.doorCooldown <= 0) beginTransition(nearDoor);

  // --- prompts -----------------------------------------------------------
  if (!hud.open) {
    if (nearDoor) hud.hint(`${nearDoor.label ?? 'DOOR'}`);
    else {
      const it = findInteraction();
      const key = input.touch ? 'A' : 'SPACE';
      hud.hint(it ? `<b>${key}</b> ${it.kind === 'npc' ? 'talk' : 'look'}` : '');
    }
  } else hud.hint('');

  // --- world -------------------------------------------------------------
  updateNpcs(zone, dt);
  zone.update(dt, game.t);
  if (zone.light) zone.light.follow(player.pos);

  cam.update(dt, player.pos, zone.occluders);
  hud.update(dt);
  renderer.render(zone.scene, cam.camera);
  renderer.adapt(dt);
  input.endFrame();
}

// --- boot ------------------------------------------------------------------

window.addEventListener('resize', () => {
  renderer.resize();
  cam.resize(renderer.aspect);
});

function start() {
  if (started) return;
  started = true;
  try {
    // Audio must be created inside the gesture or mobile browsers keep it muted.
    audio.init();
    const titleEl = document.getElementById('title');
    titleEl.classList.add('gone');
    setTimeout(() => titleEl.classList.add('hidden'), 460);
    setTime(timeName);
    enterZone('onett', 'start', { silent: true });
    if (input.touch) {
      document.getElementById('touch')?.classList.remove('hidden');
      maybeSuggestLandscape();
    }
    running = true;
    last = performance.now();
    audio.playMusic('town');
  } catch (err) {
    started = false;
    fatal(err, 'The town failed to build. Please report this along with your browser and device.');
  }
}

initTouchControls(input, {
  camLeft: () => cam.nudgeYaw(Math.PI / 8),
  camRight: () => cam.nudgeYaw(-Math.PI / 8),
});

/** Portrait works, but landscape shows about twice as much town. Say so once. */
function maybeSuggestLandscape() {
  if (window.innerWidth >= window.innerHeight) return;
  const el = document.getElementById('rotate');
  if (!el) return;
  el.classList.remove('hidden', 'fading');
  setTimeout(() => el.classList.add('fading'), 4200);
  setTimeout(() => el.classList.add('hidden'), 4800);
}

// Click covers every platform, but bind pointerdown too: some mobile browsers
// swallow the click when a touch handler runs first. start() is idempotent.
const startBtn = document.getElementById('start');
startBtn.addEventListener('click', start);
startBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
startBtn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });

window.addEventListener('keydown', (e) => {
  if (!running && (e.code === 'Space' || e.code === 'Enter')) start();
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'KeyT') {
    setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeName) + 1) % TIME_ORDER.length]);
  }
});

// Build the town up front so the first frame after START is instant. Wrapped,
// because a failure here is exactly the kind that used to be invisible.
try {
  getZone('onett');
} catch (err) {
  fatal(err, 'The town failed to build. Please report this along with your browser and device.');
  throw err;
}
requestAnimationFrame(frame);

// expose a little for screenshot tooling / debugging
window.__game = {
  game, player, cam, renderer, zones, enterZone, start, WALK_SPEED, RUN_SPEED,
  setTime, get timeName() { return timeName; },
};
