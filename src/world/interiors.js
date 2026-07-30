/**
 * Interiors.
 *
 * Rooms are built as a floor plus four *inward-facing* wall planes. Because a
 * plane is only drawn from its front, whichever wall stands between the camera
 * and the room is culled automatically — you get the classic cutaway view of a
 * top-down RPG house for free, with no wall-fading logic at all.
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';
import { T, repeated, signTexture } from '../core/tex.js';
import { Zone, addIndoorLight } from './zone.js';
import { box, flatMat, mat, decal } from './build.js';
import { Actor } from '../entities/actor.js';

// --- room shell ------------------------------------------------------------

/**
 * @param {Zone} zone
 * @param {Object} o
 * @param {number} o.w room width (x), {number} o.d depth (z), {number} o.h wall height
 * @param {THREE.Texture} o.floor
 * @param {THREE.Texture} o.wall
 * @param {string} [o.skirt] baseboard colour
 */
function shell(zone, o) {
  const { w, d, h = 5.2, floor, wall, skirt = '#e8e0d0', wallTint = 0xffffff } = o;
  const S = zone.scene;
  const hw = w / 2;
  const hd = d / 2;

  const f = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: repeated(floor, w / 4, d / 4) }),
  );
  f.rotation.x = -Math.PI / 2;
  f.receiveShadow = true;
  S.add(f);

  const wallMat = new THREE.MeshLambertMaterial({
    map: repeated(wall, w / 3.2, h / 3.2), color: wallTint, side: THREE.FrontSide,
  });
  const wallMatZ = new THREE.MeshLambertMaterial({
    map: repeated(wall, d / 3.2, h / 3.2), color: wallTint, side: THREE.FrontSide,
  });

  const mkWall = (width, material, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), material);
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    S.add(m);
    return m;
  };
  mkWall(w, wallMat, 0, -hd, 0);            // north, faces +z
  mkWall(w, wallMat, 0, hd, Math.PI);       // south, faces -z
  mkWall(d, wallMatZ, -hw, 0, Math.PI / 2); // west, faces +x
  mkWall(d, wallMatZ, hw, 0, -Math.PI / 2); // east, faces -x

  // Baseboards, drawn as thin boxes so the floor/wall junction has a line.
  const sk = flatMat(skirt);
  S.add(box(w, 0.28, 0.14, sk, 0, 0, -hd + 0.07));
  S.add(box(w, 0.28, 0.14, sk, 0, 0, hd - 0.07));
  S.add(box(0.14, 0.28, d, sk, -hw + 0.07, 0, 0));
  S.add(box(0.14, 0.28, d, sk, hw - 0.07, 0, 0));

  // walkable floor + wall collision
  zone.ground.flat(-hw + 0.4, -hd + 0.4, hw - 0.4, hd - 0.4, 0);
  zone.solids.bounds(-hw - 2, -hd - 2, hw + 2, -hd + 0.35, 'wall');
  zone.solids.bounds(-hw - 2, hd - 0.35, hw + 2, hd + 2, 'wall');
  zone.solids.bounds(-hw - 2, -hd - 2, -hw + 0.35, hd + 2, 'wall');
  zone.solids.bounds(hw - 0.35, -hd - 2, hw + 2, hd + 2, 'wall');

  return { hw, hd };
}

/**
 * Interior door: the leaf and its frame are single-sided quads facing the same
 * way as the wall they sit on, so they get culled along with it. A mat on the
 * floor stays visible and marks the way out even when the wall is cut away.
 */
function doorway(zone, { x = 0, z = 0, side = 'south', target, spawn, label, kind = 'wood', exit = true }) {
  const S = zone.scene;
  const g = new THREE.Group();
  const ry = { south: Math.PI, north: 0, east: -Math.PI / 2, west: Math.PI / 2 }[side];
  const map = kind === 'glass' ? T.glassDoor() : T.door(P.wood);
  g.add(decal(1.6, 2.5, new THREE.MeshLambertMaterial({ map }), { y: 1.25, z: 0.06 }));
  const fm = new THREE.MeshLambertMaterial({ color: P.wallWhite });
  g.add(decal(0.24, 2.8, fm, { x: -0.92, y: 1.4, z: 0.07 }));
  g.add(decal(0.24, 2.8, fm, { x: 0.92, y: 1.4, z: 0.07 }));
  g.add(decal(2.08, 0.24, fm, { x: 0, y: 2.68, z: 0.07 }));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  S.add(g);

  // doormat, so the exit is legible from any camera angle
  const inward = { south: [0, -1], north: [0, 1], east: [-1, 0], west: [1, 0] }[side];
  const mat2 = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.2),
    new THREE.MeshLambertMaterial({ map: repeated(T.carpet('#8a6a4a', 'mat'), 1, 1) }),
  );
  mat2.rotation.x = -Math.PI / 2;
  mat2.rotation.z = (side === 'east' || side === 'west') ? Math.PI / 2 : 0;
  mat2.position.set(x + inward[0] * 1.0, 0.03, z + inward[1] * 1.0);
  mat2.receiveShadow = true;
  S.add(mat2);
  if (exit) {
    zone.doors.push({
      x: x + (side === 'south' ? 0 : side === 'north' ? 0 : side === 'east' ? -0.6 : 0.6),
      z: z + (side === 'south' ? -0.7 : side === 'north' ? 0.7 : 0),
      y: 0, r: 1.25, target, spawn, label, sound: kind === 'glass' ? 'doorGlass' : 'door',
    });
  }
  return g;
}

