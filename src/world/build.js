/**
 * Building kit.
 *
 * Structures are assembled from a handful of chunky primitives — boxes for
 * volumes, prisms for gable roofs, pyramids for hips — textured with the pixel
 * materials from tex.js. Polygon counts stay deliberately low: the silhouettes
 * should read like the flat storybook houses of the original, just with real
 * thickness and a shadow.
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';
import { T, repeated, signTexture } from '../core/tex.js';

/**
 * Matte, unshiny material — everything in town uses the same lighting model.
 *
 * Materials are memoized on (map, colour): sharing them is what makes the
 * static-geometry bake in zone.js able to collapse the town into a handful of
 * draw calls. Pass opts to opt out of sharing.
 */
const matCache = new Map();

export function mat(map, color = 0xffffff, opts = null) {
  if (opts) return new THREE.MeshLambertMaterial({ map, color, ...opts });
  const key = `m|${map?.uuid ?? 'none'}|${color}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ map, color }); matCache.set(key, m); }
  return m;
}

export function flatMat(color, opts = null) {
  if (opts) return new THREE.MeshLambertMaterial({ color, ...opts });
  const key = `f|${color}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(key, m); }
  return m;
}

/** Box helper: size + centre, with per-face or single material. */
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  // Slivers (trim, mullions, kerbs) receive shadow but don't cast: their
  // silhouettes add nothing and they'd double the shadow pass.
  m.castShadow = w * h * d > 0.05;
  m.receiveShadow = true;
  return m;
}

/**
 * Triangular prism (gable roof). Ridge runs along `axis`.
 * Returns a mesh whose origin is at the eaves centre.
 */
export function gable(w, h, d, material, axis = 'x') {
  const hw = w / 2;
  const hd = d / 2;
  // vertices: eaves rectangle + ridge line
  const verts = [];
  const norms = [];
  const uvs = [];
  const push = (p, n, uv) => { verts.push(...p); norms.push(...n); uvs.push(...uv); };

  // UVs are normalised 0..1 per face; tiling is left to texture.repeat so the
  // shingle scale stays independent of the building's size.
  if (axis === 'x') {
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
    const R0 = [-hw, h, 0], R1 = [hw, h, 0];
    // north slope (A,B,R1,R0)
    const nN = new THREE.Vector3(0, hd, -h).normalize().toArray();
    push(A, nN, [0, 0]); push(B, nN, [1, 0]); push(R1, nN, [1, 1]);
    push(A, nN, [0, 0]); push(R1, nN, [1, 1]); push(R0, nN, [0, 1]);
    // south slope (D,R0,R1,C)
    const nS = new THREE.Vector3(0, hd, h).normalize().toArray();
    push(D, nS, [0, 0]); push(R0, nS, [0, 1]); push(R1, nS, [1, 1]);
    push(D, nS, [0, 0]); push(R1, nS, [1, 1]); push(C, nS, [1, 0]);
    // gable ends
    const nW = [-1, 0, 0];
    push(A, nW, [0, 0]); push(R0, nW, [0.5, 1]); push(D, nW, [1, 0]);
    const nE = [1, 0, 0];
    push(B, nE, [0, 0]); push(C, nE, [1, 0]); push(R1, nE, [0.5, 1]);
  } else {
    const A = [-hw, 0, -hd], B = [-hw, 0, hd], C = [hw, 0, hd], D = [hw, 0, -hd];
    const R0 = [0, h, -hd], R1 = [0, h, hd];
    const nW = new THREE.Vector3(-hw, hw, 0).normalize().toArray();
    push(A, nW, [0, 0]); push(R0, nW, [0, 1]); push(R1, nW, [1, 1]);
    push(A, nW, [0, 0]); push(R1, nW, [1, 1]); push(B, nW, [1, 0]);
    const nE = new THREE.Vector3(hw, hw, 0).normalize().toArray();
    push(D, nE, [0, 0]); push(C, nE, [1, 0]); push(R1, nE, [1, 1]);
    push(D, nE, [0, 0]); push(R1, nE, [1, 1]); push(R0, nE, [0, 1]);
    const nN = [0, 0, -1];
    push(A, nN, [0, 0]); push(D, nN, [1, 0]); push(R0, nN, [0.5, 1]);
    const nS = [0, 0, 1];
    push(B, nS, [0, 0]); push(R1, nS, [0.5, 1]); push(C, nS, [1, 0]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Four-sided pyramid roof, built by hand rather than from a cone: a cone's
 * radial UVs smear a shingle texture into concentric rings, while these four
 * triangles each get a clean 0..1 mapping.
 */
export function hipRoof(w, h, d, material) {
  const hw = w / 2;
  const hd = d / 2;
  const apex = [0, h, 0];
  const corners = [
    [-hw, 0, hd], [hw, 0, hd],   // south edge
    [hw, 0, -hd], [-hw, 0, -hd], // north edge
  ];
  const verts = [];
  const norms = [];
  const uvs = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const vc = new THREE.Vector3(...apex);
    const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize().toArray();
    verts.push(...a, ...b, ...apex);
    norms.push(...n, ...n, ...n);
    uvs.push(0, 0, 1, 0, 0.5, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;

  // Ridge caps along the four hips. Without them the shingle courses read as
  // concentric contour lines rather than a roof.
  const out = new THREE.Group();
  out.add(m);
  const capMat = new THREE.MeshLambertMaterial({
    color: (material.color ?? new THREE.Color(0x999999)).clone().multiplyScalar(0.7),
  });
  const apexV = new THREE.Vector3(...apex);
  for (const c of corners) {
    const cv = new THREE.Vector3(...c);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, cv.distanceTo(apexV)), capMat);
    cap.position.copy(cv).add(apexV).multiplyScalar(0.5);
    cap.lookAt(apexV);
    cap.castShadow = true;
    out.add(cap);
  }
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.42), capMat);
  peak.position.set(0, h, 0);
  out.add(peak);
  return out;
}

