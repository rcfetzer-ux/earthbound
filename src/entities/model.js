/**
 * Character models.
 *
 * Low-poly chibi figures — roughly three heads tall, big rounded shoes, flat
 * matte colours, no outlines — assembled from primitives and lit by the scene,
 * so they sit in the world instead of floating in front of it.
 *
 * These replaced billboarded pixel sprites. At this resolution the sprites read
 * as a different medium pasted onto the render: they never caught the light,
 * never turned, and never cast a real shadow.
 *
 * Each rigid part (head, torso, an arm, a leg) is merged into a *single*
 * multi-material mesh. A character is therefore six draw calls rather than the
 * eighteen its primitive count suggests, which matters with sixteen of them
 * walking around town.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { P, shade } from '../core/palette.js';

// --- cast ------------------------------------------------------------------

/**
 * @typedef {Object} CharCfg
 * @property {'kid'|'adult'|'stout'|'small'} build
 * @property {string} skin, {string} hair
 * @property {'none'|'cap'|'peaked'|'hat'|'nurse'} hat
 * @property {'plain'|'stripes'|'dress'|'coat'|'apron'} top
 * @property {'short'|'long'|'ponytail'|'bun'|'pompadour'|'bald'} hairStyle
 */
export const CHARS = {
  hero: {
    build: 'kid', skin: P.skin, hair: P.hairBrown, hairStyle: 'short',
    hat: 'cap', hatColor: P.capRed,
    top: 'stripes', shirt: P.shirtStripeA, shirt2: P.shirtStripeB,
    pants: P.shortsBlue, shoes: P.shoeYellow, backpack: true,
  },
  neighborKid: {
    build: 'stout', skin: P.skin, hair: P.hairBlonde, hairStyle: 'short', hat: 'none',
    top: 'stripes', shirt: '#e8c860', shirt2: '#8a5aa8',
    pants: '#7c5a3a', shoes: '#5a4a3a',
  },
  neighborKidSmall: {
    build: 'small', skin: P.skin, hair: P.hairBlonde, hairStyle: 'short', hat: 'none',
    top: 'plain', shirt: '#8ac8e8', shirt2: '#5a9ac8',
    pants: '#6a5a8a', shoes: '#5a4a3a',
  },
  mom: {
    build: 'adult', skin: P.skin, hair: '#c0682c', hairStyle: 'bun', hat: 'none',
    top: 'dress', shirt: '#f0a0b8', shirt2: '#f8d8e0',
    pants: '#f0a0b8', shoes: '#a04858',
  },
  sister: {
    build: 'small', skin: P.skin, hair: '#c0682c', hairStyle: 'ponytail', hat: 'none',
    top: 'dress', shirt: '#a8d8f0', shirt2: '#ffffff',
    pants: '#a8d8f0', shoes: '#d05868',
  },
  cop: {
    build: 'adult', skin: P.skin, hair: P.hairBlack, hairStyle: 'short',
    hat: 'peaked', hatColor: '#2c3a6a',
    top: 'coat', shirt: '#3c4c84', shirt2: '#f0d060',
    pants: '#2c3a6a', shoes: '#201828',
  },
  nurse: {
    build: 'adult', skin: P.skin, hair: '#e8c464', hairStyle: 'short',
    hat: 'nurse', hatColor: '#ffffff',
    top: 'apron', shirt: '#ffffff', shirt2: '#e05868',
    pants: '#ffffff', shoes: '#e8e8e8',
  },
  businessman: {
    build: 'adult', skin: P.skin, hair: P.hairBrown, hairStyle: 'bald', hat: 'none',
    top: 'coat', shirt: '#4a5a7a', shirt2: '#d05050',
    pants: '#3a4658', shoes: '#2a2028',
  },
  punk: {
    build: 'adult', skin: P.skin, hair: '#3a2a28', hairStyle: 'pompadour', hat: 'none',
    top: 'plain', shirt: '#7a4a9a', shirt2: '#c8a8e0',
    pants: '#3a3a4a', shoes: '#201828',
  },
  granny: {
    build: 'adult', skin: '#f0d0b0', hair: '#d8d8e0', hairStyle: 'bun', hat: 'none',
    top: 'dress', shirt: '#b8a8d8', shirt2: '#e8e0f0',
    pants: '#b8a8d8', shoes: '#6a5a68',
  },
  townsman: {
    build: 'adult', skin: '#e0a878', hair: P.hairBlack, hairStyle: 'short', hat: 'none',
    top: 'plain', shirt: '#68b878', shirt2: '#4a9a5a',
    pants: '#8a6a4a', shoes: '#4a3a2a',
  },
  townswoman: {
    build: 'adult', skin: P.skin, hair: '#7a4a28', hairStyle: 'long', hat: 'none',
    top: 'dress', shirt: '#f0c860', shirt2: '#ffffff',
    pants: '#f0c860', shoes: '#a06848',
  },
  photographer: {
    build: 'adult', skin: P.skin, hair: P.hairBrown, hairStyle: 'short',
    hat: 'hat', hatColor: '#c85838',
    top: 'coat', shirt: '#d8a850', shirt2: '#7a4a28',
    pants: '#6a5a4a', shoes: '#3a2a28',
  },
  shopkeeper: {
    build: 'stout', skin: P.skin, hair: '#5a4a3a', hairStyle: 'bald', hat: 'none',
    top: 'apron', shirt: '#6ab0d0', shirt2: '#f0ece0',
    pants: '#4a5a6a', shoes: '#3a3028',
  },
};

