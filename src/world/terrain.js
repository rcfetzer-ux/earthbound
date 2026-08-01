/**
 * Rolling country.
 *
 * The town is genuinely built on a grid and terraced rectangles are the honest
 * model for it. The land outside it is not, and describing the hills the same
 * way was what made every field read as a plate someone had laid down — you
 * could feel the rectangles even where there was nothing but grass.
 *
 * So the wilds are a continuous height function instead. One expression gives
 * both the mesh you see and the height the collider samples, which means the
 * shape of the ground and the shape of the walk are the same thing by
 * construction, and there is no invisible boundary anywhere.
 *
 * The shape is deliberate, not noise:
 *
 *   climb    the land rises steadily the further north you go
 *   meander  a valley floor that wanders east and west as it climbs, so you
 *            never see where you are going for more than a bend at a time
 *   flanks   ground that rises hard either side of that floor. Steeper than
 *            the collider's slope limit, so the hills turn you back — the
 *            thing stopping you is a hillside you can see, not an edge
 *   pockets  the floor widens and narrows, opening into clearings
 *   bumps    hummocks in the floor itself, kept gentle enough to walk over
 *   bowl     a wide saucer around the impact site, so the meteorite has room
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { T, repeated, rng } from '../core/tex.js';
import { P, shade } from '../core/palette.js';

/**
 * How high the ground rises either side of the valley floor, and over what
 * distance.
 *
 * Two constraints pull against each other. The steepest gradient the flank
 * reaches is 1.5 * FLANK / FLANK_RUN, and it has to comfortably clear the
 * collider's slope limit or the hills are a suggestion rather than a wall.
 * But the afternoon sun sits at 30 degrees, so a flank of height H standing
 * this close to the path throws a shadow about 1.7 H long — take FLANK much
 * above this and the valley floor is in permanent darkness.
 */
const FLANK = 14;
const FLANK_RUN = 13;

const smoothstep = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * @param {Object} o
 * @param {number} o.seed
 * @param {number} o.southZ    where the country starts (the town's north edge)
 * @param {number} o.northZ    the far end, past the impact site
 * @param {number} o.baseY     ground height where it meets the town
 * @param {number} o.topY      ground height at the far end
 * @param {{x:number,z:number}} o.impact  centre of the crater bowl
 */
export function makeCountry({
  seed = 5, southZ = -55, northZ = -170, baseY = 5.8, topY = 15.5,
  impact = { x: 0, z: -140 },
} = {}) {
  const rand = rng(seed);
  const span = southZ - northZ;          // positive: how deep the country runs

  // Hummocks in the valley floor. Small enough that the slope limit never
  // trips on them — these are for the eye and the walk, not for blocking.
  const humps = [];
  for (let i = 0; i < 34; i++) {
    humps.push({
      x: (rand() - 0.5) * 200,
      z: northZ + rand() * span,
      r: 9 + rand() * 16,
      h: 0.5 + rand() * 1.5,
    });
  }
  // Knolls out on the flanks, where steepness is welcome.
  const knolls = [];
  for (let i = 0; i < 22; i++) {
    knolls.push({
      x: (rand() - 0.5) * 240,
      z: northZ - 14 + rand() * (span + 28),
      r: 14 + rand() * 22,
      h: 6 + rand() * 14,
    });
  }

  /** Centre of the valley floor at a given depth — the meander. */
  function spineX(z) {
    const t = (southZ - z) / span;              // 0 at the town, 1 at the far end
    return Math.sin(t * 5.1) * 30
      + Math.sin(t * 11.3 + 1.7) * 13
      + t * 8;
  }

  /** Half-width of the walkable floor at a given depth. */
  function spineWidth(z) {
    const t = (southZ - z) / span;
    const base = 11 + Math.sin(t * 7.4 + 0.6) * 4.5;        // pockets and pinches
    // the mouth, where the town's track arrives, opens out
    const mouth = 14 * Math.exp(-(((z - southZ) / 22) ** 2));
    // and so does the bowl around the impact site
    const bowl = 20 * Math.exp(-(((z - impact.z) / 30) ** 2));
    return base + mouth + bowl;
  }

  function height(x, z) {
    // 1. the climb north
    const t = Math.min(1, Math.max(0, (southZ - z) / span));
    let y = baseY + (topY - baseY) * smoothstep(0, 1, t);

    // 2. flanks: ground rises away from the valley floor, hard
    const w = spineWidth(z);
    const off = Math.abs(x - spineX(z));
    // A smoothstep alone saturates, which leaves a flat plateau on top of the
    // hill — unreachable, but walkable if you ever got there. Past the
    // transition the ground keeps climbing at a gradient the collider refuses,
    // so the hills are hills all the way up rather than mesas.
    y += FLANK * smoothstep(w, w + FLANK_RUN, off)
      + Math.min(34, Math.max(0, off - (w + FLANK_RUN)) * 0.85);

    // 3. hummocks in the floor
    for (const b of humps) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r) y += b.h * (1 - smoothstep(0, b.r, d));
    }
    // 4. knolls, which only really show once you are up on the flanks
    for (const b of knolls) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r) y += b.h * (1 - smoothstep(0, b.r, d)) * smoothstep(w * 0.5, w + 6, off);
    }

    // 5. the impact site: a dish punched into the floor with a thrown-up rim
    const di = Math.hypot(x - impact.x, z - impact.z);
    y += 1.5 * Math.exp(-(((di - 17) / 7) ** 2));      // thrown-up rim
    y -= 3.4 * (1 - smoothstep(0, 16, di));            // dish

    return y;
  }

  /** How far off the valley floor a point is, 0 at the spine and 1 at the flank. */
  function offSpine(x, z) {
    const w = spineWidth(z);
    return smoothstep(w * 0.45, w + 12, Math.abs(x - spineX(z)));
  }

  function slope(x, z, e = 0.6) {
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  /** Distance from the impact site — used to keep scenery out of the crater. */
  function fromImpact(x, z) {
    return Math.hypot(x - impact.x, z - impact.z);
  }

  return { height, slope, spineX, spineWidth, offSpine, fromImpact, southZ, northZ, impact, span };
}

