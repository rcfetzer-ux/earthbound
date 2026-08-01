/**
 * The land Onett sits in.
 *
 * One height function for the whole outdoors. There are no terraces, no
 * stairs and no cliff seams anywhere in the map, because those seams were what
 * you could feel: hard straight edges cutting across the world at arbitrary
 * places, and boulders jutting out of them.
 *
 * The shape follows the town map:
 *
 *   plain    the town is dead flat — it is built on a grid and it should read
 *            that way — with a grassy fringe around it you can walk out onto
 *   rim      beyond that the ground lifts into wooded hills, steeper than the
 *            collider's slope limit, so what stops you is a hillside you can
 *            see rather than an edge you cannot
 *   gate     one gap in that rim to the south: the road out to Twoson
 *   valley   and one to the north-west: a floor that meanders between the hills
 *            as it climbs, out to where the meteorite came down
 *
 * The same expression drives the mesh you see and the height the collider
 * samples, so the shape of the ground and the shape of the walk are the same
 * thing by construction.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { T, repeated, rng } from '../core/tex.js';
import { P, shade } from '../core/palette.js';

/**
 * How the wooded rim around the town rises, and how the valley's flanks do.
 *
 * The steepest gradient a smoothstep of height H over run R reaches is
 * 1.5 H / R, and it has to comfortably clear the collider's slope limit or the
 * hills are a suggestion rather than a wall. Against that, the afternoon sun
 * sits at 30 degrees, so a slope of height H throws a shadow about 1.7 H long:
 * push these much higher and the valley floor lives in permanent darkness.
 */
const RIM = 17;
const RIM_RUN = 20;
const FLANK = 14;
const FLANK_RUN = 13;

/** How far out from the town you can still walk before the ground lifts. */
const FRINGE = 8;

const smoothstep = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * @param {Object} o
 * @param {{x0,x1,z0,z1}} o.town   the flat plain the town is built on
 * @param {number} o.mouthX        where the valley leaves the plain
 * @param {{x,z}} o.impact         where the meteorite came down
 * @param {number} o.northZ        the far end of the valley
 * @param {number} o.topY          how high the land is by the time you get there
 * @param {number} o.gateX         where the Twoson road leaves to the south
 */