/** Thin quad, used for windows, doors, signs and decals. */
export function decal(w, h, material, { x = 0, y = 0, z = 0, ry = 0, rx = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  return m;
}

const SIDE_ROT = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
const SIDE_NORMAL = {
  south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0],
};

/**
 * Build a house / shop.
 *
 * @param {Object} spec
 * @param {number} spec.x world x of the footprint centre
 * @param {number} spec.z world z
 * @param {number} spec.y ground height
 * @param {number} spec.w width, {number} spec.d depth, {number} spec.h wall height
 * @param {string} spec.wall wall colour
 * @param {'siding'|'stucco'|'brick'} [spec.wallTex]
 * @param {string} spec.roof roof colour
 * @param {'gable'|'hip'|'flat'} [spec.roofType]
 * @param {'x'|'z'} [spec.ridge]
 * @param {Array} [spec.doors] [{side, offset, target, spawn, label, kind}]
 * @param {Array} [spec.windows] [{side, offset, y, lit}]
 * @param {Object} [spec.sign] {text, bg, fg, side, offset, y}
 * @param {boolean} [spec.awning]
 * @param {boolean} [spec.chimney]
 * @param {{solids:Solids, doors:Array}} ctx
 */
export function building(spec, ctx) {
  const {
    x = 0, z = 0, y = 0, w = 10, d = 8, h = 4.4,
    wall = P.wallCream, wallTex = 'siding', roof = P.roofRed,
    roofType = 'gable', ridge = 'x', roofOverhang = 0.6, roofH = 2.4,
    doors = [], windows = [], sign = null, awning = false, chimney = false,
    trim = null, storeys = 1, solid = true, name = '',
  } = spec;

  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;

  const wallH = h * storeys;

  // --- walls -------------------------------------------------------------
  let wallMap;
  if (wallTex === 'brick') wallMap = repeated(T.brick(), w / 2.2, wallH / 2.2);
  else if (wallTex === 'stucco') wallMap = repeated(T.stucco(wall, wall), w / 3, wallH / 3);
  else wallMap = repeated(T.siding(wall, wall), w / 3, wallH / 1.6);

  const wallMat = mat(wallMap, wallTex === 'brick' ? 0xffffff : 0xffffff);
  const walls = box(w, wallH, d, wallMat, 0, 0, 0);
  g.add(walls);

  // foundation strip: grounds the building visually
  const found = box(w + 0.24, 0.34, d + 0.24, mat(repeated(T.concrete(), w / 2, 1), 0xdedad0), 0, -0.02, 0);
  g.add(found);

  if (trim) {
    // horizontal band between storeys, or a base skirt
    const band = box(w + 0.1, 0.3, d + 0.1, flatMat(trim), 0, storeys > 1 ? h : wallH - 0.4, 0);
    g.add(band);
  }

  // --- roof --------------------------------------------------------------
  const rw = w + roofOverhang * 2;
  const rd = d + roofOverhang * 2;
  if (roofType === 'flat') {
    const slab = box(rw, 0.3, rd, mat(repeated(T.concrete(), rw / 3, rd / 3), 0xcfc9bb), 0, wallH, 0);
    g.add(slab);
    // parapet
    const pMat = flatMat(shade(roof, -0.05));
    const ph = 0.55;
    g.add(box(rw, ph, 0.3, pMat, 0, wallH + 0.3, -rd / 2 + 0.15));
    g.add(box(rw, ph, 0.3, pMat, 0, wallH + 0.3, rd / 2 - 0.15));
    g.add(box(0.3, ph, rd, pMat, -rw / 2 + 0.15, wallH + 0.3, 0));
    g.add(box(0.3, ph, rd, pMat, rw / 2 - 0.15, wallH + 0.3, 0));
  } else if (roofType === 'hip') {
    const rm = mat(repeated(T.shingle(roof, roof), rw / 2.4, roofH / 1.6), 0xffffff);
    const r = hipRoof(rw, roofH, rd, rm);
    r.position.y = wallH;
    g.add(r);
    g.add(box(rw + 0.1, 0.22, rd + 0.1, flatMat(shade(roof, -0.3)), 0, wallH - 0.11, 0));
  } else {
    const rm = mat(repeated(T.shingle(roof, roof), rw / 2.4, roofH / 1.4), 0xffffff);
    const r = gable(rw, roofH, rd, rm, ridge);
    r.position.y = wallH;
    g.add(r);
    // fascia board under the eaves
    g.add(box(rw + 0.08, 0.24, rd + 0.08, flatMat(shade(roof, -0.34)), 0, wallH - 0.12, 0));
  }

  if (chimney) {
    const cm = mat(repeated(T.brick(), 0.8, 1.4), 0xffffff);
    const c = box(0.9, roofH + 0.9, 0.9, cm, w * 0.26, wallH, ridge === 'x' ? d * 0.1 : 0);
    g.add(c);
    g.add(box(1.1, 0.18, 1.1, flatMat('#6a6068'), w * 0.26, wallH + roofH + 0.9, ridge === 'x' ? d * 0.1 : 0));
  }

  // --- openings ----------------------------------------------------------
  const faceOffset = 0.02;
  const placeOnSide = (side, offset, obj, yy) => {
    const ry = SIDE_ROT[side];
    const [nx, nz] = SIDE_NORMAL[side];
    const half = (side === 'east' || side === 'west') ? d / 2 : w / 2;
    const depth = (side === 'east' || side === 'west') ? w / 2 : d / 2;
    obj.position.set(
      nx * (depth + faceOffset) + (nx === 0 ? offset : 0),
      yy,
      nz * (depth + faceOffset) + (nz === 0 ? offset : 0),
    );
    if (side === 'east' || side === 'west') {
      obj.position.x = nx * (w / 2 + faceOffset);
      obj.position.z = offset;
    }
    obj.rotation.y = ry;
    void half;
    g.add(obj);
    return obj;
  };

  for (const win of windows) {
    const ww = win.w ?? 1.5;
    const wh = win.h ?? 1.6;
    const m = new THREE.MeshLambertMaterial({ map: T.window(win.lit ?? false) });
    const q = decal(ww, wh, m);
    placeOnSide(win.side, win.offset ?? 0, q, (win.y ?? 1.1) + wh / 2);
    // sill + shutters give the flat wall some relief
    const sill = box(ww + 0.3, 0.14, 0.22, flatMat(P.wallWhite));
    placeOnSide(win.side, win.offset ?? 0, sill, (win.y ?? 1.1) - 0.07);
    sill.position.y = (win.y ?? 1.1) - 0.07;
    if (win.shutters) {
      for (const s of [-1, 1]) {
        const sh = box(0.22, wh, 0.16, flatMat(win.shutters));
        placeOnSide(win.side, (win.offset ?? 0) + s * (ww / 2 + 0.16), sh, (win.y ?? 1.1) + wh / 2);
        sh.position.y = (win.y ?? 1.1);
      }
    }
  }

  for (const dr of doors) {
    const dw = dr.w ?? 1.5;
    const dh = dr.h ?? 2.9;
    const kind = dr.kind ?? 'wood';
    const map = kind === 'glass' ? T.glassDoor() : T.door(dr.color ?? P.wood);
    const q = decal(dw, dh, new THREE.MeshLambertMaterial({ map }));
    placeOnSide(dr.side, dr.offset ?? 0, q, dh / 2 + 0.05);
    // frame
    const frameMat = flatMat(dr.frame ?? P.wallWhite);
    const fl = box(0.18, dh + 0.2, 0.2, frameMat);
    placeOnSide(dr.side, (dr.offset ?? 0) - dw / 2 - 0.09, fl, 0);
    fl.position.y = 0;
    const fr = box(0.18, dh + 0.2, 0.2, frameMat);
    placeOnSide(dr.side, (dr.offset ?? 0) + dw / 2 + 0.09, fr, 0);
    fr.position.y = 0;
    const ft = box(dw + 0.36, 0.2, 0.2, frameMat);
    placeOnSide(dr.side, dr.offset ?? 0, ft, dh + 0.1);
    ft.position.y = dh + 0.1;

    // stoop
    const [nx, nz] = SIDE_NORMAL[dr.side];
    const outX = nx * ((nx ? w : d) / 2);
    const stepX = nx ? nx * (w / 2 + 0.45) : (dr.offset ?? 0);
    const stepZ = nz ? nz * (d / 2 + 0.45) : (dr.offset ?? 0);
    const step = box(dw + 0.8, 0.18, 1.0, mat(repeated(T.concrete(), 1, 1), 0xdedad0),
      nx ? stepX : stepX, -0.02, nz ? stepZ : stepZ);
    if (nx) { step.geometry.dispose(); step.geometry = new THREE.BoxGeometry(1.0, 0.18, dw + 0.8); }
    g.add(step);
    void outX;

    // register the trigger in world space
    if (ctx?.doors && dr.target) {
      ctx.doors.push({
        x: x + (nx ? nx * (w / 2 + 0.8) : (dr.offset ?? 0)),
        z: z + (nz ? nz * (d / 2 + 0.8) : (dr.offset ?? 0)),
        y: y,
        r: dr.r ?? 1.25,
        target: dr.target,
        spawn: dr.spawn,
        label: dr.label ?? name,
        sound: kind === 'glass' ? 'doorGlass' : 'door',
      });
    }
  }

  if (sign) {
    const sw = sign.w ?? Math.min(w * 0.8, 5.2);
    const sh = sign.h ?? 1.2;
    const bg = sign.bg ?? P.roofBlue;
    const st = signTexture(sign.text, bg, sign.fg ?? '#ffffff',
      Math.max(64, Math.round(sw * 26)), Math.max(20, Math.round(sh * 26)));
    // Only the outward face carries the lettering; the rest is a plain frame.
    const edge = flatMat(shade(bg, -0.3));
    const face = new THREE.MeshLambertMaterial({ map: st });
    const board = box(sw, sh, 0.26, [edge, edge, edge, edge, face, edge]);
    placeOnSide(sign.side ?? 'south', sign.offset ?? 0, board, sign.y ?? (wallH - 1.0));
    board.position.y = sign.y ?? (wallH - 1.0);
  }

  if (awning) {
    const aw = typeof awning === 'object' ? awning : {};
    const stripes = aw.color ?? P.roofRed;
    const width = aw.w ?? w * 0.75;
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.16, 1.5),
      mat(repeated(T.tileRoof(stripes, stripes), width / 1.2, 1), 0xffffff),
    );
    canopy.castShadow = true;
    const side = aw.side ?? 'south';
    const [nx, nz] = SIDE_NORMAL[side];
    canopy.position.set(
      nx ? nx * (w / 2 + 0.7) : (aw.offset ?? 0),
      aw.y ?? 2.75,
      nz ? nz * (d / 2 + 0.7) : (aw.offset ?? 0),
    );
    if (nx) { canopy.geometry.dispose(); canopy.geometry = new THREE.BoxGeometry(1.5, 0.16, width); }
    canopy.rotation.x = nz ? nz * -0.12 : 0;
    canopy.rotation.z = nx ? nx * 0.12 : 0;
    g.add(canopy);
  }

  if (solid && ctx?.solids) {
    ctx.solids.bounds(x - w / 2, z - d / 2, x + w / 2, z + d / 2, `building:${name}`);
  }

  return g;
}

