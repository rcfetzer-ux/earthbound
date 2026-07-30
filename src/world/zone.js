/**
 * Zone scaffolding — the shared skeleton every place in town is built on:
 * a scene, its lighting, its sky, plus the walkable ground, solids and door
 * triggers the player logic reads.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { P } from '../core/palette.js';
import { T, repeated, rng } from '../core/tex.js';
import { Ground, Solids } from './collision.js';
import { timePreset, sunVector, DEFAULT_TIME } from './daylight.js';

export class Zone {
  constructor(name, label) {
    this.name = name;
    this.label = label ?? name;
    this.scene = new THREE.Scene();
    this.ground = new Ground();
    this.solids = new Solids();
    this.doors = [];
    this.npcs = [];
    this.spawns = {};
    this.interactables = [];
    this.updaters = [];
    /** Paved patches, so footsteps can pick the right sound. */
    this.surfaces = [];
    this.interior = false;
    this.music = 'town';
    this.tint = 0xffffff;
  }

  addSpawn(key, x, z, y, dir = 'down') {
    this.spawns[key] = { x, z, y, dir };
    return this;
  }

  onUpdate(fn) { this.updaters.push(fn); return this; }

  update(dt, t) { for (const f of this.updaters) f(dt, t); }

  /** What is underfoot at this point: 'grass' unless a paved patch covers it. */
  surfaceAt(x, z) {
    for (let i = this.surfaces.length - 1; i >= 0; i--) {
      const s = this.surfaces[i];
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.type;
    }
    return this.interior ? 'wood' : 'grass';
  }
}

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
varying vec3 vWorld;
void main() {
  float h = normalize(vWorld).y;
  vec3 c = mix(uHorizon, uMid, clamp(h * 2.6, 0.0, 1.0));
  c = mix(c, uTop, clamp((h - 0.35) * 1.6, 0.0, 1.0));
  // banded, like a 16-bit gradient
  c = floor(c * 24.0 + 0.5) / 24.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export function addSky(scene, preset = timePreset(DEFAULT_TIME)) {
  const geo = new THREE.SphereGeometry(300, 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(preset.sky.top) },
      uMid: { value: new THREE.Color(preset.sky.mid) },
      uHorizon: { value: new THREE.Color(preset.sky.horizon) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.userData.dynamic = true;
  scene.add(sky);
  sky.applyTime = (p) => {
    mat.uniforms.uTop.value.set(p.sky.top);
    mat.uniforms.uMid.value.set(p.sky.mid);
    mat.uniforms.uHorizon.value.set(p.sky.horizon);
  };
  return sky;
}

/**
 * Clouds: pixel-art billboards parked high on the sky dome, drifting slowly and
 * always turned toward the middle of town. Flat cut-out shapes read far more
 * like the original's skies than any amount of 3D geometry would.
 */
export function addClouds(scene, seed = 7, preset = timePreset(DEFAULT_TIME)) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const tex = T.cloud();
  const tint = new THREE.Color(preset.cloudTint);
  for (let i = 0; i < 18; i++) {
    const w = 46 + rand() * 44;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.5),
      new THREE.MeshBasicMaterial({
        map: tex, color: tint, transparent: true, opacity: 0.94, depthWrite: false, fog: false,
      }),
    );
    const a = (i / 18) * Math.PI * 2 + rand() * 0.3;
    const d = 210 + rand() * 60;
    m.position.set(Math.cos(a) * d, 58 + rand() * 60, Math.sin(a) * d);
    m.lookAt(0, m.position.y * 0.55, 0);
    m.userData.dynamic = true;
    m.userData.drift = 0.5 + rand() * 0.9;
    m.userData.angle = a;
    m.userData.dist = d;
    m.renderOrder = -1;
    group.add(m);
  }
  scene.add(group);
  return {
    group,
    applyTime(p) {
      for (const c of group.children) c.material.color.set(p.cloudTint);
    },
    update(dt) {
      for (const c of group.children) {
        // drift around the dome so they never leave the sky
        c.userData.angle += (c.userData.drift * dt) / c.userData.dist;
        const d = c.userData.dist;
        c.position.x = Math.cos(c.userData.angle) * d;
        c.position.z = Math.sin(c.userData.angle) * d;
        c.lookAt(0, c.position.y * 0.55, 0);
      }
    },
  };
}