/** Interior window: a bright pane that hints at the world outside. */
function interiorWindow(zone, x, z, side, { y = 2.0, w = 1.8, h = 1.5, night = false } = {}) {
  const ry = { south: Math.PI, north: 0, east: -Math.PI / 2, west: Math.PI / 2 }[side];
  const g = new THREE.Group();
  const glass = new THREE.MeshBasicMaterial({ color: night ? 0x2a3a6a : 0xcfeaf8 });
  g.add(decal(w, h, glass, { y, z: 0.05 }));
  // Frame, mullions and curtains are all single-sided quads on the wall plane,
  // so they vanish with the wall when the camera is on its outside.
  const fm = new THREE.MeshLambertMaterial({ color: P.wallWhite });
  g.add(decal(w + 0.5, 0.18, fm, { y: y - h / 2 - 0.09, z: 0.06 }));
  g.add(decal(w + 0.5, 0.18, fm, { y: y + h / 2 + 0.09, z: 0.06 }));
  g.add(decal(0.18, h + 0.36, fm, { x: -w / 2 - 0.09, y, z: 0.06 }));
  g.add(decal(0.18, h + 0.36, fm, { x: w / 2 + 0.09, y, z: 0.06 }));
  g.add(decal(0.12, h, fm, { y, z: 0.07 }));
  const curtain = new THREE.MeshLambertMaterial({ color: '#f0d8b8' });
  for (const s of [-1, 1]) {
    g.add(decal(0.55, h + 0.7, curtain, { x: s * (w / 2 + 0.1), y: y - 0.1, z: 0.08 }));
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  zone.scene.add(g);
  return g;
}

// --- furniture -------------------------------------------------------------

const woodMat = () => mat(repeated(T.planks(), 1.5, 1), 0xffffff);

function table(zone, x, z, w = 2.6, d = 1.6, h = 1.0, color = P.wood) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(w, 0.16, d, mat(repeated(T.planks(), w / 2, d / 2), 0xffffff), 0, h, 0));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.18, h, 0.18, flatMat(shade(color, -0.25)), lx * (w / 2 - 0.22), 0, lz * (d / 2 - 0.22)));
  }
  zone.solids.bounds(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'table');
  zone.scene.add(g);
  return g;
}

function chair(zone, x, z, ry = 0, color = P.wood) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const m = flatMat(color);
  g.add(box(0.8, 0.12, 0.8, m, 0, 0.6, 0));
  g.add(box(0.8, 0.9, 0.14, flatMat(shade(color, -0.12)), 0, 0.72, -0.33));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.12, 0.6, 0.12, flatMat(shade(color, -0.3)), lx * 0.31, 0, lz * 0.31));
  }
  zone.solids.circle(x, z, 0.48, 'chair');
  zone.scene.add(g);
  return g;
}

function sofa(zone, x, z, ry = 0, color = '#c86a5a') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const m = flatMat(color);
  const md = flatMat(shade(color, -0.18));
  g.add(box(3.4, 0.5, 1.5, md, 0, 0, 0));
  // two seat cushions, so the shape reads from any side
  for (const cx of [-0.8, 0.8]) {
    g.add(box(1.5, 0.34, 1.15, flatMat(shade(color, 0.14)), cx, 0.5, 0.12));
  }
  // back with a lighter top roll and a seam between the cushions
  g.add(box(3.4, 0.95, 0.42, m, 0, 0.5, -0.55));
  g.add(box(3.4, 0.2, 0.52, flatMat(shade(color, 0.2)), 0, 1.45, -0.55));
  g.add(box(0.1, 0.85, 0.42, md, 0, 0.5, -0.33));
  // arms, taller than the seat
  for (const s of [-1, 1]) {
    g.add(box(0.42, 0.8, 1.5, m, s * 1.5, 0.5, 0));
    g.add(box(0.5, 0.16, 1.6, flatMat(shade(color, 0.18)), s * 1.5, 1.3, 0));
  }
  zone.solids.bounds(x - 1.8, z - 0.85, x + 1.8, z + 0.85, 'sofa');
  zone.scene.add(g);
  return g;
}

/** TV with a flickering screen. */
function tv(zone, x, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(box(2.0, 1.5, 1.2, flatMat('#5a4a44'), 0, 0.5, 0));
  g.add(box(1.6, 0.5, 1.0, flatMat('#4a3a34'), 0, 0, 0));
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x88c0e0 });
  g.add(decal(1.5, 1.05, screenMat, { y: 1.22, z: 0.62 }));
  g.add(box(0.1, 0.9, 0.1, flatMat('#9aa0b0'), 0.5, 2.0, 0));
  g.add(box(0.1, 0.7, 0.1, flatMat('#9aa0b0'), -0.4, 2.0, 0));
  zone.solids.bounds(x - 1.05, z - 0.7, x + 1.05, z + 0.7, 'tv');
  zone.scene.add(g);
  zone.onUpdate((dt, t) => {
    const f = Math.sin(t * 9.3) * 0.5 + Math.sin(t * 21.7) * 0.5;
    screenMat.color.setRGB(0.45 + f * 0.12, 0.68 + f * 0.1, 0.86 + f * 0.08);
    void dt;
  });
  return g;
}

function bed(zone, x, z, ry = 0, quilt = '#d05868') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(box(2.1, 0.6, 4.0, woodMat(), 0, 0, 0));
  g.add(box(2.0, 0.35, 3.6, flatMat('#f4f0e4'), 0, 0.6, 0.1));
  g.add(box(2.05, 0.3, 2.4, flatMat(quilt), 0, 0.9, -0.6));
  g.add(box(1.5, 0.3, 0.7, flatMat('#ffffff'), 0, 0.95, 1.4));
  g.add(box(2.1, 1.2, 0.2, woodMat(), 0, 0.6, -2.0));
  g.add(box(2.1, 0.7, 0.2, woodMat(), 0, 0.6, 2.0));
  zone.solids.bounds(x - 1.1, z - 2.1, x + 1.1, z + 2.1, 'bed');
  zone.scene.add(g);
  return g;
}

function shelfUnit(zone, x, z, ry = 0, { w = 2.6, h = 3.0, goods = true } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const m = woodMat();
  g.add(box(w, h, 0.16, m, 0, 0, -0.42));
  g.add(box(0.16, h, 0.9, m, -w / 2, 0, 0));
  g.add(box(0.16, h, 0.9, m, w / 2, 0, 0));
  const shelves = 4;
  for (let i = 0; i < shelves; i++) {
    const sy = 0.5 + i * (h - 0.7) / shelves;
    g.add(box(w - 0.2, 0.12, 0.9, m, 0, sy, 0));
    if (goods) {
      const n = Math.floor(w / 0.36);
      for (let k = 0; k < n; k++) {
        const c = ['#e05858', '#58a0e0', '#f0c848', '#68c078', '#c888e0', '#f09048'][(i * 3 + k) % 6];
        g.add(box(0.26, 0.4, 0.26, flatMat(c), -w / 2 + 0.3 + k * 0.36, sy + 0.12, 0));
      }
    }
  }
  zone.solids.bounds(x - w / 2 - 0.1, z - 0.55, x + w / 2 + 0.1, z + 0.55, 'shelf');
  zone.scene.add(g);
  return g;
}