// --- props -----------------------------------------------------------------

export function tree(x, z, y, { scale = 1, leaf = '#3f8f2f', kind = 'round' } = {}, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const trunkH = 2.0 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * scale, 0.38 * scale, trunkH, 7),
    mat(repeated(T.bark(), 1, 1.5), 0xffffff),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const leafMat = mat(repeated(T.leaves(leaf), 2, 2), 0xffffff);
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) {
      const r = (1.6 - i * 0.42) * scale;
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.7 * scale, 7), leafMat);
      c.position.y = trunkH * 0.6 + i * 0.95 * scale;
      c.castShadow = true;
      g.add(c);
    }
  } else {
    // three overlapping low-poly spheres: a lumpy, hand-drawn canopy
    const blobs = [[0, 0, 0, 1.55], [0.75, -0.35, 0.3, 1.1], [-0.7, -0.2, -0.35, 1.15]];
    for (const [bx, by, bz, br] of blobs) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(br * scale, 8, 6), leafMat);
      s.position.set(bx * scale, trunkH + 0.9 * scale + by * scale, bz * scale);
      s.castShadow = true;
      s.receiveShadow = true;
      g.add(s);
    }
  }
  if (ctx?.solids) ctx.solids.circle(x, z, 0.52 * scale, 'tree');
  return g;
}