/**
 * Outdoor lighting: broad hemisphere fill plus one hard sun whose shadow
 * frustum follows the player so shadow texels stay big and crunchy.
 */
export function addOutdoorLight(scene, preset = timePreset(DEFAULT_TIME)) {
  // The hemisphere light is the cool half of the warm/cool contrast: it fills
  // the shadows with sky colour instead of just darkening them.
  const hemi = new THREE.HemisphereLight(preset.hemi.sky, preset.hemi.ground, preset.hemi.intensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(preset.sun.color, preset.sun.intensity);
  let offset = sunVector(preset);
  sun.position.copy(offset);
  sun.castShadow = true;
  // 1024 over a 60-unit frustum is ~17 texels per world unit: crisp enough for
  // hard-edged shadows, and a quarter of the fill of a 2048 map.
  sun.shadow.mapSize.set(1024, 1024);
  const s = 30;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const amb = new THREE.AmbientLight(preset.ambient.color, preset.ambient.intensity);
  scene.add(amb);

  return {
    sun, hemi, amb,
    follow(p) {
      sun.target.position.set(p.x, p.y, p.z);
      sun.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
      sun.target.updateMatrixWorld();
    },
    applyTime(p) {
      hemi.color.set(p.hemi.sky);
      hemi.groundColor.set(p.hemi.ground);
      hemi.intensity = p.hemi.intensity;
      sun.color.set(p.sun.color);
      sun.intensity = p.sun.intensity;
      amb.color.set(p.ambient.color);
      amb.intensity = p.ambient.intensity;
      offset = sunVector(p);
    },
  };
}

export function addIndoorLight(scene, { color = 0xffe8c0, intensity = 0.95, sky = 0xdfe8f8 } = {}) {
  const hemi = new THREE.HemisphereLight(sky, 0x604838, 0.75);
  scene.add(hemi);
  const lamp = new THREE.DirectionalLight(color, intensity);
  lamp.position.set(6, 14, 8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  const s = 16;
  lamp.shadow.camera.left = -s;
  lamp.shadow.camera.right = s;
  lamp.shadow.camera.top = s;
  lamp.shadow.camera.bottom = -s;
  lamp.shadow.camera.far = 60;
  lamp.shadow.bias = -0.0016;
  lamp.shadow.normalBias = 0.03;
  scene.add(lamp);
  scene.add(new THREE.AmbientLight(0xffffff, 0.34));
  return { lamp, hemi };
}

/**
 * A terrace: a slab of land with a grass top and rocky sides, plus the matching
 * walkable platform. Returns the mesh so callers can tweak it.
 */
export function terrace(zone, x0, z0, x1, z1, y, depth = 6, { walk = true, topTex = null } = {}) {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const top = topTex ?? repeated(T.grass(), w / 7, d / 7);
  const side = repeated(T.cliff(), w / 5, depth / 5);
  const sideZ = repeated(T.cliff(), d / 5, depth / 5);
  const mats = [
    new THREE.MeshLambertMaterial({ map: sideZ }), // +x
    new THREE.MeshLambertMaterial({ map: sideZ }), // -x
    new THREE.MeshLambertMaterial({ map: top }),   // +y
    new THREE.MeshLambertMaterial({ color: 0x2a2028 }), // -y
    new THREE.MeshLambertMaterial({ map: side }),  // +z
    new THREE.MeshLambertMaterial({ map: side }),  // -z
  ];
  // The rock body sits slightly below the finished level; the cap above it
  // carries the grass and overhangs a little, so the edge reads as turf on rock
  // instead of a repeating stripe in the cliff texture.
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), mats);
  m.position.set(cx, y - 0.34 - depth / 2, cz);
  m.receiveShadow = true;
  m.castShadow = true;
  zone.scene.add(m);

  const capSide = new THREE.MeshLambertMaterial({ color: 0x3d8420 });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.34, d + 0.7), [
    capSide, capSide,
    new THREE.MeshLambertMaterial({ map: top }),
    new THREE.MeshLambertMaterial({ color: 0x2a2028 }),
    capSide, capSide,
  ]);
  cap.position.set(cx, y - 0.17, cz);
  cap.receiveShadow = true;
  cap.castShadow = true;
  zone.scene.add(cap);

  if (walk) zone.ground.flat(x0, z0, x1, z1, y);
  return m;
}