function counter(zone, x, z, w = 5.0, d = 1.2, color = P.woodDark) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(w, 1.15, d, flatMat(color), 0, 0, 0));
  g.add(box(w + 0.24, 0.16, d + 0.24, mat(repeated(T.planks(), w / 2, 1), 0xd8b088), 0, 1.15, 0));
  zone.solids.bounds(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'counter');
  zone.scene.add(g);
  return g;
}

function kitchenRun(zone, x, z, w = 6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const carcass = '#d8c8ae';
  const doorC = '#f2e8d2';
  g.add(box(w, 1.1, 1.2, flatMat(carcass), 0, 0, 0));
  // worktop, with a darker front edge
  g.add(box(w + 0.14, 0.16, 1.34, flatMat('#9a8f7c'), 0, 1.1, 0));
  g.add(box(w + 0.16, 0.07, 1.38, flatMat('#b5a993'), 0, 1.26, 0));
  // cupboard doors with handles
  const n = Math.max(1, Math.floor(w / 1.2));
  for (let i = 0; i < n; i++) {
    const dx = -w / 2 + (w / n) * (i + 0.5);
    g.add(box(w / n - 0.14, 0.82, 0.1, flatMat(doorC), dx, 0.16, 0.62));
    g.add(box(w / n - 0.3, 0.06, 0.12, flatMat('#a89880'), dx, 0.92, 0.64));
    g.add(box(0.28, 0.07, 0.14, flatMat('#8a8090'), dx + (w / n) * 0.25, 0.72, 0.66));
  }
  // sink and tap
  g.add(box(1.3, 0.12, 0.86, flatMat('#b7bcc6'), w / 2 - 1.3, 1.2, 0));
  g.add(box(1.1, 0.06, 0.7, flatMat('#8d949f'), w / 2 - 1.3, 1.26, 0));
  g.add(box(0.1, 0.55, 0.1, flatMat('#c8ccd4'), w / 2 - 1.3, 1.3, -0.42));
  g.add(box(0.1, 0.1, 0.3, flatMat('#c8ccd4'), w / 2 - 1.3, 1.8, -0.28));
  // upper cabinets, broken into doors so they don't read as one white slab
  for (let i = 0; i < n; i++) {
    const dx = -w / 2 + (w / n) * (i + 0.5);
    g.add(box(w / n - 0.1, 1.05, 0.72, flatMat(i % 2 ? doorC : shade(doorC, -0.06)), dx, 2.55, -0.25));
    g.add(box(0.3, 0.07, 0.14, flatMat('#8a8090'), dx, 2.75, 0.14));
  }
  g.add(box(w + 0.12, 0.12, 0.8, flatMat('#c0b39a'), 0, 3.6, -0.25));
  zone.solids.bounds(x - w / 2, z - 0.7, x + w / 2, z + 0.7, 'kitchen');
  zone.scene.add(g);
  return g;
}

function fridge(zone, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(1.5, 2.9, 1.3, flatMat('#f4f4ee'), 0, 0, 0));
  g.add(box(1.52, 0.1, 1.32, flatMat('#d8d8d0'), 0, 1.9, 0));
  g.add(box(0.1, 0.5, 0.1, flatMat('#b8b8b0'), 0.55, 1.2, 0.66));
  g.add(box(0.1, 0.4, 0.1, flatMat('#b8b8b0'), 0.55, 2.2, 0.66));
  zone.solids.bounds(x - 0.8, z - 0.7, x + 0.8, z + 0.7, 'fridge');
  zone.scene.add(g);
  return g;
}

function rug(zone, x, z, w = 5, d = 3.5, color = P.carpetRed) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: repeated(T.carpet(color, `rug${color}`), w / 2, d / 2) }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  zone.scene.add(m);
  return m;
}

function plant(zone, x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * scale, 0.32 * scale, 0.6 * scale, 8), flatMat('#b06a48'));
  pot.position.y = 0.3 * scale;
  pot.castShadow = true;
  g.add(pot);
  const leafMat = mat(repeated(T.leaves('#3f8f2f'), 1, 1), 0xffffff);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 * scale, 6, 5), leafMat);
    b.position.set(Math.cos(a) * 0.32 * scale, (0.9 + (i % 2) * 0.4) * scale, Math.sin(a) * 0.32 * scale);
    b.castShadow = true;
    g.add(b);
  }
  zone.solids.circle(x, z, 0.5 * scale, 'plant');
  zone.scene.add(g);
  return g;
}

