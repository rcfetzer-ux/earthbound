/**
 * ONETT — laid out from the town map.
 *
 * The town is a street grid on flat ground: three roads running east–west,
 * three running north–south, and four blocks between them. City hall stands in
 * a park in the north-west block, a terrace of tall downtown buildings fills
 * the north-east, and the shops face each other across the middle street from
 * the two southern blocks. Houses, the hotel, the hospital and the police
 * station ring the outside of the grid. A lane runs north-east from the top
 * corner to your house and the neighbours'.
 *
 * Everything the town is built on is dead flat. There are no terraces and no
 * stairs anywhere outdoors: the previous version cut the map into shelves, and
 * what you felt walking around it was the seams between them — hard straight
 * edges at arbitrary places with boulders jutting out of them. A town built on
 * a grid should sit on level ground, and the land should only start moving
 * once the town stops.
 *
 * Two ways out, and the ground rises into wooded hills everywhere else:
 *
 *   south   the road to Twoson, through a gap in the trees, behind a barricade
 *   north   a dirt track that becomes a valley, meandering up between the hills
 *           to where the meteorite came down
 *
 * This is drawn from the shape of the original's map — the landmarks, the grid,
 * and the way they connect — rather than from a copy of it.
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';
import { T, repeated, signTexture, rng } from '../core/tex.js';
import {
  Zone, addSky, addClouds, addOutdoorLight, addBackdrop, pave, kerb,
} from './zone.js';
import { makeOnettLand, landMesh, landTrail, scatterLand } from './terrain.js';
import { timePreset, DEFAULT_TIME } from './daylight.js';
import {
  building, gable, tree, hedge, fence, lamp, signPost, car, bush, flowerPatch,
  grassTufts, box, flatMat, mat, decal,
} from './build.js';
import { Actor } from '../entities/actor.js';

// --- level constants -------------------------------------------------------

/** The town is flat. These are all the same height now, and stay for callers. */
export const SOUTH_Y = 0;
export const MAIN_Y = 0;
export const HOUSE_Y = 0;
export const TOWN_Y = 0;
export const SHELF_Y = 0;
export const HILL_Y = 15.0;

const BOUNDS = { x0: -150, x1: 150, z0: -210, z1: 150 };

/** The flat plain the town stands on. Past this the ground lifts into woods. */
const TOWN = { x0: -96, x1: 96, z0: -80, z1: 90 };

/** Where the meteorite came down, far out in the hills to the north-west. */
const IMPACT = { x: -46, z: -170 };

// --- the street grid -------------------------------------------------------
//
// Roads are 10 across with a 3.4 pavement each side. Naming everything once
// here means the blocks, the buildings and the pavements cannot drift apart.

// The reference map's streets are pale bands with the blocks green right up
// to them. The first pass used a 10-wide road with a 3.4 pavement each side,
// which is 17 across per street — six of those turned the whole grid into one
// concrete slab with buildings sitting on it.
const ROAD_H = 4.5;       // half the roadway
const WALK_W = 2.2;
const AVE = [-62, 0, 62];       // north–south road centres
const ST = [-32, 14, 60];       // east–west road centres

const GRID = {
  x0: AVE[0] - ROAD_H - WALK_W,   // -64.4
  x1: AVE[2] + ROAD_H + WALK_W,   //  64.4
  z0: ST[0] - ROAD_H - WALK_W,    // -36.4
  z1: ST[2] + ROAD_H + WALK_W,    //  60.4
};

/** The lane north-east to your house. */
const LANE_Z = -78;

const HOUSE_H = 2.7;      // per storey
const SHOP_H = 3.7;