/**
 * Proportions. Heads are deliberately oversized — a shade under three heads
 * tall — which is what makes the cast read as characters rather than as small
 * people, and keeps them legible at this render resolution.
 */
const BUILDS = {
  kid:   { scale: 1.16, width: 1.06, head: 1.10 },
  small: { scale: 0.98, width: 1.00, head: 1.18 },
  stout: { scale: 1.16, width: 1.30, head: 1.10 },
  adult: { scale: 1.32, width: 1.10, head: 0.96 },
};

// --- primitive collection --------------------------------------------------

/**
 * A part is a list of primitives, each with a colour. They get merged into one
 * geometry with material groups, so the whole part draws in a single call.
 */
class Part {
  constructor() { this.items = []; }

  add(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geo.toNonIndexed();
    const m = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz),
      );
    g.applyMatrix4(m);
    // Keep only the attributes every primitive shares, or the merge refuses.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    this.items.push({ g, color });
    geo.dispose();
    return this;
  }

  build(name = 'part') {
    // Group by colour first so identical colours share one material group.
    const byColor = new Map();
    for (const it of this.items) {
      if (!byColor.has(it.color)) byColor.set(it.color, []);
      byColor.get(it.color).push(it.g);
    }
    const geos = [];
    const mats = [];
    for (const [color, list] of byColor) {
      const merged = list.length === 1 ? list[0] : BufferGeometryUtils.mergeGeometries(list, false);
      geos.push(merged);
      mats.push(new THREE.MeshLambertMaterial({ color }));
    }
    const geometry = BufferGeometryUtils.mergeGeometries(geos, true);
    const mesh = new THREE.Mesh(geometry, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.dynamic = true;   // characters move; never bake them
    return mesh;
  }
}

const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ballGeo = (r, seg = 8) => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
const tubeGeo = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
/**
 * Top half of a sphere. Hair and caps use this rather than a squashed ball:
 * a full sphere big enough to sit *over* the head also reaches down *around* it
 * and swallows the face, which is the one thing on a character this size that
 * has to stay readable.
 */