/**
 * Build the visible ground for a country.
 *
 * The mesh runs well past the walkable floor and off the edge of the map, so
 * the hills carry on into the distance rather than stopping at a rim. Colour
 * is per-vertex on top of the grass texture: browner and greyer as the ground
 * steepens, worn and dusty down the middle of the floor where the walking is.
 */
export function countryMesh(country, {
  x0 = -150, x1 = 150, z0 = -190, z1 = -50, step = 2.6,
} = {}) {
  const nx = Math.max(2, Math.round((x1 - x0) / step));
  const nz = Math.max(2, Math.round((z1 - z0) / step));
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(P.grass);
  const dry = new THREE.Color('#c8b978');
  const rock = new THREE.Color('#9a8f7e');
  const deep = new THREE.Color(shade(P.grass, -0.3));
  const burnt = new THREE.Color('#584036');
  const singed = new THREE.Color('#7d6a44');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, country.height(x, z));

    const s = Math.min(1, country.slope(x, z) / 1.05);
    const off = country.offSpine(x, z);
    // green in the hollows, drier along the trodden middle, rock on the steeps
    c.copy(grass).lerp(deep, off * 0.2);
    c.lerp(dry, (1 - off) * 0.42 * (1 - s));
    c.lerp(rock, s * 0.72);
    // Scorch, painted into the ground itself. A flat decal disc laid on a dish
    // is half buried and half floating; this follows the bowl exactly because
    // it *is* the bowl.
    const di = country.fromImpact(x, z);
    c.lerp(singed, 1 - smoothstep(12, 26, di));
    c.lerp(burnt, 1 - smoothstep(4, 15, di));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // UVs come out 0..1 across the whole plate; retile them in world units so
  // the grass keeps a constant grain however big the country is.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / 7, (pos.getZ(i) - z0) / 7);
  }

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: repeated(T.grass(), 1, 1), vertexColors: true,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'country';
  return mesh;
}

/**
 * Scatter something across a country, letting the terrain decide where.
 *
 * `place(x, y, z, rand)` is called for each accepted point. `want` picks which
 * points are acceptable — trees on the flanks, boulders on the steeps, grass on
 * the floor — so the planting follows the shape of the land instead of a grid.
 */
export function scatterCountry(country, {
  x0, x1, z0, z1, count = 120, seed = 11, want = () => true, place,
}) {
  const rand = rng(seed);
  for (let i = 0, tries = 0; i < count && tries < count * 12; tries++) {
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + rand() * (z1 - z0);
    const y = country.height(x, z);
    const info = { slope: country.slope(x, z), off: country.offSpine(x, z), rand };
    if (!want(x, y, z, info)) continue;
    i++;
    place(x, y, z, info);
  }
}

/**
 * A worn trail down the middle of the valley floor.
 *
 * Laid as a ribbon that follows the meander and floats a few centimetres above
 * the ground, which is enough at this camera angle and far cheaper than
 * re-triangulating the terrain around a path.
 */
export function countryTrail(country, { from, to, width = 1.9, segments = 90 }) {
  const geos = [];
  const lift = 0.09;
  for (let i = 0; i < segments; i++) {
    const z0 = from + ((to - from) * i) / segments;
    const z1 = from + ((to - from) * (i + 1)) / segments;
    const a = country.spineX(z0);
    const b = country.spineX(z1);
    // widen and narrow a little so it reads as worn, not painted
    const w0 = width * (0.8 + 0.35 * Math.abs(Math.sin(z0 * 0.11)));
    const w1 = width * (0.8 + 0.35 * Math.abs(Math.sin(z1 * 0.11)));
    const quad = new THREE.BufferGeometry();
    const verts = new Float32Array([
      a - w0, country.height(a - w0, z0) + lift, z0,
      a + w0, country.height(a + w0, z0) + lift, z0,
      b + w1, country.height(b + w1, z1) + lift, z1,
      a - w0, country.height(a - w0, z0) + lift, z0,
      b + w1, country.height(b + w1, z1) + lift, z1,
      b - w1, country.height(b - w1, z1) + lift, z1,
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