export function buildOnett(timeName = DEFAULT_TIME) {
  const zone = new Zone('onett', 'ONETT');
  zone.music = 'town';
  const ctx = { solids: zone.solids, doors: zone.doors };
  const S = zone.scene;

  const preset = timePreset(timeName);
  S.fog = new THREE.Fog(preset.fog.color, preset.fog.near, preset.fog.far);
  const sky = addSky(S, preset);
  const clouds = addClouds(S, 11, preset);
  const light = addOutdoorLight(S, preset);
  zone.light = light;
  addBackdrop(S, { radius: 300, seed: 5 });
  zone.onUpdate((dt) => clouds.update(dt));

  zone.applyTime = (p) => {
    sky.applyTime(p);
    clouds.applyTime(p);
    light.applyTime(p);
    S.fog.color.set(p.fog.color);
    S.fog.near = p.fog.near;
    S.fog.far = p.fog.far;
    // Smoke is unlit, so it has to be tinted by hand or it glows after dark.
    for (const m of zone.smokeMats ?? []) m.color.set(p.smokeTint);
  };

  // ======================================================================
  // The land: one height function, no terraces, no seams
  // ======================================================================

  const land = makeOnettLand({
    seed: 5, town: TOWN, mouthX: -30, impact: IMPACT,
    northZ: BOUNDS.z0, topY: 15.0, gateX: 0,
  });
  zone.land = land;
  zone.country = land;                       // kept for the older tooling
  zone.ground.field(-168, -238, 168, 168, land.height, { maxSlope: 0.75, tag: 'land' });
  S.add(landMesh(land, { x0: -170, x1: 170, z0: -240, z1: 170, step: 5.0 }));
  S.add(landTrail(land, { from: TOWN.z0 + 2, to: IMPACT.z + 5, segments: 86 }));

  // ======================================================================
  // Streets
  // ======================================================================

  for (const cx of AVE) {
    const z0 = cx === AVE[2] ? LANE_Z : GRID.z0;      // the east avenue runs on north
    pave(zone, cx - ROAD_H, z0, cx + ROAD_H, GRID.z1, 0, T.concrete(), 9, 'stone');
    pave(zone, cx - ROAD_H - WALK_W, z0, cx - ROAD_H, GRID.z1, 0, T.walk(), 6);
    pave(zone, cx + ROAD_H, z0, cx + ROAD_H + WALK_W, GRID.z1, 0, T.walk(), 6);
    kerb(zone, cx - ROAD_H - 0.1, z0, cx - ROAD_H + 0.1, GRID.z1, 0, 0.13);
    kerb(zone, cx + ROAD_H - 0.1, z0, cx + ROAD_H + 0.1, GRID.z1, 0, 0.13);
  }
  for (const cz of ST) {
    pave(zone, GRID.x0, cz - ROAD_H, GRID.x1, cz + ROAD_H, 0, T.concrete(), 9, 'stone');
    pave(zone, GRID.x0, cz - ROAD_H - WALK_W, GRID.x1, cz - ROAD_H, 0, T.walk(), 6);
    pave(zone, GRID.x0, cz + ROAD_H, GRID.x1, cz + ROAD_H + WALK_W, 0, T.walk(), 6);
    kerb(zone, GRID.x0, cz - ROAD_H - 0.1, GRID.x1, cz - ROAD_H + 0.1, 0, 0.13);
    kerb(zone, GRID.x0, cz + ROAD_H - 0.1, GRID.x1, cz + ROAD_H + 0.1, 0, 0.13);
  }
  // The junctions: re-lay the roadway over the pavement so corners read open.
  for (const cx of AVE) {
    for (const cz of ST) {
      pave(zone, cx - ROAD_H, cz - ROAD_H, cx + ROAD_H, cz + ROAD_H, 0, T.concrete(), 9, 'stone');
    }
  }

  // The dirt roads out of town: south to Twoson, north-west to the hills.
  pave(zone, -5, GRID.z1, 5, 132, 0, T.dirtPath(), 8, 'dirt');
  pave(zone, -35, TOWN.z0 + 4, -25, GRID.z0, 0, T.dirtPath(), 8, 'dirt');

  // ======================================================================
  // NW block — city hall in its park
  // ======================================================================

  const blockNW = { x0: AVE[0] + 6.7, x1: AVE[1] - 6.7, z0: ST[0] + 6.7, z1: ST[1] - 6.7 };

  const hall = building({
    name: 'city hall', x: -31, z: -3, y: 0, w: 22, d: 13, h: 4.6,
    wall: P.wallCream, wallTex: 'stucco', roof: P.roofGreen, roofType: 'hip', roofH: 2.6,
    cornice: true, pilasters: true, base: { tex: 'stone', h: 1.0 }, yaw: 0.006,
    sign: { text: 'CITY HALL', bg: '#3a7a52', fg: '#fff6e0', side: 'south', y: 3.3, w: 8.5, h: 1.1 },
    doors: [{ side: 'south', offset: 0, target: null, label: 'CITY HALL' }],
    windows: [
      { side: 'south', offset: -8.4, y: 1.3, w: 1.4, h: 2.1 },
      { side: 'south', offset: 8.4, y: 1.3, w: 1.4, h: 2.1 },
      { side: 'east', offset: 0, y: 1.4, w: 1.5, h: 1.6 },
      { side: 'west', offset: 0, y: 1.4, w: 1.5, h: 1.6 },
    ],
  }, ctx);
  // The portico: the one piece of civic swagger in Onett.
  const colMat = mat(repeated(T.concrete(), 1, 3), 0xf0ece0);
  for (const cx of [-4.4, -1.5, 1.5, 4.4]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 4.4, 8), colMat);
    col.position.set(cx, 2.2, 7.4);
    col.castShadow = true;
    hall.add(col);
  }
  hall.add(box(11.0, 0.4, 1.6, flatMat('#efe9dc'), 0, 4.4, 7.4));
  // The pediment: a shallow triangular prism over the portico. Built from the
  // gable primitive rather than a 3-sided cylinder, which comes out as a
  // tetrahedron the size of the building.
  const ped = gable(11.4, 1.7, 1.9, flatMat('#efe9dc'), 'x');
  ped.position.set(0, 4.8, 7.4);
  hall.add(ped);
  S.add(hall);
  pave(zone, -33.5, 3.5, -28.5, 7.3, 0, T.walk(), 4);

  parkBlock(zone, S, ctx, blockNW, { skip: { x0: -44, x1: -18, z0: -11, z1: 5 }, seed: 3 });
  S.add(flowerPatch(-51, -12, 0, 9));
  S.add(flowerPatch(-13, -14, 0, 9));

  // ======================================================================
  // NE block — the downtown terrace
  // ======================================================================

  const rowColours = [
    [P.brick, '#8c3a30'], ['#b0574a', '#7a3830'], [P.wallTan, '#96543a'],
    ['#a44a4a', '#7c3436'], ['#c07a52', '#8a5236'],
  ];
  rowColours.forEach(([wall, roof], i) => {
    S.add(building({
      name: 'downtown', x: 9.5 + i * 9.5, z: -3, y: 0, w: 7.2, d: 13,
      h: 2.9, storeys: 3, wall, wallTex: i % 2 ? 'brick' : 'stucco',
      roof, roofType: 'flat', cornice: shade(roof, 0.12),
      base: { tex: 'stone', h: 0.8 }, pilasters: true,
      yaw: (i % 2 ? 0.01 : -0.008),
      doors: [{ side: 'south', offset: 0, target: null, label: 'OFFICES' }],
      windows: [
        { side: 'south', offset: -2.1, y: 3.4, w: 1.2, h: 1.4 },
        { side: 'south', offset: 2.1, y: 3.4, w: 1.2, h: 1.4 },
        { side: 'south', offset: -2.1, y: 6.2, w: 1.2, h: 1.4, lit: i === 3 },
        { side: 'south', offset: 2.1, y: 6.2, w: 1.2, h: 1.4 },
      ],
    }, ctx));
  });
  for (let x = 9; x < 54; x += 6.5) S.add(tree(x, -15 - (x % 13) * 0.4, 0, { scale: 0.95 }, ctx));

  // ======================================================================
  // SW block — the shops, facing north across the middle street
  // ======================================================================

  const shopRow = [
    {
      name: 'drug store', x: -45, w: 13, wall: P.brick, wallTex: 'brick', roof: P.roofRed,
      sign: 'DRUG STORE', signBg: '#c03a30', icon: 'pill', awn: ['#3f9c4a', '#f4f0e2', true],
      target: 'drugstore',
    },
    {
      name: 'bakery', x: -30, w: 11, wall: P.wallCream, wallTex: 'stucco', roof: P.roofOrange,
      sign: 'BAKERY', signBg: '#e0872c', icon: 'bread', awn: ['#e0872c', '#f4f0e2', false],
    },
    {
      name: 'burger shop', x: -16, w: 11, wall: P.wallSalmon, wallTex: 'stucco', roof: '#d8563c',
      sign: 'BURGER', signBg: '#c03a30', icon: 'burger', awn: ['#f0c040', '#f4f0e2', false],
    },
  ];
  shopRow.forEach((s, i) => S.add(shopfront(s, 27.5, 'north', i, ctx)));

  // ======================================================================
  // SE block — the arcade and the library
  // ======================================================================

  const arcade = building({
    name: 'arcade', x: 20, z: 27.5, y: 0, w: 15, d: 12, h: 3.9,
    wall: P.wallLilac, wallTex: 'stucco', roof: '#6a4a9a', roofType: 'flat',
    cornice: '#5a3a86', base: { tex: 'cobble', h: 0.7 }, pilasters: true, yaw: 0.01,
    sign: { text: 'ARCADE', bg: '#4a2a6a', fg: '#ffe060', icon: 'arcade', side: 'north', y: 3.1, w: 8, h: 1.3 },
    doors: [{ side: 'north', offset: 0, target: 'arcade', spawn: 'front', kind: 'glass', label: 'ARCADE' }],
    windows: [
      { side: 'north', offset: -4.8, y: 0.9, w: 2.6, h: 1.6, lit: true },
      { side: 'north', offset: 4.8, y: 0.9, w: 2.6, h: 1.6, lit: true },
    ],
  }, ctx);
  // A chase of bulbs over the door — the one thing on the street that moves.
  const bulbs = [];
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe060 }),
    );
    b.userData.dynamic = true;
    b.position.set(-4.4 + i * 0.8, 3.95, -6.3);
    arcade.add(b);
    bulbs.push(b);
  }
  zone.onUpdate((dt, t) => {
    for (let i = 0; i < bulbs.length; i++) {
      bulbs[i].material.color.setHex((Math.floor(t * 6) + i) % 3 === 0 ? 0xfff0a0 : 0x8a6a30);
    }
    void dt;
  });
  S.add(arcade);

  S.add(shopfront({
    name: 'library', x: 43, w: 13, wall: P.wallTan, wallTex: 'stucco', roof: P.roofGreen,
    sign: 'LIBRARY', signBg: '#3a7a52', icon: 'book', awn: null,
  }, 27.5, 'north', 1, ctx));

  // Houses backing onto the south street from both southern blocks.
  for (const [x, wall, roof] of [
    [-45, P.wallMint, P.roofPurple], [-20, P.wallSky, P.roofBlue],
    [20, P.wallSalmon, P.roofGrey], [45, P.wallCream, P.roofRed],
  ]) {
    S.add(building({
      name: 'house', x, z: 44, y: 0, w: 11, d: 10, h: HOUSE_H, storeys: 2,
      wall, wallTex: 'siding', roof, roofType: x % 2 ? 'hip' : 'gable', ridge: 'x',
      roofH: 1.9, chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 },
      yaw: (x > 0 ? 0.016 : -0.014),
      doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
      windows: [
        { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4, shutters: roof },
        { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4, shutters: roof },
        { side: 'south', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
      ],
    }, ctx));
    S.add(fence(x - 4, 51.6, 0, 5, 'x', ctx, P.wallWhite));
    S.add(fence(x + 4.6, 51.6, 0, 5, 'x', ctx, P.wallWhite));
    pave(zone, x - 1.4, 49, x + 1.4, 53.3, 0, T.walk(), 4);
    S.add(mailbox(x + 2.6, 52.1, 0, ctx));
  }

  // ======================================================================
  // The ring outside the grid
  // ======================================================================

  // North side: the hotel and a row of small places facing the top street.
  S.add(building({
    name: 'hotel', x: -50, z: -47, y: 0, w: 16, d: 11, h: 2.8, storeys: 2,
    wall: P.wallSky, wallTex: 'siding', roof: P.roofBlue, roofType: 'hip', roofH: 2.1,
    trim: P.wallWhite, cornice: true, base: { tex: 'stone', h: 0.6 }, yaw: -0.01,
    sign: { text: 'HOTEL', bg: P.roofBlue, fg: '#ffffff', icon: 'bed', side: 'south', y: 2.5, w: 6, h: 1.1 },
    awning: { color: P.roofBlue, color2: '#e8f0f8', w: 4.6, side: 'south', y: 1.95 },
    doors: [{ side: 'south', offset: 0, target: 'hotel', spawn: 'front', kind: 'glass', label: 'HOTEL' }],
    windows: [
      { side: 'south', offset: -5.4, y: 0.9, w: 1.7, h: 1.3 },
      { side: 'south', offset: 5.4, y: 0.9, w: 1.7, h: 1.3 },
      { side: 'south', offset: -5.4, y: 3.7, w: 1.5, h: 1.3 },
      { side: 'south', offset: 0, y: 3.7, w: 1.5, h: 1.3 },
      { side: 'south', offset: 5.4, y: 3.7, w: 1.5, h: 1.3, lit: true },
    ],
  }, ctx));
  pave(zone, -51.4, -41.5, -48.6, -38.7, 0, T.walk(), 4);

  for (const [x, wall, roof, label] of [
    [-18, P.wallCream, P.roofOrange, 'HOUSE'],
    [14, P.wallMint, P.roofRed, 'HOUSE'],
    [46, P.wallSalmon, P.roofGrey, 'HOUSE'],
  ]) {
    S.add(building({
      name: 'house', x, z: -47, y: 0, w: 11, d: 10, h: HOUSE_H, storeys: 2,
      wall, wallTex: 'siding', roof, roofType: 'gable', ridge: 'x', roofH: 1.9,
      chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.014,
      doors: [{ side: 'south', offset: 0, target: null, label }],
      windows: [
        { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
        { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
        { side: 'south', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
      ],
    }, ctx));
    pave(zone, x - 1.4, -42, x + 1.4, -38.7, 0, T.walk(), 4);
  }

  // West side: the hospital, turned to face the avenue.
  const hospital = building({
    name: 'hospital', x: -79, z: 14, y: 0, w: 14, d: 20, h: 4.2,
    wall: P.wallWhite, wallTex: 'stucco', roof: '#c8c4b8', roofType: 'flat',
    cornice: '#dfe6ea', pilasters: true, base: { tex: 'stone', h: 0.7 },
    signBand: { y: 3.1 }, yaw: -0.008,
    sign: { text: 'HOSPITAL', bg: '#eef4f8', fg: '#d04848', icon: 'cross', side: 'east', y: 3.15, w: 9, h: 1.2 },
    doors: [{ side: 'east', offset: 0, target: 'hospital', spawn: 'front', kind: 'glass', label: 'HOSPITAL' }],
    windows: [
      { side: 'east', offset: -6.5, y: 1.1, w: 2.0, h: 1.5 },
      { side: 'east', offset: 6.5, y: 1.1, w: 2.0, h: 1.5 },
      { side: 'north', offset: 0, y: 1.3, w: 1.6, h: 1.5 },
      { side: 'south', offset: 0, y: 1.3, w: 1.6, h: 1.5 },
    ],
  }, ctx);
  const crossMat = flatMat('#d04848');
  const cross = new THREE.Group();
  cross.add(box(0.14, 0.42, 1.3, crossMat, 0, 0, 0));
  cross.add(box(0.14, 1.3, 0.42, crossMat, 0, -0.44, 0));
  cross.position.set(7.2, 5.1, 0);
  hospital.add(cross);
  S.add(hospital);
  pave(zone, -72, 12.6, -68.7, 15.4, 0, T.walk(), 4);

  // East side: two houses turned in toward the avenue.
  for (const [z, wall, roof] of [[-6, P.wallCream, P.roofRed], [36, P.wallLilac, P.roofPurple]]) {
    S.add(building({
      name: 'house', x: 79, z, y: 0, w: 12, d: 10, h: HOUSE_H, storeys: 2,
      wall, wallTex: 'siding', roof, roofType: 'gable', ridge: 'z', roofH: 1.9,
      chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.012,
      doors: [{ side: 'west', offset: 0, target: null, label: 'HOUSE' }],
      windows: [
        { side: 'west', offset: -3.0, y: 1.0, w: 1.3, h: 1.4 },
        { side: 'west', offset: 3.0, y: 1.0, w: 1.3, h: 1.4 },
        { side: 'west', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
      ],
    }, ctx));
    pave(zone, 68.7, z - 1.4, 73, z + 1.4, 0, T.walk(), 4);
    S.add(fence(70, z - 6.4, 0, 8, 'x', ctx, P.wallWhite));
    S.add(fence(70, z + 6.4, 0, 8, 'x', ctx, P.wallWhite));
  }

  // South side: the police station and two more houses.
  S.add(building({
    name: 'police station', x: -34, z: 74, y: 0, w: 15, d: 11, h: 3.6,
    wall: P.wallTan, wallTex: 'brick', roof: P.roofBlue, roofType: 'gable', ridge: 'x',
    roofH: 1.8, cornice: true, base: { tex: 'stone', h: 0.7 }, pilasters: true, yaw: 0.012,
    sign: { text: 'POLICE', bg: '#2c3a6a', fg: '#f0f4ff', icon: 'shield', side: 'north', y: 2.5, w: 7, h: 1.1 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'POLICE STATION' }],
    windows: [
      { side: 'north', offset: -4.6, y: 1.0, w: 1.4, h: 1.4 },
      { side: 'north', offset: 4.6, y: 1.0, w: 1.4, h: 1.4 },
    ],
  }, ctx));
  pave(zone, -35.4, 66.7, -32.6, 68.6, 0, T.walk(), 4);
  for (const [x, wall, roof] of [[16, P.wallMint, P.roofGreen], [46, P.wallSky, P.roofRed]]) {
    S.add(building({
      name: 'house', x, z: 74, y: 0, w: 11, d: 10, h: HOUSE_H, storeys: 2,
      wall, wallTex: 'siding', roof, roofType: 'gable', ridge: 'x', roofH: 1.9,
      chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: -0.014,
      doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
      windows: [
        { side: 'north', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
        { side: 'north', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
      ],
    }, ctx));
    pave(zone, x - 1.4, 66.7, x + 1.4, 68.6, 0, T.walk(), 4);
  }

  // ======================================================================
  // The lane north-east: your house and the neighbours'
  // ======================================================================

  S.add(building({
    name: "player's house", x: 44, z: -64, y: 0, w: 12, d: 10,
    h: HOUSE_H, storeys: 2, wall: P.wallCream, wallTex: 'siding',
    roof: P.roofRed, roofType: 'gable', ridge: 'z', roofH: 2.1, roofOverhang: 0.8,
    chimney: true, trim: shade(P.wallCream, -0.22), cornice: true,
    base: { tex: 'stone', h: 0.6 }, yaw: -0.02, roofTilt: 0.016,
    doors: [{ side: 'east', offset: 0, target: 'nessHouse', spawn: 'front', label: 'HOME' }],
    windows: [
      { side: 'east', offset: -3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofRed },
      { side: 'east', offset: 3.2, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'east', offset: -3.2, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'south', offset: 0, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'north', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));
  pave(zone, 50, -65.4, 55.3, -62.6, 0, T.walk(), 4);
  S.add(fence(51.6, -70, 0, 8, 'z', ctx, P.wallWhite));
  S.add(fence(51.6, -58, 0, 8, 'z', ctx, P.wallWhite));
  S.add(mailbox(51.8, -60.6, 0, ctx));
  S.add(tree(36, -72, 0, { scale: 1.1 }, ctx));
  S.add(flowerPatch(40, -55, 0, 8));

  S.add(building({
    name: 'neighbours', x: 79, z: -64, y: 0, w: 12, d: 10,
    h: HOUSE_H, storeys: 2, wall: P.wallSky, wallTex: 'siding',
    roof: P.roofBlue, roofType: 'gable', ridge: 'z', roofH: 2.1, roofOverhang: 0.8,
    chimney: true, trim: P.wallWhite, cornice: true,
    base: { tex: 'stone', h: 0.6 }, yaw: 0.025, roofTilt: -0.014,
    doors: [{ side: 'west', offset: 0, target: 'neighborHouse', spawn: 'front', label: "NEIGHBOUR'S HOUSE" }],
    windows: [
      { side: 'west', offset: -3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofBlue },
      { side: 'west', offset: 3.2, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'west', offset: -3.2, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'south', offset: 0, y: 1.0, w: 1.3, h: 1.4 },
    ],
  }, ctx));
  pave(zone, 68.7, -65.4, 73, -62.6, 0, T.walk(), 4);
  S.add(fence(71.4, -70, 0, 8, 'z', ctx, P.wallWhite));
  S.add(fence(71.4, -58, 0, 8, 'z', ctx, P.wallWhite));
  S.add(mailbox(71.2, -60.6, 0, ctx));
  S.add(tree(89, -70, 0, { scale: 1.2 }, ctx));

  // The lane dead-ends here, with the town sign at the turn.
  S.add(signPost(55, -80, 0, 'ONETT', ctx, { bg: '#3a7a52', fg: '#fff6e0', rotation: -0.3 }));

  // ======================================================================
  // The two ways out
  // ======================================================================

  // North-west: the track up to the hills, behind a police cordon.
  for (const bx of [-33.5, -26.5]) S.add(barricade(bx, -54, 0, ctx, 'x'));
  S.add(signPost(-21, -52, 0, 'KEEP OUT', ctx,
    { bg: '#f0e0a0', fg: '#c03828', rotation: 2.7 }));
  zone.interactables.push({
    x: -30, z: -76, r: 5.0, name: 'the way north',
    lines: ['The track gives out here. Past this it is all hills.',
      'Somewhere out there, still smoking, is whatever came down last night.'],
  });

  // South: the road to Twoson, past another cordon.
  for (const bx of [-2.5, 2.5]) S.add(barricade(bx, 88, 0, ctx, 'x'));
  S.add(signPost(-12, 84, 0, '< TWOSON', ctx, { rotation: 0.35 }));
  zone.interactables.push({
    x: 0, z: 96, r: 5.0, name: 'road south',
    lines: ['The road south leaves town toward Twoson.',
      'Not today. There is still too much of Onett left to see.'],
  });

  // ======================================================================
  // Street furniture
  // ======================================================================

  for (const cz of ST) {
    for (let x = GRID.x0 + 8; x < GRID.x1; x += 22) {
      S.add(lamp(x, cz - ROAD_H - 1.6, 0, ctx));
      S.add(lamp(x + 11, cz + ROAD_H + 1.6, 0, ctx));
    }
  }
  for (const cx of AVE) {
    for (let z = GRID.z0 + 14; z < GRID.z1 - 8; z += 26) {
      S.add(lamp(cx - ROAD_H - 1.6, z, 0, ctx));
    }
  }

  const poles = [];
  for (let x = -62; x <= 62; x += 20.7) {
    S.add(telephonePole(x, ST[2] + ROAD_H + 2.4, 0, ctx));
    poles.push({ x, y: 6.4, z: ST[2] + ROAD_H + 2.4 });
  }
  for (let i = 0; i < poles.length - 1; i++) S.add(wire(poles[i], poles[i + 1]));

  for (const [x, z, ry, colour] of [
    [-56, -14, 0, '#d05050'], [0, 30, Math.PI, '#f0d060'], [56, 22, 0, '#58a878'],
    [-40, 12, Math.PI / 2, '#8a7ab8'], [26, -28, -Math.PI / 2, '#d8d0c0'],
    [-14, 52, Math.PI / 2, '#6a9ad0'],
  ]) S.add(car(x, z, 0, ry, colour, ctx));

  for (const [x, z] of [[-51.5, 4.6], [4.6, 19.6], [51.5, -20], [-8.4, 60]]) {
    S.add(hydrant(x, z, 0, ctx));
  }
  for (const [x, z, ry] of [
    [-36, 5.2, Math.PI], [-8, 19, 0], [22, 5.2, Math.PI], [44, 19, 0],
    [-60, 34, Math.PI / 2], [30, 45.4, Math.PI],
  ]) S.add(bench(x, z, 0, ry, ctx));
  for (const [x, z] of [[-19, 5.4], [12, 19.4], [48, 5.4], [-52, 45]]) {
    S.add(trashCan(x, z, 0, ctx));
  }
  S.add(vendingMachine(9.6, 19.6, 0, ctx));
  S.add(busStop(-64, 18.6, 0, ctx));

  // ======================================================================
  // Planting: the town sits in woodland, and the hills are wooded too
  // ======================================================================

  const occupied = () => [...zone.surfaces, ...zone.solids.rects];

  // Everything already paved or built on, so nothing gets planted through it.
  // This has to be gathered before any planting starts: the first version put
  // the street trees down first, and a whole row of them ended up standing
  // inside the buildings along the top street, with one across a front door.
  const blocked = occupied();
  const freeOf = (x, z, pad = 2.4) => !blocked.some(
    (r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad,
  );

  // Street trees, on the verges between the pavement and the buildings.
  const wob = rng(4242);
  const jog = (v, a) => v + (wob() - 0.5) * 2 * a;
  for (const cz of ST) {
    for (let x = GRID.x0 + 4; x < GRID.x1; x += 9) {
      for (const [tx, tz] of [
        [jog(x, 1.6), jog(cz - ROAD_H - WALK_W - 2.2, 0.8)],
        [jog(x + 4, 1.6), jog(cz + ROAD_H + WALK_W + 2.2, 0.8)],
      ]) {
        if (!freeOf(tx, tz, 2.6)) continue;
        S.add(tree(tx, tz, 0, { scale: 0.85 + wob() * 0.3 }, ctx));
      }
    }
  }
  // On the plain: trees on every scrap of ground the town is not using. The
  // reference map is woodland with a town cut into it, not a town with a few
  // trees in it, and the first pass read as the latter — big empty lawns
  // inside the blocks and a bare margin all round.
  scatterLand(land, {
    x0: TOWN.x0 - 6, x1: TOWN.x1 + 6, z0: TOWN.z0 - 6, z1: TOWN.z1 + 6,
    count: 760, seed: 12,
    want: (x, y, z, i) => land.onPlain(x, z) && freeOf(x, z, 3.0),
    place: (x, y, z, i) => {
      // Detailed canopies near the streets where you walk; single blobs out
      // in the margins, which is most of them.
      const near = Math.abs(x) < GRID.x1 + 10 && z > GRID.z0 - 10 && z < GRID.z1 + 10;
      S.add(tree(x, z, y, {
        scale: 0.85 + i.rand() * 0.45,
        kind: i.rand() > 0.7 ? 'pine' : 'round',
        simple: !near,
      }, ctx));
    },
  });
  // And off it: the woods the town sits in, and the hillsides beyond.
  scatterLand(land, {
    x0: -160, x1: 160, z0: -230, z1: 150, count: 620, seed: 17,
    want: (x, y, z, i) => !land.onPlain(x, z) && i.slope < 1.7
      && land.fromImpact(x, z) > 30 && freeOf(x, z, 2.0),
    place: (x, y, z, i) => {
      S.add(tree(x, z, y, {
        scale: 0.9 + i.rand() * 0.5,
        kind: i.rand() > 0.45 ? 'pine' : 'round',
        simple: true,
      }));
    },
  });

  // Boulders where the ground steepens, scrub at the break of slope.
  const stone = mat(repeated(T.stoneCourse(), 1, 1), 0xa8a49c);
  scatterLand(land, {
    x0: -150, x1: 150, z0: -220, z1: 140, count: 80, seed: 14,
    want: (x, y, z, i) => i.slope > 0.45 && i.slope < 1.8 && land.fromImpact(x, z) > 26,
    place: (x, y, z, i) => {
      const r = 0.55 + i.rand() * 0.9;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
      m.position.set(x, y + r * 0.35, z);
      m.rotation.set(x, z, r);
      m.castShadow = true;
      S.add(m);
    },
  });
  scatterLand(land, {
    x0: -140, x1: 140, z0: -210, z1: 140, count: 120, seed: 15,
    want: (x, y, z, i) => i.slope > 0.1 && i.slope < 0.9 && land.fromImpact(x, z) > 24
      && (!land.onPlain(x, z) || freeOf(x, z, 3.0)),
    place: (x, y, z, i) => S.add(bush(x, z, y, null, { scale: 0.7 + i.rand() * 0.7 })),
  });
  scatterLand(land, {
    x0: -110, x1: 60, z0: -205, z1: TOWN.z0, count: 40, seed: 16,
    want: (x, y, z, i) => i.off < 0.3 && i.slope < 0.35 && land.fromImpact(x, z) > 24,
    place: (x, y, z) => S.add(flowerPatch(x, z, y, 6)),
  });

  // ======================================================================
  // Tall grass, dropped onto whatever the ground is doing underneath
  // ======================================================================

  const paved = occupied();
  const townTufts = grassTufts(TOWN.x0 - 12, TOWN.z0 - 6, TOWN.x1 + 12, TOWN.z1 + 12, 0, {
    count: 620, seed: 21, avoid: paved, scale: 1.15,
  });
  if (townTufts) S.add(townTufts);
  const wildTufts = grassTufts(-140, -206, 140, TOWN.z0, 0, {
    count: 430, seed: 31, scale: 1.35,
    heightAt: land.height,
    want: (x, z) => land.slope(x, z) < 0.7
      && Math.abs(x - land.spineX(z)) > 3.4
      && land.fromImpact(x, z) > 13,
  });
  if (wildTufts) S.add(wildTufts);

  // ======================================================================
  // The impact site
  // ======================================================================

  buildImpactSite(zone, S, ctx, land);

  // ======================================================================
  // Spawns and cast
  // ======================================================================

  zone.addSpawn('start', 54.6, -64, 0, 'left');
  zone.addSpawn('front', 54.6, -64, 0, 'left');
  zone.addSpawn('neighborHouse', 69.4, -64, 0, 'right');
  zone.addSpawn('drugstore', -45, 18.9, 0, 'up');
  zone.addSpawn('arcade', 20, 18.9, 0, 'up');
  zone.addSpawn('hotel', -50, -37.6, 0, 'down');
  zone.addSpawn('hospital', -67.9, 14, 0, 'left');

  populateOnett(zone, land);
  return zone;
}

// --- pieces of the town ----------------------------------------------------

/**
 * A shopfront in one of the blocks. All of them share a silhouette — base
 * course, sign band, awning, steep roof — so the row reads as one street of
 * shops rather than as a line of unrelated boxes.
 */
function shopfront(s, z, side, i, ctx) {
  return building({
    name: s.name, x: s.x, z, y: 0, w: s.w, d: 12, h: SHOP_H,
    wall: s.wall, wallTex: s.wallTex, roof: s.roof, roofType: 'gable', ridge: 'x',
    roofH: 2.3, roofOverhang: 0.32, cornice: true, pilasters: true,
    base: { tex: 'cobble', h: 0.7 }, signBand: { y: SHOP_H - 1.05 },
    yaw: (i % 2 ? 0.014 : -0.012), roofTilt: (i % 2 ? -0.015 : 0.013),
    sign: {
      text: s.sign, bg: s.signBg, fg: '#fff6e0', icon: s.icon,
      side, y: SHOP_H - 1.05, w: s.w * 0.78, h: 1.05,
    },
    awning: s.awn
      ? { color: s.awn[0], color2: s.awn[1], check: s.awn[2], w: s.w * 0.66, side, y: 1.95 }
      : false,
    doors: [{
      side, offset: 0, target: s.target ?? null,
      spawn: 'front', kind: 'glass', label: s.sign,
    }],
    windows: [
      { side, offset: -s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
      { side, offset: s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
    ],
  }, ctx);
}

/**
 * Fill a block with park: lawn, trees, paths across the diagonals.
 * `skip` is a rectangle the planting keeps out of, for whatever stands there.
 */
function parkBlock(zone, S, ctx, b, { skip = null, seed = 1 } = {}) {
  const rand = rng(seed);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const clear = (x, z) => !skip
    || x < skip.x0 - 1.5 || x > skip.x1 + 1.5 || z < skip.z0 - 1.5 || z > skip.z1 + 1.5;

  for (let i = 0; i < 46; i++) {
    const x = b.x0 + 3 + rand() * (b.x1 - b.x0 - 6);
    const z = b.z0 + 3 + rand() * (b.z1 - b.z0 - 6);
    if (!clear(x, z)) continue;
    S.add(tree(x, z, 0, { scale: 0.9 + rand() * 0.4, kind: rand() > 0.7 ? 'pine' : 'round' }, ctx));
  }
  for (const [dx, dz] of [[-14, 8], [14, 8], [-14, -8], [14, -8]]) {
    if (clear(cx + dx, cz + dz)) S.add(bush(cx + dx, cz + dz, 0, ctx, { scale: 0.9 }));
  }
}

// --- the impact site -------------------------------------------------------

function buildImpactSite(zone, S, ctx, land) {
  const MX = land.impact.x;
  const MZ = land.impact.z;
  const MY = land.height(MX, MZ);

  // The meteorite: a faceted lump, glowing where it split open. The scorch is
  // painted into the terrain's vertex colours rather than laid on as a disc —
  // a flat decal in a curved bowl is half buried and half floating.
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a58 });
  const meteor = new THREE.Group();
  meteor.position.set(MX, MY, MZ);
  for (const [dx, dy, dz, r] of [
    [0, 0, 0, 3.1], [2.1, -0.6, 1.1, 2.0], [-1.8, -0.5, -1.2, 2.2], [0.6, 0.9, -1.9, 1.3],
  ]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.position.set(dx, dy + r * 0.7, dz);
    m.rotation.set(dx, dy, dz);
    m.castShadow = true;
    m.receiveShadow = true;
    meteor.add(m);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a5a });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), glowMat);
  glow.userData.dynamic = true;
  glow.position.set(0.4, 2.7, 1.1);
  meteor.add(glow);
  const glowLight = new THREE.PointLight(0xff7a4a, 2.6, 24, 2);
  glowLight.position.set(0.4, 3.0, 1.1);
  meteor.add(glowLight);
  S.add(meteor);
  ctx.solids.circle(MX, MZ, 4.1, 'meteorite');
  zone.onUpdate((dt, t) => {
    const pulse = 0.75 + Math.sin(t * 2.1) * 0.18 + Math.sin(t * 5.7) * 0.06;
    glowMat.color.setRGB(1.0 * pulse, 0.5 * pulse, 0.32 * pulse);
    glowLight.intensity = 1.7 + pulse * 0.9;
    void dt;
  });

  // Smoke, visible from a long way down the valley — it is what you walk toward.
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xb8aab0, transparent: true, opacity: 0.35, depthWrite: false,
  });
  zone.smokeMats = [];
  const puffs = [];
  for (let i = 0; i < 10; i++) {
    const pm = smokeMat.clone();
    zone.smokeMats.push(pm);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.6, 6, 5), pm);
    p.position.set(MX + Math.random() * 2 - 1, MY + 2 + i * 1.3, MZ + Math.random() * 2 - 1);
    p.userData = { dynamic: true, base: MY + 2 + i * 1.3, phase: Math.random() * 6.28 };
    S.add(p);
    puffs.push(p);
  }
  zone.onUpdate((dt, t) => {
    for (const p of puffs) {
      const k = ((t * 0.5 + p.userData.phase) % 6.28) / 6.28;
      p.position.y = p.userData.base + k * 7;
      p.material.opacity = 0.34 * (1 - k);
      p.scale.setScalar(1 + k * 1.8);
      void dt;
    }
  });

  // Ejecta, sitting on whatever slope it landed on.
  for (const [dx, dz, r] of [
    [-7, 4, 0.9], [6, -6, 1.1], [-5, -7, 0.7], [10, 5, 0.8], [-11, -2, 0.6],
    [13, -3, 0.9], [-9, 9, 0.7], [3, 12, 1.0],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(MX + dx, land.height(MX + dx, MZ + dz) + r * 0.5, MZ + dz);
    rock.rotation.set(dx, dz, r);
    rock.castShadow = true;
    S.add(rock);
    ctx.solids.circle(MX + dx, MZ + dz, r * 0.9, 'rock');
  }

  zone.interactables.push({
    x: MX, z: MZ + 6.0, r: 4.4, name: 'meteorite', speaker: 'METEORITE',
    lines: [
      'The meteorite is still warm. Something inside it hums, faint and patient.',
      'It sounds almost like it is waiting for someone.',
    ],
  });
}

// --- small props -----------------------------------------------------------

function mailbox(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(0.14, 1.05, 0.14, flatMat(P.woodDark), 0, 0, 0));
  const b = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.6, 8, 1, false, 0, Math.PI),
    flatMat('#9aa0b0'),
  );
  b.rotation.z = Math.PI / 2;
  b.position.y = 1.05;
  g.add(b);
  g.add(box(0.5, 0.5, 0.62, flatMat('#9aa0b0'), 0, 0.75, 0));
  g.add(box(0.06, 0.28, 0.06, flatMat('#d03838'), 0.28, 1.05, 0));
  if (ctx?.solids) ctx.solids.circle(x, z, 0.3, 'mailbox');
  return g;
}