export function makeOnettLand({
  seed = 5,
  town = { x0: -92, x1: 92, z0: -82, z1: 78 },
  mouthX = -30,
  impact = { x: -46, z: -170 },
  northZ = -210,
  topY = 15.0,
  gateX = 0,
} = {}) {
  const rand = rng(seed);
  const span = town.z0 - northZ;

  // Hummocks in the valley floor: for the eye and the walk, gentle enough that
  // the slope limit never trips on them.
  const humps = [];
  for (let i = 0; i < 30; i++) {
    humps.push({
      x: (rand() - 0.5) * 200,
      z: northZ + rand() * (span - 26),
      r: 12 + rand() * 18,
      h: 0.5 + rand() * 1.3,
    });
  }
  // Knolls out on the hills, where steepness is welcome.
  const knolls = [];
  for (let i = 0; i < 26; i++) {
    knolls.push({
      x: (rand() - 0.5) * 260,
      z: northZ - 20 + rand() * (span + 90),
      r: 15 + rand() * 24,
      h: 5 + rand() * 13,
    });
  }

  /**
   * The tree line wobbles rather than following the town's rectangle, so the
   * edge of the plain is a wandering boundary instead of a box.
   */
  function wobble(x, z) {
    return Math.sin(x * 0.041 + 1.3) * 6.5
      + Math.sin(z * 0.053 - 0.7) * 5.5
      + Math.sin((x + z) * 0.028 + 2.1) * 4.0;
  }

  /**
   * How far outside the plain a point is; negative anywhere on it.
   *
   * The wobble displaces the tree line, and it must only ever do that from
   * *outside*. Subtracting it unconditionally lets a negative wobble register
   * as distance in the middle of the town, which lifted the ground a few
   * centimetres under the streets — flat everywhere except where it wasn't.
   */
  function outside(x, z) {
    const dx = Math.max(town.x0 - x, 0, x - town.x1);
    const dz = Math.max(town.z0 - z, 0, z - town.z1);
    const raw = Math.hypot(dx, dz);
    if (raw <= 0) return -1;
    return raw - wobble(x, z);
  }

  /** Centre of the valley floor at a given depth — the meander. */
  function spineX(z) {
    const t = (town.z0 - z) / span;         // 0 at the plain, 1 at the far end
    return mouthX
      + Math.sin(t * 4.6) * 26
      + Math.sin(t * 10.7 + 1.9) * 12
      - t * 22;
  }

  /** Half-width of the walkable valley floor at a given depth. */
  function spineWidth(z) {
    const t = (town.z0 - z) / span;
    const base = 11 + Math.sin(t * 7.1 + 0.6) * 4.5;        // pockets and pinches
    const mouth = 15 * Math.exp(-(((z - town.z0) / 26) ** 2));
    const bowl = 20 * Math.exp(-(((z - impact.z) / 30) ** 2));
    return base + mouth + bowl;
  }

  /** The crater: a dish punched into the floor with a thrown-up rim. */
  function craterAt(x, z) {
    const di = Math.hypot(x - impact.x, z - impact.z);
    return 1.5 * Math.exp(-(((di - 17) / 7) ** 2)) - 3.4 * (1 - smoothstep(0, 16, di));
  }

  function height(x, z) {
    // --- north of the plain: the valley out to the impact site -------------
    if (z < town.z0) {
      const t = Math.min(1, Math.max(0, (town.z0 - z) / span));
      let y = (topY) * smoothstep(0, 1, t);

      const w = spineWidth(z);
      const off = Math.abs(x - spineX(z));
      // A smoothstep alone saturates into a flat plateau on top of the hill —
      // unreachable, but walkable if you ever got there. Past the transition
      // the ground keeps climbing at a gradient the collider refuses.
      y += FLANK * smoothstep(w, w + FLANK_RUN, off)
        + Math.min(30, Math.max(0, off - (w + FLANK_RUN)) * 0.85);

      for (const b of humps) {
        const d = Math.hypot(x - b.x, z - b.z);
        if (d < b.r) y += b.h * (1 - smoothstep(0, b.r, d));
      }
      for (const b of knolls) {
        const d = Math.hypot(x - b.x, z - b.z);
        if (d < b.r) y += b.h * (1 - smoothstep(0, b.r, d)) * smoothstep(w * 0.5, w + 6, off);
      }
      y += craterAt(x, z);

      // ease the whole thing to nothing where it meets the plain, so the
      // valley mouth opens out of flat ground with no lip
      return y * smoothstep(0, 20, town.z0 - z);
    }

    // --- the plain, and the wooded rim around it ---------------------------
    const d = outside(x, z);
    if (d <= 0) return 0;                                  // the town is flat

    // one gap to the south: the road out to Twoson
    const gate = z > town.z1 ? Math.exp(-(((x - gateX) / 15) ** 2)) : 0;
    let y = RIM * smoothstep(FRINGE, FRINGE + RIM_RUN, d)
      + Math.min(26, Math.max(0, d - (FRINGE + RIM_RUN)) * 0.8);
    for (const b of knolls) {
      const dd = Math.hypot(x - b.x, z - b.z);
      if (dd < b.r) y += b.h * (1 - smoothstep(0, b.r, dd)) * smoothstep(FRINGE, FRINGE + 14, d);
    }
    return y * (1 - gate * 0.95);
  }

  /** How far off the valley floor a point is, 0 at the spine and 1 at the flank. */
  function offSpine(x, z) {
    const w = spineWidth(z);
    return smoothstep(w * 0.45, w + 12, Math.abs(x - spineX(z)));
  }

  function slope(x, z, e = 0.7) {
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  function fromImpact(x, z) {
    return Math.hypot(x - impact.x, z - impact.z);
  }

  /** True on the flat plain the town is built on. */
  function onPlain(x, z) {
    return z >= town.z0 && outside(x, z) <= 0;
  }

  return {
    height, slope, spineX, spineWidth, offSpine, fromImpact, onPlain, outside,
    town, impact, northZ, span, mouthX, gateX,
    /** Where the valley starts, i.e. the plain's north edge. */
    southZ: town.z0,
  };
}

/**
 * Build the visible ground for the whole map.
 *
 * One mesh. Every seam the old terraced version had was a place two rectangles
 * met at different heights, and there is nowhere for one of those to hide.
 * Colour is per-vertex on top of the grass texture: greyer as the ground
 * steepens, drier down the middle of the valley where the walking is, burnt
 * around the impact site.
 */
export function landMesh(land, {
  x0 = -170, x1 = 170, z0 = -240, z1 = 170, step = 3.8,
} = {}) {
  const nx = Math.max(2, Math.round((x1 - x0) / step));
  const nz = Math.max(2, Math.round((z1 - z0) / step));
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(P.grass);
  const dry = new THREE.Color('#c3b478');
  const rock = new THREE.Color('#9a8f7e');
  const deep = new THREE.Color(shade(P.grass, -0.26));
  const burnt = new THREE.Color('#584036');
  const singed = new THREE.Color('#7d6a44');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, land.height(x, z));

    const s = Math.min(1, land.slope(x, z) / 1.05);
    c.copy(grass);
    // The valley's own tinting has to fade in rather than switch on at the
    // plain's edge, or the map carries a hard colour seam straight across it.
    const wild = smoothstep(0, 22, land.town.z0 - z);
    if (wild > 0) {
      const off = land.offSpine(x, z);
      c.lerp(deep, off * 0.2 * wild);
      c.lerp(dry, (1 - off) * 0.4 * (1 - s) * wild);
    }
    c.lerp(rock, s * 0.7);
    // Scorch, painted into the ground itself. A flat decal laid on a dish is
    // half buried and half floating; this follows the bowl because it is it.
    const di = land.fromImpact(x, z);
    c.lerp(singed, 1 - smoothstep(12, 26, di));
    c.lerp(burnt, 1 - smoothstep(4, 15, di));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // UVs come out 0..1 across the whole plate; retile them in world units so
  // the grass keeps a constant grain however big the map is.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / 7, (pos.getZ(i) - z0) / 7);
  }

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: repeated(T.grass(), 1, 1), vertexColors: true,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'land';
  return mesh;
}