/** Flat paved surface laid just above the ground (roads, sidewalks, plazas). */
export function pave(zone, x0, z0, x1, z1, y, tex, tileSize = 7, type = 'stone', lift = 0.03) {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  zone.surfaces.push({
    x0: Math.min(x0, x1), x1: Math.max(x0, x1),
    z0: Math.min(z0, z1), z1: Math.max(z0, z1), type,
  });
  const map = repeated(tex, w / tileSize, d / tileSize);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y + lift, (z0 + z1) / 2);
  m.receiveShadow = true;
  zone.scene.add(m);
  return m;
}

/** Kerb: the little concrete lip between road and sidewalk. */
export function kerb(zone, x0, z0, x1, z1, y, h = 0.16) {
  const w = Math.abs(x1 - x0) || 0.3;
  const d = Math.abs(z1 - z0) || 0.3;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ map: repeated(T.concrete(), Math.max(1, w / 3), Math.max(1, d / 3)) }),
  );
  m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  zone.scene.add(m);
  return m;
}

/**
 * Stairs: stepped geometry for the eye, a smooth ramp for the collision.
 *
 * `yMin` / `yMax` are the heights at the low- and high-coordinate edges of the
 * footprint along `axis` — so a flight that climbs northward passes the larger
 * height as `yMin` (north is −Z).
 */
export function stairs(zone, x0, z0, x1, z1, yMin, yMax, axis = 'z', opts = {}) {
  const { steps = 8, rail = true, tex = null } = opts;
  const ax0 = Math.min(x0, x1);
  const ax1 = Math.max(x0, x1);
  const az0 = Math.min(z0, z1);
  const az1 = Math.max(z0, z1);
  const w = ax1 - ax0;
  const d = az1 - az0;
  const span = axis === 'z' ? d : w;
  const stepSpan = span / steps;
  const base = Math.min(yMin, yMax) - 0.4;
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ map: tex ?? repeated(T.concrete(), 2, 1) });

  for (let i = 0; i < steps; i++) {
    // height at the far edge of this step, so the tread lines up with the ramp
    const t = (i + 1) / steps;
    const top = yMin + (yMax - yMin) * t;
    const h = top - base;
    const sm = new THREE.Mesh(
      axis === 'z' ? new THREE.BoxGeometry(w, h, stepSpan) : new THREE.BoxGeometry(stepSpan, h, d),
      m,
    );
    const cx = axis === 'z' ? (ax0 + ax1) / 2 : ax0 + stepSpan * (i + 0.5);
    const cz = axis === 'z' ? az0 + stepSpan * (i + 0.5) : (az0 + az1) / 2;
    sm.position.set(cx, base + h / 2, cz);
    sm.receiveShadow = true;
    sm.castShadow = true;
    g.add(sm);
  }

  if (rail) {
    const railMat = new THREE.MeshLambertMaterial({ color: 0xc8c2b2 });
    const rise = yMax - yMin;
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(
        axis === 'z' ? new THREE.BoxGeometry(0.34, 0.42, Math.hypot(d, rise)) : new THREE.BoxGeometry(Math.hypot(w, rise), 0.42, 0.34),
        railMat,
      );
      if (axis === 'z') {
        r.position.set((ax0 + ax1) / 2 + s * (w / 2 + 0.17), (yMin + yMax) / 2 + 0.55, (az0 + az1) / 2);
        r.rotation.x = -Math.atan2(rise, d);
      } else {
        r.position.set((ax0 + ax1) / 2, (yMin + yMax) / 2 + 0.55, (az0 + az1) / 2 + s * (d / 2 + 0.17));
        r.rotation.z = Math.atan2(rise, w);
      }
      r.castShadow = true;
      g.add(r);
    }
  }

  zone.scene.add(g);
  zone.ground.ramp(ax0, az0, ax1, az1, yMin, yMax, axis, 'stairs');
  return g;
}