function telephonePole(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const m = mat(repeated(T.bark(), 1, 4), 0xa08a70);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 7.2, 7), m);
  pole.position.y = 3.6;
  pole.castShadow = true;
  g.add(pole);
  g.add(box(2.6, 0.18, 0.2, flatMat(P.woodDark), 0, 6.3, 0));
  g.add(box(1.8, 0.16, 0.18, flatMat(P.woodDark), 0, 5.7, 0));
  for (const ix of [-1.1, 0, 1.1]) {
    g.add(box(0.14, 0.22, 0.14, flatMat('#8ad0e0'), ix, 6.48, 0));
  }
  if (ctx?.solids) ctx.solids.circle(x, z, 0.32, 'pole');
  return g;
}

function wire(a, b) {
  const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.9, (a.z + b.z) / 2);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z),
  );
  const geo = new THREE.TubeGeometry(curve, 10, 0.045, 4, false);
  return new THREE.Mesh(geo, flatMat('#3a3440'));
}

function hydrant(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const m = flatMat('#d03838');
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8), m);
  body.position.y = 0.42;
  body.castShadow = true;
  g.add(body);
  g.add(box(0.7, 0.12, 0.34, m, 0, 0.5, 0));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 5), m);
  cap.position.y = 0.9;
  g.add(cap);
  if (ctx?.solids) ctx.solids.circle(x, z, 0.34, 'hydrant');
  return g;
}