const domeGeo = (r, seg = 10) =>
  new THREE.SphereGeometry(r, seg, Math.max(3, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);

// --- the figure ------------------------------------------------------------

/**
 * Build a character.
 *
 * The returned group's forward is +Z, so a yaw of 0 faces the default camera.
 * Limb pivots are exposed on `parts` for the walk cycle.
 */
export function buildCharacter(cfg) {
  const b = BUILDS[cfg.build] ?? BUILDS.kid;
  const S = b.scale;
  const W = b.width;

  const root = new THREE.Group();
  const body = new THREE.Group();       // everything above the feet, for bobbing
  root.add(body);

  const skin = cfg.skin;
  const shirt = cfg.shirt;
  const shirt2 = cfg.shirt2 ?? shade(shirt, -0.2);
  const isDress = cfg.top === 'dress';

  // --- proportions (in units, before build scaling) -----------------------
  const shoeH = 0.15;
  const legLen = 0.44;
  const hipY = shoeH + legLen;          // 0.59
  const torsoH = 0.5;
  const shoulderY = hipY + torsoH;      // 1.09
  const headR = 0.33 * b.head;
  const headY = shoulderY + headR * 0.82;
  const torsoW = 0.62 * W;
  const torsoD = 0.38;

  // --- legs ---------------------------------------------------------------
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * torsoW * 0.24, hipY, 0);
    const p = new Part();
    // leg hangs down from the pivot
    p.add(boxGeo(0.19 * W, legLen, 0.20), isDress ? skin : cfg.pants, { y: -legLen / 2 });
    // oversized rounded shoe, nosing forward — the reference's signature
    p.add(boxGeo(0.26 * W, shoeH, 0.40), cfg.shoes, { y: -legLen - shoeH / 2 + 0.01, z: 0.06 });
    p.add(ballGeo(0.13, 6), cfg.shoes, { y: -legLen - shoeH / 2 + 0.02, z: 0.24, sz: 0.7 });
    const mesh = p.build('leg');
    pivot.add(mesh);
    body.add(pivot);
    legs.push(pivot);
  }

  // --- torso --------------------------------------------------------------
  const torso = new Part();
  if (isDress) {
    // bodice plus a flared skirt: a cone does the job in one primitive
    torso.add(boxGeo(torsoW * 0.9, torsoH * 0.55, torsoD), shirt, { y: hipY + torsoH * 0.72 });
    torso.add(tubeGeo(torsoW * 0.46, torsoW * 0.68, torsoH * 0.72, 10), shirt,
      { y: hipY + torsoH * 0.2 });
    torso.add(tubeGeo(torsoW * 0.69, torsoW * 0.70, 0.045, 10), shirt2,
      { y: hipY + torsoH * 0.2 - torsoH * 0.36 });
  } else {
    torso.add(boxGeo(torsoW, torsoH, torsoD), shirt, { y: hipY + torsoH / 2 });
    if (cfg.top === 'stripes') {
      // Bands rather than a texture: at this size they read cleanly and stay
      // part of the same merged mesh.
      for (let i = 0; i < 3; i++) {
        torso.add(boxGeo(torsoW * 1.012, torsoH * 0.13, torsoD * 1.012), shirt2,
          { y: hipY + torsoH * (0.22 + i * 0.26) });
      }
    } else if (cfg.top === 'coat') {
      torso.add(boxGeo(torsoW * 0.34, torsoH * 0.94, torsoD * 1.03), shade(shirt, 0.45),
        { y: hipY + torsoH * 0.52 });
      torso.add(boxGeo(torsoW * 0.13, torsoH * 0.4, torsoD * 1.05), shirt2,
        { y: hipY + torsoH * 0.66 });
    } else if (cfg.top === 'apron') {
      torso.add(boxGeo(torsoW * 0.74, torsoH * 0.62, torsoD * 1.04), shirt2,
        { y: hipY + torsoH * 0.34 });
    }
    // waistband / shorts
    torso.add(boxGeo(torsoW * 1.006, 0.13, torsoD * 1.006), cfg.pants, { y: hipY + 0.05 });
  }
  if (cfg.backpack) {
    torso.add(boxGeo(torsoW * 0.66, torsoH * 0.66, 0.16), '#d8b040',
      { y: hipY + torsoH * 0.56, z: -torsoD / 2 - 0.07 });
  }
  body.add(torso.build('torso'));

  // --- arms ---------------------------------------------------------------
  const arms = [];
  const armLen = 0.40;
  const sleeve = cfg.top === 'coat' ? shade(shirt, -0.06) : shirt;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW / 2 + 0.06), shoulderY - 0.05, 0);
    const p = new Part();
    p.add(boxGeo(0.15 * W, armLen, 0.17), isDress ? skin : sleeve, { y: -armLen / 2 });
    p.add(ballGeo(0.11, 6), skin, { y: -armLen - 0.04 });
    const mesh = p.build('arm');
    pivot.add(mesh);
    body.add(pivot);
    arms.push(pivot);
  }

  // --- head ---------------------------------------------------------------
  const headPivot = new THREE.Group();
  headPivot.position.set(0, headY, 0);
  const head = new Part();
  // slightly squashed sphere: rounder and friendlier than a cube
  head.add(ballGeo(headR, 10), skin, { sy: 0.94, sz: 0.92 });

  if (cfg.hairStyle !== 'bald') {
    // A shell over the crown plus a fringe above the eyes: without the fringe
    // the hair disappears behind the head from the front and everyone looks
    // bald in the one view the player sees most.
    head.add(domeGeo(headR * 1.04, 10), cfg.hair,
      { y: headR * 0.3, z: -headR * 0.06, sy: 0.9, sz: 1.0 });
    head.add(boxGeo(headR * 1.4, headR * 0.26, headR * 0.42), cfg.hair,
      { y: headR * 0.42, z: headR * 0.7 });
    if (cfg.hairStyle === 'long') {
      head.add(boxGeo(headR * 1.9, headR * 1.5, headR * 0.5), cfg.hair,
        { y: -headR * 0.5, z: -headR * 0.72 });
    } else if (cfg.hairStyle === 'ponytail') {
      head.add(ballGeo(headR * 0.42, 7), cfg.hair, { y: headR * 0.1, z: -headR * 1.05 });
      head.add(tubeGeo(headR * 0.2, headR * 0.1, headR * 0.9, 6), cfg.hair,
        { y: -headR * 0.4, z: -headR * 1.15, rx: 0.4 });
    } else if (cfg.hairStyle === 'bun') {
      head.add(ballGeo(headR * 0.44, 7), cfg.hair, { y: headR * 0.78, z: -headR * 0.5 });
    } else if (cfg.hairStyle === 'pompadour') {
      head.add(ballGeo(headR * 0.6, 7), cfg.hair, { y: headR * 0.82, z: headR * 0.22, sy: 1.25 });
    }
  }

  const hatColor = cfg.hatColor ?? P.capRed;
  if (cfg.hat === 'cap') {
    head.add(domeGeo(headR * 1.07, 10), hatColor, { y: headR * 0.28, sy: 0.9 });
    // The brim is short and high on purpose. From a camera 33° above, a brim
    // reaching further than about 1.2 head-radii forward puts the eyes in
    // shadow — the sightline from eye to camera clears it only just.
    head.add(boxGeo(headR * 1.55, headR * 0.11, headR * 0.86), hatColor,
      { y: headR * 0.52, z: headR * 0.6 });
    head.add(boxGeo(headR * 1.42, headR * 0.06, headR * 0.76), shade(hatColor, -0.32),
      { y: headR * 0.47, z: headR * 0.62 });
    head.add(ballGeo(headR * 0.12, 6), shade(hatColor, -0.2), { y: headR * 1.02 });
  } else if (cfg.hat === 'peaked') {
    head.add(tubeGeo(headR * 0.94, headR * 1.02, headR * 0.55, 10), hatColor, { y: headR * 0.7 });
    head.add(tubeGeo(headR * 1.04, headR * 1.04, 0.04, 10), shade(hatColor, 0.2), { y: headR * 0.98 });
    head.add(boxGeo(headR * 1.4, headR * 0.11, headR * 0.86), shade(hatColor, -0.25),
      { y: headR * 0.5, z: headR * 0.66 });
  } else if (cfg.hat === 'hat') {
    head.add(tubeGeo(headR * 1.7, headR * 1.7, 0.05, 12), shade(hatColor, -0.15), { y: headR * 0.62 });
    head.add(tubeGeo(headR * 0.86, headR * 0.94, headR * 0.75, 10), hatColor, { y: headR * 1.0 });
  } else if (cfg.hat === 'nurse') {
    head.add(boxGeo(headR * 1.1, headR * 0.3, headR * 0.8), '#ffffff', { y: headR * 0.86, z: -headR * 0.1 });
  }

  // face: two dark eyes and a small mouth, sitting proud of the sphere
  const eyeX = headR * 0.34;
  const eyeY = headR * 0.1;
  const eyeZ = headR * 0.84;
  for (const sx of [-1, 1]) {
    head.add(ballGeo(headR * 0.2, 7), P.outline,
      { x: sx * eyeX, y: eyeY, z: eyeZ, sy: 1.15, sz: 0.42 });
  }
  head.add(boxGeo(headR * 0.3, headR * 0.08, 0.03), shade(skin, -0.34),
    { y: -headR * 0.32, z: eyeZ * 0.99 });
  // cheeks
  for (const sx of [-1, 1]) {
    head.add(ballGeo(headR * 0.16, 6), '#f0a090',
      { x: sx * eyeX * 1.7, y: -headR * 0.16, z: eyeZ * 0.72, sz: 0.4 });
  }

  headPivot.add(head.build('head'));
  body.add(headPivot);

  root.scale.setScalar(S);
  root.userData = { legs, arms, headPivot, body, height: (headY + headR) * S };
  return root;
}