/**
 * Distant scenery ring: layered hills and a treeline that sit outside the
 * playable area so the horizon never looks empty.
 */
export function addBackdrop(scene, { radius = 150, seed = 3 } = {}) {
  const rand = rng(seed);
  const g = new THREE.Group();

  const hillMat = new THREE.MeshLambertMaterial({ color: 0x7fb864, fog: true });
  const farMat = new THREE.MeshLambertMaterial({ color: 0x8fc4a8, fog: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const far = i % 2 === 0;
    const d = radius + (far ? 55 : 18) + rand() * 25;
    const r = 22 + rand() * 30;
    const h = 12 + rand() * 26;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), far ? farMat : hillMat);
    cone.position.set(Math.cos(a) * d, h * 0.32 - 6, Math.sin(a) * d);
    g.add(cone);
  }

  // treeline: cheap cones hugging the play area boundary
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x3c8a34 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4526 });
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2;
    const d = radius * (0.92 + rand() * 0.34);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.95;
    const s = 0.8 + rand() * 0.8;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 2.4 * s, 5), trunkMat);
    t.position.set(x, 1.2 * s, z);
    g.add(t);
    const c = new THREE.Mesh(new THREE.SphereGeometry(2.1 * s, 7, 5), treeMat);
    c.position.set(x, 3.6 * s, z);
    g.add(c);
  }
  scene.add(g);
  return g;
}

/**
 * Bake static geometry.
 *
 * A town assembled from little primitives ends up with well over a thousand
 * meshes, and the draw calls — doubled by the shadow pass — dominate the frame.
 * Nothing in that pile moves, so once a zone is built we merge every static
 * mesh that shares a material into a single buffer per material.
 *
 * Anything that animates (sprites, clouds, smoke, glowing bulbs) is marked
 * `userData.dynamic` and left alone.
 */
export function bakeStatic(scene) {
  scene.updateMatrixWorld(true);

  const buckets = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.dynamic) return;
    if (Array.isArray(o.material)) return;          // multi-material: leave be
    const m = o.material;
    if (!m || m.isShaderMaterial) return;           // sky, post-process quads
    if (m.transparent) return;                      // needs per-mesh sorting
    const g = o.geometry;
    const a = g?.attributes;
    if (!a?.position || !a.normal || !a.uv) return;
    const key = `${m.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: m, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, meshes: [] };
      buckets.set(key, b);
    }
    b.meshes.push(o);
  });

  let mergedMeshes = 0;
  let removed = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 4) continue;              // not worth a merge
    const geos = [];
    for (const o of b.meshes) {
      // Non-indexed everywhere so indexed and non-indexed sources can mix, and
      // trimmed to the three attributes every source has.
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      }
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    }
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.renderOrder = b.order;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'baked';
    scene.add(mesh);
    mergedMeshes++;
    for (const o of b.meshes) {
      o.removeFromParent();
      o.geometry.dispose();
      removed++;
    }
  }

  // Anything big and solid is worth testing the camera against.
  scene.traverse((o) => {
    if (o.isMesh && (o.name === 'baked' || Array.isArray(o.material))) o.userData.occluder = true;
  });

  // Drop groups left empty by the merge so traversal stays cheap.
  const empties = [];
  scene.traverse((o) => {
    if (o !== scene && o.isGroup && o.children.length === 0) empties.push(o);
  });
  for (const e of empties) e.removeFromParent();

  const occluders = [];
  scene.traverse((o) => { if (o.userData.occluder) occluders.push(o); });
  return { batches: mergedMeshes, absorbed: removed, occluders };
}