function bench(x, z, y, ry, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const wm = mat(repeated(T.planks(), 2, 1), 0xc09060);
  g.add(box(2.6, 0.14, 0.8, wm, 0, 0.5, 0));
  g.add(box(2.6, 0.7, 0.14, wm, 0, 0.64, -0.35));
  for (const lx of [-1.1, 1.1]) {
    g.add(box(0.16, 0.5, 0.7, flatMat('#5a6070'), lx, 0, 0));
  }
  if (ctx?.solids) ctx.solids.bounds(x - 1.4, z - 0.5, x + 1.4, z + 0.5, 'bench');
  return g;
}

function trashCan(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const m = mat(repeated(T.metal('#5a8a6a'), 1, 1), 0xffffff);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.95, 9), m);
  b.position.y = 0.48;
  b.castShadow = true;
  g.add(b);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 9), flatMat('#3a5a48'));
  lid.position.y = 1.0;
  g.add(lid);
  if (ctx?.solids) ctx.solids.circle(x, z, 0.42, 'trash');
  return g;
}

function vendingMachine(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(1.6, 2.4, 0.9, flatMat('#c83848'), 0, 0, 0));
  const front = decal(1.2, 1.5, new THREE.MeshBasicMaterial({ color: 0x6ac0e0 }), { y: 1.5, z: 0.47 });
  g.add(front);
  for (let i = 0; i < 6; i++) {
    g.add(decal(0.24, 0.34, new THREE.MeshBasicMaterial({
      color: [0xf0d040, 0xe06040, 0x60c060, 0x8060d0, 0xf08040, 0x40a0e0][i],
    }), { x: -0.4 + (i % 3) * 0.4, y: 1.85 - Math.floor(i / 3) * 0.45, z: 0.48 }));
  }
  g.add(box(1.2, 0.4, 0.1, flatMat('#3a3440'), 0, 0.4, 0.45));
  if (ctx?.solids) ctx.solids.bounds(x - 0.9, z - 0.55, x + 0.9, z + 0.55, 'vending');
  return g;
}