function pictureFrame(zone, x, z, side, { y = 3.0, w = 1.4, h = 1.1, art = 'landscape' } = {}) {
  const ry = { south: Math.PI, north: 0, east: -Math.PI / 2, west: Math.PI / 2 }[side];
  const g = new THREE.Group();
  g.add(decal(w + 0.22, h + 0.22, new THREE.MeshLambertMaterial({ color: P.woodDark }), { y, z: 0.05 }));
  const colors = { landscape: '#8ec8e8', family: '#f0d8b8', abstract: '#c8a8e0' };
  g.add(decal(w, h, flatMat(colors[art] ?? '#8ec8e8'), { y, z: 0.07 }));
  if (art === 'landscape') {
    g.add(decal(w, h * 0.35, flatMat('#6fbe32'), { y: y - h * 0.32, z: 0.08 }));
    g.add(decal(0.35, 0.35, flatMat('#f8e070'), { x: w * 0.28, y: y + h * 0.25, z: 0.08 }));
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  zone.scene.add(g);
  return g;
}

/**
 * Interior stairs: geometry plus a trigger onto another floor.
 *
 * The flight climbs away from its approach side. `ry` turns the whole thing, and
 * the trigger and collider follow it, so a staircase can face into the room from
 * any wall without poking through it.
 */
function interiorStairs(zone, x, z, { target, spawn, label, ry = 0, steps = 7 }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const m = mat(repeated(T.planks(), 1.5, 1), 0xffffff);
  const tread = 0.55;
  for (let i = 0; i < steps; i++) {
    g.add(box(2.2, 0.32 * (i + 1), tread, m, 0, 0, -i * tread));
    // lighter nosing on each tread so the flight reads as steps, not a wedge
    g.add(box(2.3, 0.07, 0.1, flatMat(P.woodLight), 0, 0.32 * (i + 1), -i * tread + tread / 2));
  }
  g.add(box(0.16, 2.6, tread * steps, flatMat(P.woodDark), 1.18, 0.6, -(steps - 1) * tread / 2));
  zone.scene.add(g);

  // Footprint and trigger, rotated with the flight. The collider hugs the real
  // geometry — pad it and the trigger ends up somewhere you cannot stand.
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const nose = tread / 2;                       // front face of the bottom step
  const heel = -(steps - 1) * tread - tread / 2; // back of the top step
  const pts = [
    { x: x + s * nose, z: z + c * nose },
    { x: x + s * heel, z: z + c * heel },
  ];
  const halfW = 1.15;
  zone.solids.bounds(
    Math.min(pts[0].x, pts[1].x) - (c ? halfW : 0.1), Math.min(pts[0].z, pts[1].z) - (s ? halfW : 0.1),
    Math.max(pts[0].x, pts[1].x) + (c ? halfW : 0.1), Math.max(pts[0].z, pts[1].z) + (s ? halfW : 0.1),
    'stairs',
  );
  const reach = nose + 0.9;
  zone.doors.push({
    x: x + s * reach, z: z + c * reach, y: 0, r: 1.0, target, spawn, label, sound: 'stairs',
  });
  return g;
}

/** Arcade cabinet with a scrolling attract-mode screen. */
function arcadeCabinet(zone, x, z, ry = 0, hue = 0.6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const bodyColor = new THREE.Color().setHSL(hue, 0.5, 0.42).getHexString();
  const trimColor = new THREE.Color().setHSL(hue, 0.6, 0.62).getHexString();
  g.add(box(1.5, 2.6, 1.2, flatMat(`#${bodyColor}`), 0, 0, 0));
  // marquee across the top
  g.add(box(1.58, 0.6, 0.34, flatMat(`#${trimColor}`), 0, 2.35, 0.5));
  g.add(decal(1.3, 0.44, new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), { y: 2.62, z: 0.68 }));

  // Screen: recessed between the marquee and the control panel, tilted back so
  // a high camera can actually see it.
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const cctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  g.add(box(1.44, 1.0, 0.16, flatMat('#20202c'), 0, 1.45, 0.56));
  g.add(decal(1.2, 0.86, new THREE.MeshBasicMaterial({ map: tex }), { y: 1.98, z: 0.66, rx: -0.42 }));

  // control panel, jutting out at waist height
  g.add(box(1.45, 0.2, 0.62, flatMat('#2a2430'), 0, 1.2, 0.62));
  g.add(box(0.14, 0.26, 0.14, flatMat('#d04040'), -0.36, 1.4, 0.6));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.15, 0.09, 0.15, flatMat(['#f0d040', '#40d060', '#40a0f0'][i]), 0.02 + i * 0.26, 1.4, 0.6));
  }
  g.add(box(1.5, 0.22, 0.24, flatMat(`#${trimColor}`), 0, 0.02, 0.6));
  zone.solids.bounds(x - 0.8, z - 0.7, x + 0.8, z + 0.7, 'cabinet');
  zone.scene.add(g);

  let frame = 0;
  zone.onUpdate((dt, t) => {
    const f = Math.floor(t * 6);
    if (f === frame) return;
    frame = f;
    cctx.fillStyle = '#101828';
    cctx.fillRect(0, 0, 32, 32);
    // marching invaders / dodging blocks, per cabinet
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        cctx.fillStyle = ['#78e8a0', '#f0e070', '#f08890'][j];
        const ox = ((f + i) % 5) - 2;
        cctx.fillRect(2 + i * 5 + ox, 3 + j * 5, 3, 3);
      }
    }
    cctx.fillStyle = '#f8f8f8';
    cctx.fillRect(((f * 3) % 28), 26, 5, 2);
    cctx.fillStyle = '#f8e070';
    cctx.fillRect(((f * 3) % 28) + 2, 22 - (f % 4) * 3, 1, 2);
    tex.needsUpdate = true;
    void dt;
  });
  return g;
}

function receptionDesk(zone, x, z, w = 6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(w, 1.25, 1.4, flatMat('#8a6a4a'), 0, 0, 0));
  g.add(box(w + 0.3, 0.16, 1.7, mat(repeated(T.planks(), w / 2, 1), 0xd8b088), 0, 1.25, 0));
  g.add(box(0.5, 0.3, 0.4, flatMat('#3a3440'), w / 2 - 1, 1.4, 0)); // bell / register
  g.add(box(0.35, 0.12, 0.3, flatMat('#f0e0a0'), -w / 2 + 1, 1.4, 0)); // ledger
  zone.solids.bounds(x - w / 2, z - 0.85, x + w / 2, z + 0.85, 'desk');
  zone.scene.add(g);
  return g;
}

function hospitalBed(zone, x, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(box(1.9, 0.9, 3.6, flatMat('#dfe4ea'), 0, 0, 0));
  g.add(box(1.85, 0.3, 3.4, flatMat('#f8f8f4'), 0, 0.9, 0));
  g.add(box(1.9, 0.25, 1.6, flatMat('#b8d8e8'), 0, 1.15, -0.7));
  g.add(box(1.4, 0.25, 0.6, flatMat('#ffffff'), 0, 1.2, 1.3));
  g.add(box(1.9, 0.9, 0.14, flatMat('#c8ccd4'), 0, 0.9, -1.8));
  zone.solids.bounds(x - 1.0, z - 1.9, x + 1.0, z + 1.9, 'bed');
  zone.scene.add(g);
  return g;
}

function ceilingLamp(zone, x, z, { h = 6.4, color = 0xfff0c8 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(0.08, 0.7, 0.08, flatMat('#5a5060'), 0, h, 0));
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 0.6, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xf0e0c0, side: THREE.DoubleSide }),
  );
  shade.position.y = h - 0.05;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color }));
  bulb.position.y = h - 0.3;
  g.add(bulb);
  const light = new THREE.PointLight(color, 1.1, 16, 2);
  light.position.set(0, h - 0.4, 0);
  g.add(light);
  zone.scene.add(g);
  return g;
}

// --- the rooms -------------------------------------------------------------

function baseInterior(name, label, { floor, wall, wallTint, bg = 0x14101c, skirt } = {}) {
  const zone = new Zone(name, label);
  zone.interior = true;
  zone.music = 'home';
  zone.scene.background = new THREE.Color(bg);
  zone.scene.fog = null;
  addIndoorLight(zone.scene);
  void floor; void wall; void wallTint; void skirt;
  return zone;
}