export function hedge(x, z, y, w, d, h = 1.15, ctx) {
  const m = mat(repeated(T.hedge(), Math.max(1, w / 1.5), Math.max(1, h / 1.5)), 0xffffff);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const b = box(w, h, d, m, 0, 0, 0);
  g.add(b);
  // a lighter cap so hedges don't read as flat green slabs
  g.add(box(w - 0.1, 0.14, d - 0.1, flatMat('#5fb046'), 0, h, 0));
  if (ctx?.solids) ctx.solids.bounds(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'hedge');
  return g;
}

export function fence(x, z, y, length, axis = 'x', ctx, color = P.wood) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const postMat = mat(repeated(T.planks(), 1, 1), 0xffffff);
  const n = Math.max(2, Math.round(length / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = -length / 2 + (length / n) * i;
    const p = box(0.18, 1.15, 0.18, postMat, axis === 'x' ? t : 0, 0, axis === 'x' ? 0 : t);
    g.add(p);
  }
  for (const yy of [0.45, 0.85]) {
    const rail = axis === 'x'
      ? box(length, 0.14, 0.1, flatMat(color), 0, yy, 0)
      : box(0.1, 0.14, length, flatMat(color), 0, yy, 0);
    g.add(rail);
  }
  if (ctx?.solids) {
    if (axis === 'x') ctx.solids.bounds(x - length / 2, z - 0.16, x + length / 2, z + 0.16, 'fence');
    else ctx.solids.bounds(x - 0.16, z - length / 2, x + 0.16, z + length / 2, 'fence');
  }
  return g;
}

