/**
 * Game entry point: boots the renderer, builds Onett, and runs the loop.
 */
import * as THREE from 'three';
import { PixelRenderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { FollowCamera } from './core/camera.js';
import { AudioEngine } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { moveActor } from './world/collision.js';
import { buildOnett } from './world/onett.js';
import { bakeStatic } from './world/zone.js';
import { INTERIOR_BUILDERS } from './world/interiors.js';
import { Actor } from './entities/actor.js';

const canvas = document.getElementById('view');
const renderer = new PixelRenderer(canvas, { internalHeight: 336, levels: 30 });
const input = new Input();
const audio = new AudioEngine();
const hud = new HUD(audio);
const cam = new FollowCamera(renderer.aspect);

const WALK_SPEED = 4.4;
const RUN_SPEED = 7.4;

const zones = new Map();
function getZone(name) {
  if (zones.has(name)) return zones.get(name);
  const z = name === 'onett' ? buildOnett() : INTERIOR_BUILDERS[name]?.();
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
  player.dir = sp.dir ?? 'down';
  player.syncTransform();

  cam.setMode(zone.interior ? 'interior' : 'exterior');
  cam.resetYaw();
  cam.first = true;
  cam.update(0.016, player.pos, zone.occluders);

  // sprites pick up the room's ambience so nobody glows in a dark arcade
  const tint = zone.interior ? (zone.name === 'arcade' ? 0xc0b4d8 : 0xf4ead8) : 0xffffff;
  player.setTint(tint);
  for (const n of zone.npcs) n.setTint(tint);

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
  // The sprite's facing is screen-relative, so convert it back to world space.
  const yaw = cam.yaw;
  switch (player.dir) {
    case 'up': return _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    case 'down': return _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    case 'left': return _f.set(-Math.cos(yaw), 0, Math.sin(yaw));
    default: return _f.set(Math.cos(yaw), 0, -Math.sin(yaw));
  }
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
      n.animate(0, dt);
      n.billboard(cam.yaw);
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
        n.faceFromCamera(vx, vz, cam.yaw);
        n.syncTransform();
      }
    }
    n.animate(dist, dt);
    n.billboard(cam.yaw);
  }
}

// --- main loop -------------------------------------------------------------

let last = performance.now();
let running = false;

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
          // turn to face the player
          const dx = player.pos.x - it.actor.pos.x;
          const dz = player.pos.z - it.actor.pos.z;
          it.actor.faceFromCamera(dx, dz, cam.yaw);
          it.actor.setFrame(0, it.actor.dir);
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
      player.faceFromCamera(vx, vz, cam.yaw);
      player.syncTransform();
    }
  }
  player.animate(moved, dt);
  player.billboard(cam.yaw);

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
      hud.hint(it ? `<b>SPACE</b> ${it.kind === 'npc' ? 'talk' : 'look'}` : '');
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
  audio.init();
  const titleEl = document.getElementById('title');
  titleEl.classList.add('gone');
  setTimeout(() => titleEl.classList.add('hidden'), 460);
  enterZone('onett', 'start', { silent: true });
  running = true;
  last = performance.now();
  audio.playMusic('town');
}

document.getElementById('start').addEventListener('click', start);
window.addEventListener('keydown', (e) => {
  if (!running && (e.code === 'Space' || e.code === 'Enter')) start();
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
});

// Prebuild the town so the first frame after START is instant.
getZone('onett');
requestAnimationFrame(frame);

// expose a little for screenshot tooling / debugging
window.__game = { game, player, cam, renderer, zones, enterZone, start, WALK_SPEED, RUN_SPEED };