/** Ness's house, ground floor. */
export function buildNessHouse() {
  const zone = baseInterior('nessHouse', 'HOME');
  shell(zone, {
    w: 17, d: 12, h: 7.2,
    floor: T.floorWood(), wall: T.wallpaper(P.wallpaperA, '#d8b88a', 'home'),
  });
  doorway(zone, { x: 1.5, z: 6, side: 'south', target: 'onett', spawn: 'front', label: 'ONETT' });
  interiorWindow(zone, -4.5, 6, 'south');
  interiorWindow(zone, -8.5, -3, 'west');
  interiorWindow(zone, 8.5, 2, 'east');

  // Living room, arranged along the west wall: sofa and television face each
  // other across the rug, so both are seen in profile from the camera.
  rug(zone, -4.4, 1.0, 7.4, 4.6, P.carpetRed);
  tv(zone, -7.3, 1.0, Math.PI / 2);       // screen looking east
  sofa(zone, -1.9, 1.0, -Math.PI / 2);    // seat looking west
  table(zone, -4.6, 1.0, 2.0, 1.4, 0.62);
  plant(zone, -7.6, 4.6);
  pictureFrame(zone, -4.5, -5.9, 'north', { art: 'family' });
  pictureFrame(zone, -8.4, 3.2, 'west', { art: 'landscape' });
  ceilingLamp(zone, -4.4, 1.0);

  // kitchen along the north wall
  kitchenRun(zone, 3.6, -5.1, 7);
  fridge(zone, 7.7, -4.6);
  table(zone, 3.4, -1.2, 3.0, 1.8, 1.0);
  chair(zone, 1.4, -1.2, Math.PI / 2);
  chair(zone, 5.4, -1.2, -Math.PI / 2);
  chair(zone, 3.4, -2.9, 0);
  ceilingLamp(zone, 3.4, -1.2);

  // stairs up to the bedroom
  interiorStairs(zone, 7.2, 3.9, { target: 'nessBedroom', spawn: 'stairs', label: 'UPSTAIRS', ry: 0 });

  zone.addSpawn('front', 1.5, 3.6, 0, 'up');
  zone.addSpawn('stairs', 5.4, 4.6, 0, 'down');

  const mom = new Actor('mom', { x: 6.2, y: 0, z: -2.0, speed: 1.4 });
  mom.lines = [
    'You are up! I thought that noise would wake you.',
    'Your friend from next door came knocking. Something about the hill.',
    'Be careful out there. And come home for dinner.',
  ];
  mom.home = new THREE.Vector3(6.2, 0, -2.0);
  mom.wanderRadius = 1.6;
  mom.dir = 'down';
  zone.npcs.push(mom);
  zone.scene.add(mom.group);

  const sis = new Actor('sister', { x: -6.0, y: 0, z: 4.2, speed: 1.6 });
  sis.lines = [
    'Did you see it? Did you SEE it?',
    'It went right over the house. I counted to three and then everything shook.',
  ];
  sis.home = new THREE.Vector3(-6.0, 0, 4.2);
  sis.wanderRadius = 1.2;
  zone.npcs.push(sis);
  zone.scene.add(sis.group);

  const dog = new Actor('dog', { x: -0.5, y: 0, z: 4.4, speed: 2.4, scale: 0.85 });
  dog.lines = ['Woof! Woof!'];
  dog.home = new THREE.Vector3(-0.5, 0, 4.4);
  dog.wanderRadius = 3.0;
  zone.npcs.push(dog);
  zone.scene.add(dog.group);

  zone.interactables.push({
    x: -7.3, z: 1.0, r: 2.1, name: 'tv',
    lines: ['The news is on. A reporter stands in front of the hill, squinting up at the dark.'],
  });
  return zone;
}

/** The bedroom upstairs. */
export function buildNessBedroom() {
  const zone = baseInterior('nessBedroom', 'MY ROOM');
  shell(zone, {
    w: 12, d: 10, h: 6.6,
    floor: T.floorWood(), wall: T.wallpaper('#cfe4f4', '#9ec4e0', 'room'),
  });
  interiorWindow(zone, 0, -5, 'north');
  interiorWindow(zone, 6, 1, 'east');

  bed(zone, -3.8, -1.6, 0, '#d05868');
  // bedside table with a lamp
  const bt = box(1.1, 1.0, 1.1, woodMat(), -3.8, 0, 1.4);
  zone.scene.add(bt);
  zone.solids.circle(-3.8, 1.4, 0.6, 'table');
  zone.scene.add(box(0.5, 0.6, 0.5, flatMat('#f0e0b0'), -3.8, 1.0, 1.4));

  // desk and chair
  const desk = box(3.0, 1.1, 1.4, woodMat(), 2.6, 0, -3.8);
  zone.scene.add(desk);
  zone.solids.bounds(1.1, -4.5, 4.1, -3.1, 'desk');
  chair(zone, 2.6, -2.1, Math.PI);
  zone.scene.add(box(0.9, 0.7, 0.6, flatMat('#c8ccd4'), 3.1, 1.1, -4.0));

  // bookshelf and toy box
  shelfUnit(zone, -4.4, -4.2, 0, { w: 2.4, h: 2.8, goods: true });
  // toy box, with a lid and a couple of handles
  zone.scene.add(box(2.0, 0.9, 1.2, flatMat('#e0a848'), -1.4, 0, 3.6));
  zone.scene.add(box(2.1, 0.16, 1.3, flatMat('#c88a30'), -1.4, 0.9, 3.6));
  zone.scene.add(box(0.4, 0.09, 0.14, flatMat('#8a5a20'), -1.4, 0.6, 4.24));
  zone.solids.bounds(-2.4, 3.0, -0.4, 4.2, 'toybox');
  rug(zone, -0.6, 0.4, 4, 3, P.carpetBlue);
  ceilingLamp(zone, 0, 0);

  interiorStairs(zone, 4.2, 2.6, { target: 'nessHouse', spawn: 'stairs', label: 'DOWNSTAIRS', ry: 0 });
  zone.addSpawn('stairs', 2.3, 3.6, 0, 'down');

  zone.interactables.push({
    x: -3.8, z: -1.6, r: 2.0, name: 'bed',
    lines: ['Your bed. Still warm.', 'Sleeping now would be a waste of a night like this one.'],
  });
  return zone;
}