/** A townsdog, in the same idiom. */
export function buildDog(color = '#e8d8b0', spot = '#8a6a4a') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.13, 0.3, sz * 0.22);
    const p = new Part();
    p.add(boxGeo(0.11, 0.3, 0.12), spot, { y: -0.15 });
    pivot.add(p.build('dogleg'));
    body.add(pivot);
    legs.push(pivot);
  }

  const trunk = new Part();
  trunk.add(boxGeo(0.34, 0.32, 0.72), color, { y: 0.46 });
  trunk.add(ballGeo(0.15, 7), spot, { x: 0.06, y: 0.55, z: 0.1, sz: 1.4 });
  body.add(trunk.build('dogbody'));

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.62, 0.42);
  const head = new Part();
  head.add(ballGeo(0.21, 8), color, { sz: 1.1 });
  head.add(boxGeo(0.16, 0.12, 0.14), shade(color, -0.15), { y: -0.06, z: 0.2 });
  head.add(ballGeo(0.06, 5), P.outline, { y: -0.05, z: 0.29 });
  head.add(ballGeo(0.05, 5), P.outline, { x: -0.09, y: 0.04, z: 0.17, sz: 0.6 });
  head.add(ballGeo(0.05, 5), P.outline, { x: 0.09, y: 0.04, z: 0.17, sz: 0.6 });
  head.add(boxGeo(0.08, 0.17, 0.06), spot, { x: -0.17, y: 0.12, z: -0.02, rz: 0.3 });
  head.add(boxGeo(0.08, 0.17, 0.06), spot, { x: 0.17, y: 0.12, z: -0.02, rz: -0.3 });
  headPivot.add(head.build('doghead'));
  body.add(headPivot);

  const tail = new THREE.Group();
  tail.position.set(0, 0.6, -0.36);
  const t = new Part();
  t.add(boxGeo(0.08, 0.26, 0.08), spot, { y: 0.1, rx: -0.5 });
  tail.add(t.build('dogtail'));
  body.add(tail);

  root.scale.setScalar(1.25);
  root.userData = { legs, arms: [], headPivot, body, tail, height: 1.06 };
  return root;
}