/**
 * Scatter something across the land, letting the terrain decide where.
 *
 * `place(x, y, z, info)` is called for each accepted point; `want` picks which
 * points are acceptable — trees on the hillsides, boulders on the steeps,
 * scrub at the break of slope. The planting follows the shape of the land, so
 * the land is what you end up reading.
 */
export function scatterLand(land, {
  x0, x1, z0, z1, count = 120, seed = 11, want = () => true, place,
}) {
  const rand = rng(seed);
  for (let i = 0, tries = 0; i < count && tries < count * 14; tries++) {
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + rand() * (z1 - z0);
    const y = land.height(x, z);
    const info = {
      slope: land.slope(x, z),
      off: z < land.town.z0 ? land.offSpine(x, z) : 1,
      out: land.outside(x, z),
      rand,
    };
    if (!want(x, y, z, info)) continue;
    i++;
    place(x, y, z, info);
  }
}

/**
 * A worn trail following the valley floor.
 *
 * Laid as a ribbon that follows the meander and floats a few centimetres above
 * the ground, which is enough at this camera angle and far cheaper than
 * re-triangulating the terrain around a path.
 */
export function landTrail(land, { from, to, width = 1.9, segments = 90 }) {
  const geos = [];
  const lift = 0.09;
  for (let i = 0; i < segments; i++) {
    const z0 = from + ((to - from) * i) / segments;
    const z1 = from + ((to - from) * (i + 1)) / segments;
    const a = land.spineX(z0);
    const b = land.spineX(z1);
    // widen and narrow a little so it reads as worn, not painted
    const w0 = width * (0.8 + 0.35 * Math.abs(Math.sin(z0 * 0.11)));
    const w1 = width * (0.8 + 0.35 * Math.abs(Math.sin(z1 * 0.11)));
    const quad = new THREE.BufferGeometry();
    const verts = new Float32Array([
      a - w0, land.height(a - w0, z0) + lift, z0,
      a + w0, land.height(a + w0, z0) + lift, z0,
      b + w1, land.height(b + w1, z1) + lift, z1,
      a - w0, land.height(a - w0, z0) + lift, z0,
      b + w1, land.height(b + w1, z1) + lift, z1,
      b - w1, land.height(b - w1, z1) + lift, z1,
    ]);
    const uvs = new Float32Array([0, i, 1, i, 1, i + 1, 0, i, 1, i + 1, 0, i + 1]);
    quad.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    quad.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geos.push(quad);
  }
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
    map: repeated(T.dirtPath(), 1, 1), transparent: true, opacity: 0.92, depthWrite: false,
  }));
  mesh.renderOrder = 1;
  mesh.name = 'trail';
  return mesh;
}