function busStop(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(0.16, 2.6, 0.16, flatMat('#5a6070'), 0, 0, 0));
  const sign = box(1.1, 0.5, 0.1, new THREE.MeshLambertMaterial({
    map: signTexture('BUS', '#f0f0e0', '#3a5a8a', 40, 18),
  }), 0, 2.4, 0);
  g.add(sign);
  if (ctx?.solids) ctx.solids.circle(x, z, 0.3, 'busstop');
  return g;
}

/** `axis` is the direction the barricade lies along. */
function barricade(x, z, y, ctx, axis = 'z') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const stripe = new THREE.MeshLambertMaterial({
    map: repeated(T.tileRoof('#e8a030', 'barricade'), 3, 1), color: 0xffffff,
  });
  if (axis === 'z') {
    g.add(box(0.4, 1.0, 2.6, stripe, 0, 0, 0));
    for (const s of [-1, 1]) g.add(box(0.16, 1.0, 0.16, flatMat('#c8c0b0'), 0, 0, s * 1.1));
    if (ctx?.solids) ctx.solids.bounds(x - 0.4, z - 1.4, x + 0.4, z + 1.4, 'barricade');
  } else {
    g.add(box(2.6, 1.0, 0.4, stripe, 0, 0, 0));
    for (const s of [-1, 1]) g.add(box(0.16, 1.0, 0.16, flatMat('#c8c0b0'), s * 1.1, 0, 0));
    if (ctx?.solids) ctx.solids.bounds(x - 1.4, z - 0.4, x + 1.4, z + 0.4, 'barricade');
  }
  return g;
}