/**
 * Drive the walk cycle.
 *
 * `phase` advances with distance travelled, so the stride stays tied to speed
 * rather than to the frame rate. When still, the figure breathes.
 */
export function poseCharacter(model, phase, moving, t = 0) {
  const { legs, arms, headPivot, body, tail } = model.userData;
  if (!legs) return;

  if (moving) {
    const swing = Math.sin(phase) * 0.62;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    for (let i = 0; i < arms.length; i++) {
      arms[i].rotation.x = (i === 0 ? -swing : swing) * 0.75;
      arms[i].rotation.z = (i === 0 ? -1 : 1) * 0.08;
    }
    if (legs.length === 4) {
      // dogs trot: diagonal pairs together
      legs[0].rotation.x = swing;
      legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
    }
    body.position.y = Math.abs(Math.sin(phase)) * 0.045;
    body.rotation.z = Math.sin(phase) * 0.02;
    if (headPivot) headPivot.rotation.z = -Math.sin(phase) * 0.03;
  } else {
    const breathe = Math.sin(t * 2.1) * 0.5 + 0.5;
    for (const l of legs) l.rotation.x *= 0.8;
    for (const a of arms) {
      a.rotation.x *= 0.8;
      a.rotation.z = (a.position.x < 0 ? -1 : 1) * (0.07 + breathe * 0.015);
    }
    body.position.y = breathe * 0.012;
    body.rotation.z *= 0.8;
    if (headPivot) headPivot.rotation.z *= 0.8;
  }
  if (tail) tail.rotation.y = Math.sin(t * 6) * 0.5;
}