/** The neighbours' house. */
export function buildNeighborHouse() {
  const zone = baseInterior('neighborHouse', "NEIGHBOUR'S HOUSE");
  shell(zone, {
    w: 16, d: 12, h: 7.2,
    floor: T.floorWood(), wall: T.wallpaper('#f0e0c8', '#c8a880', 'nb'),
  });
  doorway(zone, { x: 2, z: 6, side: 'south', target: 'onett', spawn: 'neighborHouse', label: 'ONETT' });
  interiorWindow(zone, -4, 6, 'south');
  interiorWindow(zone, -8, 0, 'west');

  rug(zone, -2.6, 1.2, 7.4, 4.6, '#a86a8a');
  tv(zone, -6.6, 1.2, Math.PI / 2);
  sofa(zone, -0.6, 1.2, -Math.PI / 2, '#8a6ab0');
  table(zone, -3.4, 1.2, 2.0, 1.4, 0.62);
  plant(zone, -6.8, 4.4, 1.1);
  plant(zone, 6.8, 4.4, 0.9);
  pictureFrame(zone, -4, -5.9, 'north', { art: 'abstract' });
  pictureFrame(zone, 4, -5.9, 'north', { art: 'landscape' });
  kitchenRun(zone, 5.6, -5.1, 5.5);
  fridge(zone, 1.4, -5.0);
  ceilingLamp(zone, 0, 0);
  ceilingLamp(zone, 5.5, -2);
  interiorStairs(zone, -6.4, 3.7, { target: null, spawn: null, label: 'UPSTAIRS', ry: 0 });

  zone.addSpawn('front', 2, 3.6, 0, 'up');

  const dad = new Actor('businessman', { x: -3.4, y: 0, z: -1.6, speed: 1.4 });
  dad.lines = [
    'A meteorite! On MY hill! Do you know what that thing is worth?',
    'I have already called three people about it. None of them called back.',
  ];
  dad.home = new THREE.Vector3(-3.4, 0, -1.6);
  dad.wanderRadius = 2.0;
  zone.npcs.push(dad);
  zone.scene.add(dad.group);

  const mum = new Actor('granny', { x: 4.6, y: 0, z: 1.2, speed: 1.2 });
  mum.lines = [
    'Have you seen my boys? They ran out the door without their coats.',
    'If you find them, send them home.',
  ];
  mum.home = new THREE.Vector3(4.6, 0, 1.2);
  mum.wanderRadius = 1.4;
  zone.npcs.push(mum);
  zone.scene.add(mum.group);
  return zone;
}

/** The drug store — the town's general shop. */
export function buildDrugstore() {
  const zone = baseInterior('drugstore', 'DRUG STORE', { bg: 0x101822 });
  zone.music = 'shop';
  shell(zone, {
    w: 17, d: 12, h: 7.2,
    floor: T.tileFloor(), wall: T.stucco('#e8f0f4', 'shopwall'), skirt: '#b8c0c8',
  });
  doorway(zone, { x: 0, z: 6, side: 'south', target: 'onett', spawn: 'drugstore', label: 'ONETT', kind: 'glass' });
  interiorWindow(zone, -5, 6, 'south', { y: 2.2, w: 2.6, h: 1.8 });
  interiorWindow(zone, 5, 6, 'south', { y: 2.2, w: 2.6, h: 1.8 });

  counter(zone, 3.0, -3.6, 7.0);
  shelfUnit(zone, -6.0, -4.2, 0, { w: 3.2 });
  shelfUnit(zone, -2.0, -4.2, 0, { w: 3.2 });
  shelfUnit(zone, -7.2, 0.5, Math.PI / 2, { w: 3.4 });
  shelfUnit(zone, -7.2, 4.2, Math.PI / 2, { w: 2.6 });
  shelfUnit(zone, 7.2, 1.0, -Math.PI / 2, { w: 4.0 });
  // Chilled cabinet: bottles on lit shelves behind glass.
  const cool = new THREE.Group();
  cool.position.set(4.0, 0, 4.6);
  cool.add(box(2.4, 2.8, 1.2, flatMat('#b9ccd6'), 0, 0, 0));
  cool.add(box(2.1, 2.1, 0.1, flatMat('#2a3a44'), 0, 0.5, 0.56));
  for (let row = 0; row < 3; row++) {
    cool.add(box(1.9, 0.08, 0.5, flatMat('#8fa4b0'), 0, 0.7 + row * 0.62, 0.34));
    for (let i = 0; i < 5; i++) {
      const c = ['#e05858', '#f0c848', '#68c078', '#58a0e0', '#c888e0'][(row * 2 + i) % 5];
      cool.add(box(0.24, 0.5, 0.24, flatMat(c), -0.8 + i * 0.4, 0.78 + row * 0.62, 0.34));
    }
  }
  // glass front, then a frame around it
  cool.add(decal(2.0, 2.1, new THREE.MeshBasicMaterial({
    color: 0xa8dcec, transparent: true, opacity: 0.42,
  }), { y: 1.6, z: 0.62 }));
  cool.add(box(2.4, 0.2, 0.3, flatMat('#dfe9ee'), 0, 2.6, 0.5));
  cool.add(decal(1.6, 0.4, new THREE.MeshBasicMaterial({
    map: signTexture('COLD', '#3a6a8a', '#ffffff', 48, 16),
  }), { y: 2.72, z: 0.66 }));
  zone.scene.add(cool);
  zone.solids.bounds(2.8, 4.0, 5.2, 5.2, 'cabinet');

  // a basket of odds and ends in the middle of the floor
  const basket = new THREE.Group();
  basket.position.set(-2.4, 0, 2.6);
  basket.add(box(1.8, 0.9, 1.4, flatMat('#a8845c'), 0, 0, 0));
  basket.add(box(1.9, 0.14, 1.5, flatMat('#8a6a4a'), 0, 0.9, 0));
  for (let i = 0; i < 6; i++) {
    basket.add(box(0.34, 0.3, 0.34, flatMat(['#e05858', '#f0c848', '#68c078', '#58a0e0'][i % 4]),
      -0.6 + (i % 3) * 0.6, 1.04, -0.3 + Math.floor(i / 3) * 0.6));
  }
  zone.scene.add(basket);
  zone.solids.bounds(-3.4, 1.9, -1.4, 3.3, 'basket');

  // register on the counter
  zone.scene.add(box(0.9, 0.7, 0.7, flatMat('#4a4a58'), 5.2, 1.15, -3.4));
  zone.scene.add(decal(0.7, 0.3, new THREE.MeshBasicMaterial({ color: 0x8fe0b0 }), { x: 5.2, y: 1.7, z: -3.04 }));
  // price sign
  const sign = decal(3.0, 0.8, new THREE.MeshLambertMaterial({
    map: signTexture('SALE!', '#f0e0a0', '#d04040', 60, 18),
  }), { x: 0, y: 4.0, z: -5.9 });
  zone.scene.add(sign);
  for (const x of [-5, 0, 5]) ceilingLamp(zone, x, 0, { h: 6.4 });

  zone.addSpawn('front', 0, 3.6, 0, 'up');

  const keeper = new Actor('shopkeeper', { x: 3.0, y: 0, z: -5.0, speed: 1.2 });
  keeper.lines = [
    'Welcome! Bandages, cola, umbrellas — if you need it, we have it.',
    'Busy since dawn. Everyone came in at once when that thing came down.',
  ];
  keeper.home = new THREE.Vector3(3.0, 0, -5.0);
  keeper.wanderRadius = 1.2;
  keeper.dir = 'down';
  zone.npcs.push(keeper);
  zone.scene.add(keeper.group);

  const shopper = new Actor('townswoman', { x: -5.0, y: 0, z: 1.6, speed: 1.6 });
  shopper.lines = ['I am buying every bandage in the shop. Just in case.'];
  shopper.home = new THREE.Vector3(-5.0, 0, 1.6);
  shopper.wanderRadius = 2.2;
  zone.npcs.push(shopper);
  zone.scene.add(shopper.group);
  return zone;
}

