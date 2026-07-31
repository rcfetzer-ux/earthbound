/**
 * ONETT — the first town.
 *
 * Laid out from the original's shape rather than its pixels: a terraced hill
 * town where the residential shelf sits above a main street, stairs drop you
 * into the shopping strip, civic buildings face the shops from across the road,
 * and a scorched hill in the north-east corner has a meteorite on it behind a
 * police barricade.
 *
 *   North shelf  y = 2.4   Ness's house, the neighbours, quiet street
 *   Meteorite hill y = 5.6 NE corner, dirt stairs up
 *   Town level   y = 0     main street, shops, civic row, south road out
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';
import { T, repeated, signTexture } from '../core/tex.js';
import {
  Zone, addSky, addClouds, addOutdoorLight, addBackdrop, addSurroundingLand,
  terrace, pave, kerb, stairs,
} from './zone.js';
import { timePreset, DEFAULT_TIME } from './daylight.js';
import {
  building, tree, hedge, fence, lamp, signPost, car, bush, flowerPatch,
  box, flatMat, mat, decal,
} from './build.js';
import { Actor, DIR_YAW } from '../entities/actor.js';

// --- level constants -------------------------------------------------------

export const TOWN_Y = 0;
export const SHELF_Y = 2.4;
export const HILL_Y = 5.6;

const BOUNDS = { x0: -58, x1: 58, z0: -70, z1: 58 };

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
  // Countryside under and around the town, so the boundary is a place you
  // cannot walk rather than the edge of the world.
  addSurroundingLand(S, { y: TOWN_Y, seed: 9 });
  addBackdrop(S, { radius: 168, seed: 5 });
  zone.onUpdate((dt) => clouds.update(dt));

  // Re-light the whole zone when the time of day changes.
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
  // Ground
  // ======================================================================

  // The town floor: one wide grassy plate. Everything paved sits on top of it.
  const townPlate = terrace(zone, BOUNDS.x0, -21, BOUNDS.x1, BOUNDS.z1, TOWN_Y, 12);
  townPlate.name = 'townPlate';

  // Residential shelf, and the meteorite hill carved out of its NE corner.
  terrace(zone, BOUNDS.x0, BOUNDS.z0, 26, -21, SHELF_Y, 8);
  terrace(zone, 26, -48, BOUNDS.x1, -21, SHELF_Y, 8);
  terrace(zone, 26, BOUNDS.z0, BOUNDS.x1, -48, HILL_Y, 11, {
    topTex: repeated(T.dirtPath(), 5, 4),
  });

  // Stairs down from the shelf into town (main flight + a western one).
  stairs(zone, -4.5, -21, 4.5, -13, SHELF_Y, TOWN_Y, 'z', { steps: 9 });
  stairs(zone, -44, -21, -37, -13, SHELF_Y, TOWN_Y, 'z', { steps: 9 });
  // Dirt stairs up the meteorite hill.
  stairs(zone, 18, -62, 26, -53, SHELF_Y, HILL_Y, 'x', {
    steps: 10, rail: false, tex: repeated(T.dirtPath(), 2, 1),
  });

  // ======================================================================
  // Roads and pavements
  // ======================================================================

  // Main street, running the full width of town.
  pave(zone, BOUNDS.x0, 8, BOUNDS.x1, 18, TOWN_Y, T.road(), 8);
  // Cross road heading south from the stairs.
  pave(zone, -5, -13, 5, BOUNDS.z1, TOWN_Y, T.road(), 8);
  // Pavements either side of main street.
  pave(zone, BOUNDS.x0, 3.6, BOUNDS.x1, 8, TOWN_Y, T.walk(), 6);
  pave(zone, BOUNDS.x0, 18, BOUNDS.x1, 22.4, TOWN_Y, T.walk(), 6);
  // …and along the cross road.
  pave(zone, -8.6, -13, -5, 8, TOWN_Y, T.walk(), 6);
  pave(zone, 5, -13, 8.6, 8, TOWN_Y, T.walk(), 6);
  pave(zone, -8.6, 18, -5, BOUNDS.z1, TOWN_Y, T.walk(), 6);
  pave(zone, 5, 18, 8.6, BOUNDS.z1, TOWN_Y, T.walk(), 6);
  // Apron at the foot of the main stairs.
  pave(zone, -9, -13, 9, -8.5, TOWN_Y, T.walk(), 6);

  // Kerbs: a low lip wherever pavement meets tarmac.
  for (const [x0, z0, x1, z1] of [
    [BOUNDS.x0, 7.9, -8.6, 8.1], [8.6, 7.9, BOUNDS.x1, 8.1],
    [BOUNDS.x0, 17.9, -8.6, 18.1], [8.6, 17.9, BOUNDS.x1, 18.1],
    [-5.1, -13, -4.9, 7.9], [4.9, -13, 5.1, 7.9],
    [-5.1, 18.1, -4.9, BOUNDS.z1], [4.9, 18.1, 5.1, BOUNDS.z1],
  ]) kerb(zone, x0, z0, x1, z1, TOWN_Y);

  // Centre line down main street.
  const dashMat = new THREE.MeshLambertMaterial({
    map: repeated(T.roadLine(), 1, 22), transparent: true, alphaTest: 0.35,
  });
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 116), dashMat);
  dash.rotation.x = -Math.PI / 2;
  dash.rotation.z = Math.PI / 2;
  dash.position.set(0, TOWN_Y + 0.05, 13);
  dash.geometry.rotateZ(0);
  S.add(dash);
  const dash2 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 30),
    new THREE.MeshLambertMaterial({
      map: repeated(T.roadLine(), 1, 6), transparent: true, alphaTest: 0.35,
    }),
  );
  dash2.rotation.x = -Math.PI / 2;
  dash2.position.set(0, TOWN_Y + 0.05, 35);
  S.add(dash2);

  // Shelf street, up on the residential terrace.
  pave(zone, -52, -32, 50, -26, SHELF_Y, T.road(), 8);
  pave(zone, -52, -35.4, 50, -32, SHELF_Y, T.walk(), 6);
  pave(zone, -52, -26, 50, -22.6, SHELF_Y, T.walk(), 6);
  kerb(zone, -52, -32.1, 50, -31.9, SHELF_Y);
  kerb(zone, -52, -26.1, 50, -25.9, SHELF_Y);
  // Landing that joins the shelf street to the top of the main stairs.
  pave(zone, -9, -26, 9, -21, SHELF_Y, T.walk(), 6);
  pave(zone, -45, -26, -36, -21, SHELF_Y, T.walk(), 6);

  // ======================================================================
  // North shelf — the residential streets
  // ======================================================================

  // Ness's house: two storeys, red roof, brick chimney.
  S.add(building({
    name: "player's house", x: -16, z: -46, y: SHELF_Y, w: 13, d: 11, h: 3.4, storeys: 2,
    wall: P.wallCream, wallTex: 'siding', roof: P.roofRed, roofType: 'gable', ridge: 'x',
    roofH: 2.8, chimney: true, trim: shade(P.wallCream, -0.22),
    doors: [{ side: 'south', offset: -1.5, target: 'nessHouse', spawn: 'front', label: 'HOME' }],
    windows: [
      { side: 'south', offset: 3.4, y: 1.1, shutters: P.roofRed },
      { side: 'south', offset: -3.6, y: 4.6 }, { side: 'south', offset: 3.4, y: 4.6 },
      { side: 'east', offset: -2.4, y: 1.1 }, { side: 'east', offset: 2.4, y: 4.6 },
      { side: 'west', offset: 0, y: 1.1, shutters: P.roofRed },
      { side: 'north', offset: -3, y: 1.1 }, { side: 'north', offset: 3, y: 4.6 },
    ],
  }, ctx));
  // front garden
  // fence either side of the front path — a gap wide enough to walk through
  S.add(fence(-20.4, -38.5, SHELF_Y, 3.2, 'x', ctx, P.wallWhite));
  S.add(fence(-12.6, -38.5, SHELF_Y, 5.2, 'x', ctx, P.wallWhite));
  S.add(flowerPatch(-21.5, -41, SHELF_Y, 9));
  S.add(tree(-24, -44, SHELF_Y, { scale: 1.15 }, ctx));
  S.add(bush(-10.5, -40.5, SHELF_Y, ctx));
  pave(zone, -18.5, -40.5, -15.5, -35.4, SHELF_Y, T.walk(), 4);
  S.add(mailbox(-13.6, -39.4, SHELF_Y, ctx));

  // Neighbours across the way.
  S.add(building({
    name: 'neighbours', x: 13, z: -46, y: SHELF_Y, w: 13, d: 11, h: 3.4, storeys: 2,
    wall: P.wallSky, wallTex: 'siding', roof: P.roofBlue, roofType: 'gable', ridge: 'x',
    roofH: 2.8, chimney: true, trim: P.wallWhite,
    doors: [{ side: 'south', offset: 1.4, target: 'neighborHouse', spawn: 'front', label: "NEIGHBOUR'S HOUSE" }],
    windows: [
      { side: 'south', offset: -3.6, y: 1.1, shutters: P.roofBlue },
      { side: 'south', offset: -3.6, y: 4.6 }, { side: 'south', offset: 3.4, y: 4.6 },
      { side: 'west', offset: 0, y: 1.1 }, { side: 'east', offset: 0, y: 4.6 },
      { side: 'north', offset: 3, y: 1.1 },
    ],
  }, ctx));
  S.add(fence(9.4, -38.5, SHELF_Y, 4.4, 'x', ctx, P.wallWhite));
  S.add(fence(17.2, -38.5, SHELF_Y, 3.6, 'x', ctx, P.wallWhite));
  S.add(tree(21, -43, SHELF_Y, { scale: 1.25 }, ctx));
  S.add(bush(7.5, -40.5, SHELF_Y, ctx, { scale: 1.1 }));
  pave(zone, 12, -40.5, 15, -35.4, SHELF_Y, T.walk(), 4);
  S.add(mailbox(16.4, -39.4, SHELF_Y, ctx));

  // A third house at the west end of the shelf.
  S.add(building({
    name: 'house', x: -42, z: -44, y: SHELF_Y, w: 13, d: 10, h: 4.2,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofGreen, roofType: 'gable', ridge: 'x',
    roofH: 2.6, chimney: true,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -4, y: 1.2, shutters: P.roofGreen },
      { side: 'south', offset: 4, y: 1.2, shutters: P.roofGreen },
      { side: 'east', offset: 0, y: 1.2 }, { side: 'west', offset: 0, y: 1.2 },
    ],
  }, ctx));
  pave(zone, -43.5, -39, -40.5, -35.4, SHELF_Y, T.walk(), 4);
  S.add(tree(-50, -42, SHELF_Y, { scale: 1.1, kind: 'pine' }, ctx));
  S.add(flowerPatch(-35, -40, SHELF_Y, 7));

  // A fourth, set back to the east.
  S.add(building({
    name: 'house', x: 38, z: -42, y: SHELF_Y, w: 12, d: 10, h: 4.2,
    wall: P.wallSalmon, wallTex: 'siding', roof: P.roofOrange, roofType: 'hip', roofH: 2.4,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -3.6, y: 1.2 }, { side: 'south', offset: 3.6, y: 1.2 },
      { side: 'west', offset: 0, y: 1.2 },
    ],
  }, ctx));
  pave(zone, 36.5, -37, 39.5, -35.4, SHELF_Y, T.walk(), 4);
  S.add(tree(46, -40, SHELF_Y, { scale: 1.2 }, ctx));
  S.add(bush(30, -38, SHELF_Y, ctx));

  // Shelf street furniture and trees along the pavement.
  for (const x of [-30, -4, 26, 46]) S.add(lamp(x, -23.8, SHELF_Y, ctx));
  for (const x of [-52, -30, -18, 14, 28, 44, 52]) {
    S.add(tree(x, -23.6, SHELF_Y, { scale: 0.95 + Math.abs(x % 4) * 0.06 }, ctx));
  }
  S.add(car(-28, -29, SHELF_Y, 0, '#d8d0c0', ctx));
  S.add(car(30, -29, SHELF_Y, Math.PI, '#6a9ad0', ctx));

  // Hedges closing off the shelf's east and west ends.
  for (let z = -68; z < -22; z += 6) {
    S.add(hedge(BOUNDS.x0 + 1.2, z, SHELF_Y, 2.4, 6, 1.3, ctx));
  }
  for (let z = -68; z < -48; z += 6) {
    S.add(hedge(24.8, z, SHELF_Y, 2.4, 6, 1.3, ctx));
  }
  // …and the back of the shelf.
  for (let x = -56; x < 24; x += 6) {
    S.add(hedge(x, BOUNDS.z0 + 1.2, SHELF_Y, 6, 2.4, 1.3, ctx));
  }
  for (let x = -52; x < 22; x += 9) S.add(tree(x, -66, SHELF_Y, { scale: 1.3, kind: 'pine' }, ctx));

  // ======================================================================
  // Meteorite hill
  // ======================================================================

  buildMeteoriteHill(zone, S, ctx);

  // ======================================================================
  // Town level — the shopping strip (north side of main street)
  // ======================================================================

  S.add(building({
    name: 'drug store', x: -40, z: -2, y: TOWN_Y, w: 15, d: 11, h: 4.4,
    wall: P.wallCream, wallTex: 'stucco', roof: P.roofRed, roofType: 'gable', ridge: 'x', roofH: 2.2,
    awning: { color: P.roofRed, w: 11, side: 'south', y: 2.9 },
    sign: { text: 'DRUG STORE', bg: P.roofRed, fg: '#fff6e0', side: 'south', y: 3.5, w: 9 },
    doors: [{ side: 'south', offset: 0, target: 'drugstore', spawn: 'front', kind: 'glass', label: 'DRUG STORE' }],
    windows: [
      { side: 'south', offset: -4.4, y: 1.0, w: 2.6, h: 2.0 },
      { side: 'south', offset: 4.4, y: 1.0, w: 2.6, h: 2.0 },
      { side: 'east', offset: 0, y: 1.4 }, { side: 'west', offset: 0, y: 1.4 },
    ],
  }, ctx));

  S.add(building({
    name: 'burger shop', x: -22, z: -2.5, y: TOWN_Y, w: 12, d: 10, h: 4.2,
    wall: P.wallSalmon, wallTex: 'stucco', roof: P.roofOrange, roofType: 'gable', ridge: 'x', roofH: 2.0,
    awning: { color: '#f0c040', w: 8, side: 'south', y: 2.9 },
    sign: { text: 'BURGER', bg: '#e05838', fg: '#fff2c0', side: 'south', y: 3.45, w: 7 },
    doors: [{ side: 'south', offset: 0, target: null, kind: 'glass', label: 'BURGER SHOP' }],
    windows: [
      { side: 'south', offset: -3.6, y: 1.0, w: 2.4, h: 2.0 },
      { side: 'south', offset: 3.6, y: 1.0, w: 2.4, h: 2.0 },
      { side: 'west', offset: 0, y: 1.4 },
    ],
  }, ctx));

  // The arcade: flat-roofed, purple, with a neon marquee.
  const arcade = building({
    name: 'arcade', x: 20, z: -2, y: TOWN_Y, w: 17, d: 12, h: 5.0,
    wall: P.wallLilac, wallTex: 'stucco', roof: '#6a4a9a', roofType: 'flat',
    sign: { text: 'ARCADE', bg: '#4a2a6a', fg: '#ffe060', side: 'south', y: 4.2, w: 10, h: 1.5 },
    doors: [{ side: 'south', offset: 0, target: 'arcade', spawn: 'front', kind: 'glass', label: 'ARCADE' }],
    windows: [
      { side: 'south', offset: -5.5, y: 1.0, w: 3.2, h: 2.2, lit: true },
      { side: 'south', offset: 5.5, y: 1.0, w: 3.2, h: 2.2, lit: true },
      { side: 'east', offset: 0, y: 1.4, lit: true },
    ],
  }, ctx);
  // marquee bulbs that chase around the sign
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe060 }),
    );
    b.userData.dynamic = true;
    b.position.set(-5.2 + i * 0.8, 4.86, 6.16);
    arcade.add(b);
    bulbs.push(b);
  }
  zone.onUpdate((dt, t) => {
    for (let i = 0; i < bulbs.length; i++) {
      const on = (Math.floor(t * 6) + i) % 3 === 0;
      bulbs[i].material.color.setHex(on ? 0xfff0a0 : 0x8a6a30);
    }
    void dt;
  });
  S.add(arcade);

  // Hotel: two storeys, hip roof, a proper porch.
  S.add(building({
    name: 'hotel', x: 45, z: -3, y: TOWN_Y, w: 18, d: 13, h: 3.5, storeys: 2,
    wall: P.wallSky, wallTex: 'siding', roof: P.roofBlue, roofType: 'hip', roofH: 2.6,
    trim: P.wallWhite,
    sign: { text: 'HOTEL', bg: P.roofBlue, fg: '#ffffff', side: 'south', y: 4.2, w: 6 },
    awning: { color: P.roofBlue, w: 5, side: 'south', y: 2.9 },
    doors: [{ side: 'south', offset: 0, target: 'hotel', spawn: 'front', kind: 'glass', label: 'HOTEL' }],
    windows: [
      { side: 'south', offset: -6, y: 1.1, w: 2.2 }, { side: 'south', offset: 6, y: 1.1, w: 2.2 },
      { side: 'south', offset: -6, y: 4.8 }, { side: 'south', offset: -2, y: 4.8 },
      { side: 'south', offset: 2, y: 4.8 }, { side: 'south', offset: 6, y: 4.8 },
      { side: 'west', offset: 0, y: 1.1 }, { side: 'west', offset: 0, y: 4.8 },
      { side: 'east', offset: 0, y: 4.8, lit: true },
    ],
  }, ctx));

  // ======================================================================
  // Town level — civic row (south side of main street)
  // ======================================================================

  const hospital = building({
    name: 'hospital', x: -44, z: 28, y: TOWN_Y, w: 20, d: 13, h: 4.8, storeys: 1,
    wall: P.wallWhite, wallTex: 'stucco', roof: '#c8c4b8', roofType: 'flat',
    sign: { text: 'HOSPITAL', bg: '#e8f0f8', fg: '#d04848', side: 'north', y: 3.6, w: 9 },
    doors: [{ side: 'north', offset: 0, target: 'hospital', spawn: 'front', kind: 'glass', label: 'HOSPITAL' }],
    windows: [
      { side: 'north', offset: -6.5, y: 1.2, w: 2.4 }, { side: 'north', offset: 6.5, y: 1.2, w: 2.4 },
      { side: 'east', offset: -3, y: 1.4 }, { side: 'east', offset: 3, y: 1.4 },
      { side: 'west', offset: 0, y: 1.4 },
    ],
  }, ctx);
  // red cross plaque above the door
  const crossMat = flatMat('#d04848');
  const cross = new THREE.Group();
  cross.add(box(1.6, 0.5, 0.16, crossMat, 0, 0, 0));
  cross.add(box(0.5, 1.6, 0.16, crossMat, 0, -0.55, 0));
  cross.position.set(0, 5.6, -6.7);
  cross.rotation.y = Math.PI;
  hospital.add(cross);
  S.add(hospital);

  S.add(building({
    name: 'police station', x: -20, z: 28, y: TOWN_Y, w: 15, d: 11, h: 4.4,
    wall: P.wallTan, wallTex: 'brick', roof: P.roofBlue, roofType: 'gable', ridge: 'x', roofH: 2.2,
    sign: { text: 'POLICE', bg: '#2c3a6a', fg: '#f0f4ff', side: 'north', y: 3.5, w: 7 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'POLICE STATION' }],
    windows: [
      { side: 'north', offset: -4.6, y: 1.2 }, { side: 'north', offset: 4.6, y: 1.2 },
      { side: 'east', offset: 0, y: 1.4 }, { side: 'west', offset: 0, y: 1.4 },
    ],
  }, ctx));

  // City hall: the grandest thing in town — columns and a clock.
  const hall = building({
    name: 'city hall', x: 22, z: 29, y: TOWN_Y, w: 18, d: 13, h: 5.2,
    wall: P.wallCream, wallTex: 'stucco', roof: P.roofGreen, roofType: 'hip', roofH: 2.8,
    sign: { text: 'CITY HALL', bg: '#3a7a52', fg: '#fff6e0', side: 'north', y: 4.0, w: 9 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'CITY HALL' }],
    windows: [
      { side: 'north', offset: -6.6, y: 1.4, w: 1.6, h: 2.4 },
      { side: 'north', offset: 6.6, y: 1.4, w: 1.6, h: 2.4 },
      { side: 'east', offset: -3, y: 1.6 }, { side: 'east', offset: 3, y: 1.6 },
      { side: 'west', offset: -3, y: 1.6 }, { side: 'west', offset: 3, y: 1.6 },
    ],
  }, ctx);
  const colMat = mat(repeated(T.concrete(), 1, 3), 0xf0ece0);
  for (const cx of [-3.6, 3.6]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 5.0, 8), colMat);
    col.position.set(cx, 2.5, -7.4);
    col.castShadow = true;
    hall.add(col);
  }
  hall.add(box(9.4, 0.4, 1.6, flatMat('#efe9dc'), 0, 5.0, -7.4));
  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 16),
    new THREE.MeshLambertMaterial({ map: signTexture('12', '#f8f4e4', '#3a3040', 32, 32) }),
  );
  clock.position.set(0, 6.4, -6.62);
  clock.rotation.y = Math.PI;
  hall.add(clock);
  S.add(hall);

  S.add(building({
    name: 'house', x: 48, z: 28, y: TOWN_Y, w: 13, d: 11, h: 4.0,
    wall: P.wallLilac, wallTex: 'siding', roof: P.roofPurple, roofType: 'gable', ridge: 'x', roofH: 2.4,
    chimney: true,
    doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'north', offset: -4, y: 1.2, shutters: P.roofPurple },
      { side: 'north', offset: 4, y: 1.2, shutters: P.roofPurple },
      { side: 'east', offset: 0, y: 1.2 },
    ],
  }, ctx));

  // ======================================================================
  // Town level — south residential and the road out
  // ======================================================================

  S.add(building({
    name: 'house', x: -24, z: 46, y: TOWN_Y, w: 13, d: 11, h: 4.0,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofRed, roofType: 'gable', ridge: 'x', roofH: 2.4,
    chimney: true,
    doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'north', offset: -4, y: 1.2 }, { side: 'north', offset: 4, y: 1.2 },
      { side: 'east', offset: 0, y: 1.2 }, { side: 'west', offset: 0, y: 1.2 },
    ],
  }, ctx));
  S.add(fence(-28.2, 39, TOWN_Y, 3.6, 'x', ctx, P.wallWhite));
  S.add(fence(-20.2, 39, TOWN_Y, 4.4, 'x', ctx, P.wallWhite));
  S.add(tree(-32, 42, TOWN_Y, { scale: 1.15 }, ctx));
  S.add(flowerPatch(-17, 41, TOWN_Y, 8));
  pave(zone, -25.5, 40.5, -22.5, 39, TOWN_Y, T.walk(), 4);

  S.add(building({
    name: 'house', x: 26, z: 46, y: TOWN_Y, w: 13, d: 11, h: 4.0,
    wall: P.wallTan, wallTex: 'siding', roof: P.roofBlue, roofType: 'hip', roofH: 2.4,
    doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'north', offset: -4, y: 1.2 }, { side: 'north', offset: 4, y: 1.2 },
      { side: 'west', offset: 0, y: 1.2 },
    ],
  }, ctx));
  S.add(tree(36, 43, TOWN_Y, { scale: 1.25 }, ctx));
  S.add(bush(18, 41, TOWN_Y, ctx, { scale: 1.2 }));

  // Road out of town, heading south to the next town.
  pave(zone, -5, BOUNDS.z1 - 6, 5, BOUNDS.z1, TOWN_Y, T.dirtPath(), 7, 'dirt');
  S.add(signPost(-7.5, 53, TOWN_Y, 'TWOSON >', ctx, { rotation: 0.25 }));
  zone.interactables.push({
    x: 0, z: 56.5, r: 3.2, name: 'road south',
    lines: ['The road south winds toward Twoson.', 'Not today, though. There is still too much of Onett left to see.'],
  });
  for (const x of [-9, -13, 9, 13]) {
    S.add(hedge(x, 54, TOWN_Y, 4, 2.6, 1.4, ctx));
  }

  // ======================================================================
  // Street furniture
  // ======================================================================

  for (const x of [-52, -34, -12, 12, 34, 52]) {
    S.add(lamp(x, 5.6, TOWN_Y, ctx));
    S.add(lamp(x + 6, 20.4, TOWN_Y, ctx));
  }
  S.add(car(-30, 10.6, TOWN_Y, Math.PI / 2, '#d05050', ctx));
  S.add(car(14, 15.4, TOWN_Y, -Math.PI / 2, '#f0d060', ctx));
  S.add(car(40, 10.6, TOWN_Y, Math.PI / 2, '#58a878', ctx));
  S.add(car(-12, 15.4, TOWN_Y, -Math.PI / 2, '#8a7ab8', ctx));

  // Telephone poles with sagging wires — reads instantly as small-town America.
  const poles = [];
  for (const x of [-56, -36, -16, 12, 30, 46, 56]) {
    const g = telephonePole(x, 21.6, TOWN_Y, ctx);
    S.add(g);
    poles.push({ x, y: TOWN_Y + 6.4, z: 21.6 });
  }
  for (let i = 0; i < poles.length - 1; i++) S.add(wire(poles[i], poles[i + 1]));

  for (const [x, z] of [[-45, 6.4], [-9.6, 20.8], [22, 6.4], [50, 20.8]]) {
    S.add(hydrant(x, z, TOWN_Y, ctx));
  }
  for (const [x, z, ry] of [[-26, 6.6, 0], [8, 20.6, Math.PI], [30, 6.6, 0]]) {
    S.add(bench(x, z, TOWN_Y, ry, ctx));
  }
  for (const [x, z] of [[-13.5, 4.6], [11, 21.4], [33, 4.6]]) S.add(trashCan(x, z, TOWN_Y, ctx));

  // Vending machine and bus stop, filling the gap between arcade and hotel.
  S.add(vendingMachine(32, 4.4, TOWN_Y, ctx));
  S.add(busStop(-6.5, 6.5, TOWN_Y, ctx));

  // Welcome sign near the south road.
  S.add(signPost(8.5, 50, TOWN_Y, 'ONETT', ctx, { bg: '#3a7a52', fg: '#fff6e0', rotation: -0.3 }));

  // Trees and hedges fringing the town's outer edges.
  for (let z = -16; z < 56; z += 7) {
    S.add(tree(BOUNDS.x0 + 2.5, z, TOWN_Y, { scale: 1.1 + ((z % 3) * 0.1), kind: z % 14 === 0 ? 'pine' : 'round' }, ctx));
    S.add(tree(BOUNDS.x1 - 2.5, z + 3, TOWN_Y, { scale: 1.1 + ((z % 4) * 0.08) }, ctx));
  }
  for (let x = -54; x < 56; x += 8) {
    if (Math.abs(x) < 14) continue;
    S.add(tree(x, BOUNDS.z1 - 2.5, TOWN_Y, { scale: 1.15, kind: x % 16 === 0 ? 'pine' : 'round' }, ctx));
  }
  // Grass verges: hedge lines that make the boundary legible where trees thin out.
  for (let z = -12; z < 56; z += 6) {
    S.add(hedge(BOUNDS.x0 + 0.8, z, TOWN_Y, 1.6, 6, 1.2, ctx));
    S.add(hedge(BOUNDS.x1 - 0.8, z, TOWN_Y, 1.6, 6, 1.2, ctx));
  }

  // Bits of green between the pavement and the shop fronts.
  for (const [x, z] of [[-49, 5.5], [-31, 5.5], [-14.5, 1], [10.5, 5.5], [30, 20], [-33, 20], [42, 20.5]]) {
    S.add(bush(x, z, TOWN_Y, ctx, { scale: 0.9 }));
  }

  // ======================================================================
  // Spawns, NPCs
  // ======================================================================

  zone.addSpawn('start', -16, -37.5, SHELF_Y, 'down');
  zone.addSpawn('front', -16, -37.5, SHELF_Y, 'down');       // out of Ness's house
  zone.addSpawn('neighborHouse', 13, -37.5, SHELF_Y, 'down');
  zone.addSpawn('drugstore', -40, 6.8, TOWN_Y, 'down');
  zone.addSpawn('arcade', 20, 6.8, TOWN_Y, 'down');
  zone.addSpawn('hotel', 45, 6.8, TOWN_Y, 'down');
  zone.addSpawn('hospital', -44, 19.0, TOWN_Y, 'up');

  populateOnett(zone);

  return zone;
}

// --- meteorite hill --------------------------------------------------------

function buildMeteoriteHill(zone, S, ctx) {
  // Scorched ground and a shallow crater.
  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 22),
    new THREE.MeshLambertMaterial({ map: repeated(T.scorch(), 2.6, 2.6) }),
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(43, HILL_Y + 0.04, -58);
  crater.receiveShadow = true;
  S.add(crater);
  // a scorch halo, fading out into the dirt
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(8.4, 12.5, 24),
    new THREE.MeshLambertMaterial({
      map: repeated(T.scorch(), 3, 3), transparent: true, opacity: 0.45, depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(43, HILL_Y + 0.03, -58);
  S.add(halo);

  // The meteorite: a faceted lump, glowing where it split open.
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a58 });
  const meteor = new THREE.Group();
  meteor.position.set(43, HILL_Y, -58);
  for (const [dx, dy, dz, r] of [[0, 0, 0, 3.1], [2.1, -0.6, 1.1, 2.0], [-1.8, -0.5, -1.2, 2.2], [0.6, 0.9, -1.9, 1.3]]) {
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
  const glowLight = new THREE.PointLight(0xff7a4a, 2.6, 22, 2);
  glowLight.position.set(0.4, 3.0, 1.1);
  meteor.add(glowLight);
  S.add(meteor);
  ctx.solids.circle(43, -58, 4.1, 'meteorite');
  zone.onUpdate((dt, t) => {
    const pulse = 0.75 + Math.sin(t * 2.1) * 0.18 + Math.sin(t * 5.7) * 0.06;
    glowMat.color.setRGB(1.0 * pulse, 0.5 * pulse, 0.32 * pulse);
    glowLight.intensity = 1.7 + pulse * 0.9;
    void dt;
  });

  // Smoke curling off the impact site.
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xb8aab0, transparent: true, opacity: 0.35, depthWrite: false,
  });
  zone.smokeMats = [];
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const pm = smokeMat.clone();
    zone.smokeMats.push(pm);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.5, 6, 5), pm);
    p.position.set(43 + Math.random() * 2 - 1, HILL_Y + 2 + i * 1.1, -58 + Math.random() * 2 - 1);
    p.userData = { dynamic: true, base: HILL_Y + 2 + i * 1.1, phase: Math.random() * 6.28 };
    S.add(p);
    puffs.push(p);
  }
  zone.onUpdate((dt, t) => {
    for (const p of puffs) {
      const k = ((t * 0.6 + p.userData.phase) % 6.28) / 6.28;
      p.position.y = p.userData.base + k * 5;
      p.material.opacity = 0.34 * (1 - k);
      p.scale.setScalar(1 + k * 1.6);
      void dt;
    }
  });

  // Rocks and scorch marks scattered around.
  for (const [dx, dz, r] of [[-6, 3, 0.8], [5, -5, 1.0], [-4, -6, 0.6], [8, 4, 0.7], [-9, -2, 0.5]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(43 + dx, HILL_Y + r * 0.55, -58 + dz);
    rock.rotation.set(dx, dz, r);
    rock.castShadow = true;
    S.add(rock);
    ctx.solids.circle(43 + dx, -58 + dz, r * 0.9, 'rock');
  }

  // Police barricade at the top of the dirt stairs.
  for (const [bx, bz] of [[28.5, -56.5], [28.5, -52.5]]) {
    S.add(barricade(bx, bz, HILL_Y, ctx));
  }
  S.add(signPost(30, -49, HILL_Y, 'KEEP OUT', ctx, { bg: '#f0e0a0', fg: '#c03828', rotation: -0.5 }));

  // Hilltop trees and hedges around the rim.
  for (const [tx, tz] of [[52, -66], [34, -68], [55, -52], [30, -64]]) {
    S.add(tree(tx, tz, HILL_Y, { scale: 1.1, kind: 'pine' }, ctx));
  }
  for (let z = -68; z < -50; z += 6) S.add(hedge(56.8, z, HILL_Y, 2.4, 6, 1.3, ctx));
  for (let x = 30; x < 56; x += 6) S.add(hedge(x, -68.8, HILL_Y, 6, 2.4, 1.3, ctx));

  zone.interactables.push({
    x: 43, z: -54.5, r: 4.0, name: 'meteorite', speaker: 'METEORITE',
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

function barricade(x, z, y, ctx) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const stripe = new THREE.MeshLambertMaterial({
    map: repeated(T.tileRoof('#e8a030', 'barricade'), 3, 1), color: 0xffffff,
  });
  g.add(box(0.4, 1.0, 2.6, stripe, 0, 0, 0));
  for (const s of [-1, 1]) {
    g.add(box(0.16, 1.0, 0.16, flatMat('#c8c0b0'), 0, 0, s * 1.1));
  }
  if (ctx?.solids) ctx.solids.bounds(x - 0.4, z - 1.4, x + 0.4, z + 1.4, 'barricade');
  return g;
}

// --- population ------------------------------------------------------------

function populateOnett(zone) {
  /** @type {Array<[string, number, number, number, string[], object]>} */
  const cast = [
    ['neighborKid', 8, -37, SHELF_Y, [
      "Oh — it's you. Did the noise wake you up too?",
      'Something fell out of the sky and landed up on the hill. The whole house shook!',
    ], { wander: 2.5 }],
    ['mom', -20.5, -36.5, SHELF_Y, [
      "Don't wander too far, dear.",
      'And put on a jacket if it gets cold up on that hill.',
    ], { wander: 0 }],
    ['townsman', -34, -28.5, SHELF_Y, [
      'The police blocked the road up the hill an hour ago.',
      'Nobody in this town has slept since that thing came down.',
    ], { wander: 3 }],
    ['granny', 20, -24.5, SHELF_Y, [
      'In sixty years I have never heard a bang like that.',
      'Not even when my husband tried to fix the boiler.',
    ], { wander: 0 }],
    ['dog', -8, -34, SHELF_Y, ['Woof!'], { wander: 4, speed: 3.4, scale: 0.9 }],

    ['cop', 30.5, -54.5, HILL_Y, [
      'Police business, kid. The hill is closed.',
      "...Between you and me? I have no idea what that thing is either.",
    ], { wander: 0 }],
    ['cop', 26, -50, HILL_Y, [
      'Keep behind the barricade, please.',
    ], { wander: 1.5 }],

    ['photographer', -6, 4.8, TOWN_Y, [
      'Say — you have a great face for a photograph!',
      'I take pictures all over the world. One day I will get one of you.',
    ], { wander: 0 }],
    ['businessman', -28, 6.4, TOWN_Y, [
      'Meteorite or no meteorite, the shops open at nine.',
    ], { wander: 4 }],
    ['townswoman', -44, 6.2, TOWN_Y, [
      'The drug store has everything. Bandages, cola, umbrellas...',
    ], { wander: 3 }],
    ['punk', 24, 6.2, TOWN_Y, [
      'This is our street, got it?',
      'Ahh, forget it. My high score is unbeatable anyway.',
    ], { wander: 2 }],
    ['neighborKidSmall', 17, 5.4, TOWN_Y, [
      'I spent all my allowance in the arcade.',
      'Worth it!',
    ], { wander: 2 }],
    ['townsman', 44, 20.6, TOWN_Y, [
      'The hotel is nice, but the walls are thin.',
      'You can hear the guy in the next room dreaming.',
    ], { wander: 3 }],
    ['nurse', -44, 21, TOWN_Y, [
      'If you get hurt out there, come straight to the hospital.',
      "We're open through the night, and it has been a long one already.",
    ], { wander: 0 }],
    ['townswoman', 8, 44, TOWN_Y, [
      'That road goes south to Twoson.',
      'It is a long walk. Longer than you think.',
    ], { wander: 2.5 }],
    ['dog', 30, 12, TOWN_Y, ['Arf!'], { wander: 6, speed: 3.8, scale: 0.9 }],
  ];

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