// --- population ------------------------------------------------------------

function populateOnett(zone, land) {
  /** @type {Array<[string, number, number, number, string[], object]>} */
  const cast = [
    // the lane, outside your house
    ['mom', 52.5, -59.5, 0, [
      "Don't wander too far, dear.",
      'And put on a jacket if it gets cold out on those hills.',
    ], { wander: 0 }],
    ['neighborKid', 66, -62, 0, [
      "Oh — it's you. Did the noise wake you up too?",
      'Something fell out of the sky and came down way out in the hills. The whole house shook!',
    ], { wander: 2.5 }],
    ['dog', 60, -52, 0, ['Woof!'], { wander: 5, speed: 3.4, scale: 0.9 }],

    // the top street
    ['townsman', -26, -37.6, 0, [
      'The police shut the track north about an hour ago.',
      'Nobody in this town has slept since that thing came down.',
    ], { wander: 3 }],
    ['granny', 14, -37.6, 0, [
      'In sixty years I have never heard a bang like that.',
      'Not even when my husband tried to fix the boiler.',
    ], { wander: 0 }],

    // the middle street and the shops
    ['businessman', -36, 19.6, 0, [
      'Meteorite or no meteorite, the shops open at nine.',
    ], { wander: 2.5 }],
    ['townswoman', -52, 19.6, 0, [
      'The drug store has everything. Bandages, cola, umbrellas...',
    ], { wander: 2.5 }],
    ['punk', 12, 19.6, 0, [
      'This is our street, got it?',
      'Ahh, forget it. My high score is unbeatable anyway.',
    ], { wander: 2 }],
    ['neighborKidSmall', 29, 19.6, 0, [
      'I spent all my allowance in the arcade.',
      'Worth it!',
    ], { wander: 2 }],
    ['photographer', -6, 8.4, 0, [
      'Say — you have a great face for a photograph!',
      'I take pictures all over the world. One day I will get one of you.',
    ], { wander: 0 }],
    ['townsman', 50, 8.4, 0, [
      'Those offices have been half empty for years.',
      'Onett is not the town it was, they tell me. I would not know.',
    ], { wander: 3 }],
    ['dog', 34, 14, 0, ['Arf!'], { wander: 7, speed: 3.8, scale: 0.9 }],

    // city hall park
    ['granny', -22, -12, 0, [
      'I sit here most mornings. It is the only quiet corner left.',
      'Well. It was, until last night.',
    ], { wander: 0 }],
    ['townswoman', -48, -18, 0, [
      'They keep saying they will fix the clock on the hall.',
      'They have been saying it since I was at school.',
    ], { wander: 3 }],

    // the hospital and the west avenue
    ['nurse', -66, 14, 0, [
      'If you get hurt out there, come straight to the hospital.',
      "We're open through the night, and it has been a long one already.",
    ], { wander: 0 }],

    // the south street and the Twoson road
    ['cop', 0, 84, 0, [
      'Road south is closed, kid. Orders.',
      'Something about the traffic. Nobody believes that either.',
    ], { wander: 0 }],
    ['townsman', -46, 65.6, 0, [
      'Two buses came through this morning and neither of them stopped.',
    ], { wander: 3 }],
    ['townswoman', 40, 65.6, 0, [
      'That road goes south to Twoson.',
      'It is a long walk. Longer than you think.',
    ], { wander: 2.5 }],

    // the cordon at the foot of the track, and one who went on ahead
    ['cop', -32.5, -50, 0, [
      'Police business, kid. Nobody goes up the valley.',
      "...Between you and me? I have no idea what that thing is either.",
    ], { wander: 0 }],
    ['cop', -25, -59, 0, [
      'Keep behind the barricade, please.',
    ], { wander: 1.5 }],
  ];

  // Someone out in the hills, halfway along the walk, to tell you to keep going.
  const scoutZ = -130;
  const scoutX = land.spineX(scoutZ) + 5;
  cast.push(['photographer', scoutX, scoutZ, land.height(scoutX, scoutZ), [
    'I walked out here at first light and I still cannot see the end of it.',
    'Whatever came down, it is further up this valley. Keep going.',
  ], { wander: 3 }]);

  for (const [kind, x, z, y, lines, opts] of cast) {
    const a = new Actor(kind, { x, y, z, speed: opts.speed ?? 2.0, scale: opts.scale ?? 1 });
    a.home = new THREE.Vector3(x, y, z);
    a.wanderRadius = opts.wander ?? 0;
    a.lines = lines;
    a.name = kind;
    zone.npcs.push(a);
    zone.scene.add(a.group);
  }
}