/** The arcade. */
export function buildArcade() {
  const zone = baseInterior('arcade', 'ARCADE', { bg: 0x0a0812 });
  zone.music = 'arcade';
  // Dim, but not so dim the cabinets read as blocks — the neon does the rest.
  zone.scene.children
    .filter((c) => c.isHemisphereLight || c.isDirectionalLight || c.isAmbientLight)
    .forEach((l) => { l.intensity *= 0.7; });
  shell(zone, {
    w: 18, d: 13, h: 7.2,
    floor: T.carpet('#5d3c86', 'arcadefloor'), wall: T.stucco('#4a3670', 'arcadewall'), skirt: '#32204e',
  });
  doorway(zone, { x: 0, z: 6.5, side: 'south', target: 'onett', spawn: 'arcade', label: 'ONETT', kind: 'glass' });

  // Two rows of cabinets, both turned toward the room so their screens show.
  [[-6.6, -4.2], [-3.6, -4.2], [-0.6, -4.2], [2.4, -4.2], [5.4, -4.2]]
    .forEach(([x, z], i) => arcadeCabinet(zone, x, z, 0, (i * 0.17) % 1));
  [[-6.6, 0.9], [-3.6, 0.9], [-0.6, 0.9]]
    .forEach(([x, z], i) => arcadeCabinet(zone, x, z, 0, 0.5 + i * 0.13));

  // Pinball table: legs, dark playfield with bumpers, lit backbox.
  const pin = new THREE.Group();
  pin.position.set(6.0, 0, 1.6);
  pin.rotation.y = -0.35;
  for (const [lx, lz] of [[-0.6, -1.3], [0.6, -1.3], [-0.6, 1.3], [0.6, 1.3]]) {
    pin.add(box(0.16, 0.95, 0.16, flatMat('#2a2434'), lx, 0, lz));
  }
  pin.add(box(1.6, 0.3, 3.0, flatMat('#b03050'), 0, 0.95, 0));
  const field = box(1.44, 0.1, 2.84, flatMat('#1e2a52'), 0, 1.25, 0);
  field.rotation.x = -0.07;
  pin.add(field);
  for (const [bx, bz, c] of [
    [-0.35, -0.7, '#f0d040'], [0.35, -0.55, '#e05070'], [0, 0.1, '#50c8d0'],
    [-0.45, 0.6, '#70d060'], [0.42, 0.75, '#f09040'],
  ]) pin.add(box(0.22, 0.14, 0.22, flatMat(c), bx, 1.3, bz));
  pin.add(box(1.6, 1.5, 0.22, flatMat('#3a2a5a'), 0, 1.25, -1.55));
  pin.add(decal(1.3, 1.1, new THREE.MeshBasicMaterial({ color: 0xf0a030 }), { y: 2.05, z: -1.42 }));
  zone.scene.add(pin);
  zone.solids.bounds(5.1, 0.0, 6.9, 3.2, 'pinball');
  // prize counter
  counter(zone, 7.0, -5.0, 3.4, 1.2, '#4a2a6a');
  shelfUnit(zone, 7.6, -3.0, -Math.PI / 2, { w: 3.0, h: 2.4 });

  // neon strips along the walls
  for (const [x, z, w, ry, c] of [
    [0, -6.4, 16, 0, 0xff4a9a], [-8.9, 0, 11, Math.PI / 2, 0x4ad0ff], [8.9, 0, 11, -Math.PI / 2, 0xffe04a],
  ]) {
    const strip = decal(w, 0.22, new THREE.MeshBasicMaterial({ color: c }), { x, y: 5.4, z, ry });
    zone.scene.add(strip);
    const l = new THREE.PointLight(c, 1.5, 22, 2);
    l.position.set(x * 0.6, 4.2, z * 0.6);
    zone.scene.add(l);
  }

  for (const x of [-6, 0, 6]) ceilingLamp(zone, x, -1.0, { h: 6.4, color: 0xd8c8ff });

  zone.addSpawn('front', 0, 4.1, 0, 'up');

  const punk = new Actor('punk', { x: 2.4, y: 0, z: -2.6, speed: 1.4 });
  punk.lines = [
    'Hey. This machine is MINE tonight.',
    '...Fine, you can have the one on the end. It eats quarters anyway.',
  ];
  punk.home = new THREE.Vector3(2.4, 0, -2.6);
  punk.wanderRadius = 1.2;
  punk.dir = 'up';
  zone.npcs.push(punk);
  zone.scene.add(punk.group);

  const kid = new Actor('neighborKidSmall', { x: -3.6, y: 0, z: -2.6, speed: 1.6 });
  kid.lines = ['One more game. I said that four games ago.'];
  kid.home = new THREE.Vector3(-3.6, 0, -2.6);
  kid.wanderRadius = 1.0;
  kid.dir = 'up';
  zone.npcs.push(kid);
  zone.scene.add(kid.group);
  return zone;
}