export function lamp(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const poleMat = mat(repeated(T.metal('#5f6675'), 1, 3), 0xffffff);
  g.add(box(0.4, 0.34, 0.4, flatMat('#4e5563'), 0, 0, 0));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.4, 6), poleMat);
  pole.position.y = 2.2;
  pole.castShadow = true;
  g.add(pole);
  // tapered lantern: cage, glass, and a little finial on top
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.62, 6), flatMat('#4e5563'));
  cage.position.y = 4.66;
  g.add(cage);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.19, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8 }),
  );
  glass.position.y = 4.66;
  g.add(glass);
  const capMesh = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 6), flatMat('#4e5563'));
  capMesh.position.y = 5.08;
  g.add(capMesh);
  g.add(box(0.1, 0.16, 0.1, flatMat('#4e5563'), 0, 5.2, 0));
  if (ctx?.solids) ctx.solids.circle(x, z, 0.26, 'lamp');
  return g;
}

export function signPost(x, z, y, text, ctx, { bg = '#e8e0c8', fg = '#3a3040', rotation = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotation;
  g.add(box(0.18, 1.9, 0.18, mat(repeated(T.planks(), 1, 1), 0xffffff), 0, 0, 0));
  const bw = Math.max(2.4, text.length * 0.42);
  const bh = 1.05;
  const st = signTexture(text, bg, fg, Math.max(72, Math.round(bw * 26)), Math.round(bh * 26));
  const edge = flatMat(shade(bg, -0.32));
  const face = new THREE.MeshLambertMaterial({ map: st });
  const board = box(bw, bh, 0.14, [edge, edge, edge, edge, face, edge], 0, 1.6, 0);
  g.add(board);
  // a second face so the sign reads from behind too
  g.add(decal(bw - 0.1, bh - 0.1, face, { y: 1.6 + bh / 2, z: -0.08, ry: Math.PI }));
  if (ctx?.solids) ctx.solids.circle(x, z, 0.3, 'sign');
  return g;
}

/** Parked car — chunky, cartoonish, four flat wheels. */
export function car(x, z, y, rotY = 0, color = '#d05050', ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const bodyMat = flatMat(color);
  const body = box(2.0, 0.75, 4.2, bodyMat, 0, 0.28, 0);
  g.add(body);
  const cabin = box(1.8, 0.7, 2.0, flatMat(shade(color, -0.12)), 0, 1.03, -0.15);
  g.add(cabin);
  const glassMat = flatMat(P.glass);
  g.add(decal(1.5, 0.5, glassMat, { x: 0, y: 1.35, z: 0.86 }));
  g.add(decal(1.5, 0.5, glassMat, { x: 0, y: 1.35, z: -1.16, ry: Math.PI }));
  g.add(decal(1.7, 0.5, glassMat, { x: 0.91, y: 1.35, z: -0.15, ry: Math.PI / 2 }));
  g.add(decal(1.7, 0.5, glassMat, { x: -0.91, y: 1.35, z: -0.15, ry: -Math.PI / 2 }));
  const wheelMat = flatMat('#28242e');
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // lights
  g.add(box(0.4, 0.2, 0.1, flatMat('#fff4c0'), -0.6, 0.65, 2.05));
  g.add(box(0.4, 0.2, 0.1, flatMat('#fff4c0'), 0.6, 0.65, 2.05));
  g.add(box(0.4, 0.2, 0.1, flatMat('#d03030'), -0.6, 0.65, -2.15));
  g.add(box(0.4, 0.2, 0.1, flatMat('#d03030'), 0.6, 0.65, -2.15));
  if (ctx?.solids) {
    const along = Math.abs(Math.cos(rotY)) > 0.5;
    if (along) ctx.solids.bounds(x - 1.1, z - 2.2, x + 1.1, z + 2.2, 'car');
    else ctx.solids.bounds(x - 2.2, z - 1.1, x + 2.2, z + 1.1, 'car');
  }
  return g;
}

/** Simple flower bed / bush cluster to break up lawns. */
export function bush(x, z, y, ctx, { scale = 1, color = '#4a9c36' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const m = mat(repeated(T.leaves(color), 1.5, 1.5), 0xffffff);
  for (const [bx, bz, br] of [[0, 0, 0.7], [0.45, 0.25, 0.5], [-0.4, 0.3, 0.45]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(br * scale, 7, 5), m);
    s.position.set(bx * scale, br * scale * 0.8, bz * scale);
    s.castShadow = true;
    g.add(s);
  }
  if (ctx?.solids) ctx.solids.circle(x, z, 0.6 * scale, 'bush');
  return g;
}

export function flowerPatch(x, z, y, count = 8, colors = ['#f8f0a0', '#f8a8c8', '#ffffff', '#f8c060']) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random();
    const r = 0.4 + Math.random() * 1.3;
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r;
    const stem = box(0.06, 0.3, 0.06, flatMat('#4a9c36'), fx, 0, fz);
    g.add(stem);
    const head = box(0.22, 0.14, 0.22, flatMat(colors[i % colors.length]), fx, 0.3, fz);
    g.add(head);
  }
  return g;
}