/** Hotel lobby. */
export function buildHotel() {
  const zone = baseInterior('hotel', 'HOTEL', { bg: 0x14101c });
  zone.music = 'hotel';
  shell(zone, {
    w: 18, d: 13, h: 7.6,
    floor: T.carpet('#8a4a4a', 'hotelfloor'), wall: T.wallpaper('#e8d8b8', '#c0a070', 'hotelwall'),
    skirt: '#8a6a4a',
  });
  doorway(zone, { x: 0, z: 6.5, side: 'south', target: 'onett', spawn: 'hotel', label: 'ONETT', kind: 'glass' });
  interiorWindow(zone, -5.5, 6.5, 'south', { y: 2.4, w: 2.4, h: 1.8 });
  interiorWindow(zone, 5.5, 6.5, 'south', { y: 2.4, w: 2.4, h: 1.8 });

  receptionDesk(zone, 0, -4.6, 7);
  // key pigeonholes behind the desk
  const holes = new THREE.Group();
  holes.position.set(0, 0, -6.2);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      holes.add(box(0.6, 0.5, 0.2, flatMat(j % 2 ? '#a8845c' : '#8a6a4a'), -1.6 + i * 0.8, 2.2 + j * 0.6, 0));
    }
  }
  zone.scene.add(holes);

  rug(zone, 0, 2.5, 8, 4.5, '#a8683a');
  sofa(zone, -4.5, 2.0, Math.PI / 2, '#9a6a4a');
  sofa(zone, 4.5, 2.0, -Math.PI / 2, '#9a6a4a');
  table(zone, 0, 2.2, 2.2, 1.6, 0.7);
  plant(zone, -7.6, -1.0, 1.3);
  plant(zone, 7.6, -1.0, 1.3);
  pictureFrame(zone, -6.5, -6.4, 'north', { art: 'landscape', w: 2.0, h: 1.5 });
  pictureFrame(zone, 6.5, -6.4, 'north', { art: 'abstract', w: 2.0, h: 1.5 });
  ceilingLamp(zone, -4, 0, { h: 6.8 });
  ceilingLamp(zone, 4, 0, { h: 6.8 });
  interiorStairs(zone, 7.4, 4.2, { target: null, label: 'ROOMS', ry: 0 });

  zone.addSpawn('front', 0, 4.1, 0, 'up');

  const clerk = new Actor('businessman', { x: 0, y: 0, z: -6.0, speed: 1.0 });
  clerk.lines = [
    'Good evening. One room, one night?',
    '...You are a bit young to be checking in alone. Come back with a grown-up.',
  ];
  clerk.home = new THREE.Vector3(0, 0, -6.0);
  clerk.wanderRadius = 0.8;
  clerk.dir = 'down';
  zone.npcs.push(clerk);
  zone.scene.add(clerk.group);

  const guest = new Actor('photographer', { x: -4.5, y: 0, z: 0.4, speed: 1.4 });
  guest.lines = [
    'I checked in for one night and stayed a week.',
    'The light here is wonderful. Especially now.',
  ];
  guest.home = new THREE.Vector3(-4.5, 0, 0.4);
  guest.wanderRadius = 1.8;
  zone.npcs.push(guest);
  zone.scene.add(guest.group);
  return zone;
}

/** Hospital lobby. */
export function buildHospital() {
  const zone = baseInterior('hospital', 'HOSPITAL', { bg: 0x101820 });
  zone.music = 'hospital';
  shell(zone, {
    w: 19, d: 13, h: 7.4,
    floor: T.tileFloor(), wall: T.stucco('#eaf2f6', 'hospwall'), skirt: '#b0c8d4',
  });
  doorway(zone, { x: 0, z: 6.5, side: 'south', target: 'onett', spawn: 'hospital', label: 'ONETT', kind: 'glass' });
  interiorWindow(zone, -6, 6.5, 'south', { y: 2.4, w: 2.4, h: 1.8 });
  interiorWindow(zone, 6, 6.5, 'south', { y: 2.4, w: 2.4, h: 1.8 });

  receptionDesk(zone, -5.5, -3.0, 6);
  hospitalBed(zone, 4.6, -2.6, 0);
  hospitalBed(zone, 7.8, -2.6, 0);
  // curtain rail between the beds
  zone.scene.add(box(0.1, 0.1, 4.0, flatMat('#c8ccd4'), 6.2, 3.4, -2.6));
  zone.scene.add(box(0.12, 2.4, 3.8, flatMat('#c8e0e8'), 6.2, 1.0, -2.6));
  zone.solids.bounds(6.05, -4.5, 6.35, -0.7, 'curtain');
  plant(zone, -8.4, -5.4, 1.2);
  plant(zone, 8.4, 4.4, 1.2);
  for (const [x, z] of [[-3.4, 3.4], [-0.9, 3.4], [1.6, 3.4]]) chair(zone, x, z, 0, '#c8ccd4');
  const notice = decal(3.2, 1.2, new THREE.MeshLambertMaterial({
    map: signTexture('QUIET', '#e8f0f4', '#4a7a9a', 84, 30),
  }), { x: -5.5, y: 4.0, z: -6.4 });
  zone.scene.add(notice);
  for (const x of [-6, 0, 6]) ceilingLamp(zone, x, 0, { h: 6.6, color: 0xeef6ff });

  zone.addSpawn('front', 0, 4.1, 0, 'up');

  const nurse = new Actor('nurse', { x: -5.5, y: 0, z: -0.8, speed: 1.2 });
  nurse.lines = [
    'Are you hurt? No? Good.',
    'Come straight here if you are. Any hour — someone is always awake.',
  ];
  nurse.home = new THREE.Vector3(-5.5, 0, -0.8);
  nurse.wanderRadius = 1.0;
  nurse.dir = 'down';
  zone.npcs.push(nurse);
  zone.scene.add(nurse.group);

  const patient = new Actor('townsman', { x: 2.4, y: 0, z: 1.0, speed: 1.4 });
  patient.lines = [
    'I ran out to look at the sky and walked straight into a lamp post.',
    'Worth it, honestly.',
  ];
  patient.home = new THREE.Vector3(2.4, 0, 1.0);
  patient.wanderRadius = 1.6;
  zone.npcs.push(patient);
  zone.scene.add(patient.group);
  return zone;
}

/** All interiors, by zone name. */
export const INTERIOR_BUILDERS = {
  nessHouse: buildNessHouse,
  nessBedroom: buildNessBedroom,
  neighborHouse: buildNeighborHouse,
  drugstore: buildDrugstore,
  arcade: buildArcade,
  hotel: buildHotel,
  hospital: buildHospital,
};
