/**
 * ONETT — the first town.
 *
 * Laid out to follow the shape of the original: a hillside town that climbs
 * from the south-west corner up to the north-east in a switchback. You come in
 * from the Twoson road at the bottom, the road turns east along the shopping
 * street, turns north again at its far end, and arrives at the residential
 * shelf where your house and the neighbours' sit. Above and beyond those, up a
 * dirt track behind a police barricade, is the meteorite.
 *
 *   A  y = 0     south — the way in from Twoson, two houses
 *   B  y = 2.8   main street — drug store, bakery, library, burger, arcade,
 *                hotel, and the civic row facing them
 *   C  y = 5.8   residential — your house, the neighbours, hospital, town sign
 *   D  y = 9.6   the hill — crater, meteorite, barricade
 *
 * This is drawn from the shape of the original's map rather than from a copy of
 * it: the landmarks and the way they connect, not a survey.
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
import { Actor } from '../entities/actor.js';

// --- level constants -------------------------------------------------------

export const SOUTH_Y = 0;      // A: the way in
export const MAIN_Y = 2.8;     // B: the shopping street
export const HOUSE_Y = 5.8;    // C: the residential shelf
export const HILL_Y = 9.6;     // D: the meteorite

/** Kept for anything still importing the old names. */
export const TOWN_Y = MAIN_Y;
export const SHELF_Y = HOUSE_Y;

const BOUNDS = { x0: -72, x1: 72, z0: -86, z1: 62 };

/**
 * Terrace seams. Each terrace is a rectangle of walkable ground; the stairs
 * that join them have to sit *inside* one of the two, never straddling the
 * seam, or the flight ends up buried in the plate above it.
 */
const SEAM_AB = 28;    // south terrace meets main street here
const SEAM_BC = -8;    // main street meets the residential shelf
const SEAM_CD = -50;   // the shelf meets the foot of the hill

/**
 * Buildings are deliberately small: three to four character-heights, the way
 * they read in the reference art. Earlier they were nearer six, which made the
 * cast look like pedestrians in a real town rather than characters in a toy one.
 */
const HOUSE_H = 2.7;      // per storey
const SHOP_H = 3.3;

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
  addSurroundingLand(S, { y: SOUTH_Y, seed: 9 });
  addBackdrop(S, { radius: 186, seed: 5 });
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
  // Terraces — the town climbs south-west to north-east
  // ======================================================================

  terrace(zone, BOUNDS.x0, SEAM_AB, BOUNDS.x1, BOUNDS.z1, SOUTH_Y, 14);          // A
  terrace(zone, BOUNDS.x0, SEAM_BC, BOUNDS.x1, SEAM_AB, MAIN_Y, 9);              // B
  // C wraps around the west and south of the hill, the way the shelf does in
  // the original — that wrap is what leaves room for the track up.
  terrace(zone, BOUNDS.x0, -62, 30, SEAM_BC, HOUSE_Y, 9);                        // C west
  terrace(zone, 30, SEAM_CD, BOUNDS.x1, SEAM_BC, HOUSE_Y, 9);                    // C east
  terrace(zone, 30, BOUNDS.z0, BOUNDS.x1, SEAM_CD, HILL_Y, 13, {                 // D
    topTex: repeated(T.dirtPath(), 5, 4),
  });

  // The switchback: west flight up to the shopping street, east flight up to
  // the houses, dirt steps east onto the hill.
  stairs(zone, -52, SEAM_AB, -42, 36, MAIN_Y, SOUTH_Y, 'z', { steps: 9 });
  stairs(zone, 52, SEAM_BC, 62, 0, HOUSE_Y, MAIN_Y, 'z', { steps: 9 });
  stairs(zone, 22, -60, 30, -52, HOUSE_Y, HILL_Y, 'x', {
    steps: 11, rail: false, tex: repeated(T.dirtPath(), 2, 1),
  });

  // ======================================================================
  // Roads
  // ======================================================================

  // A: the Twoson road comes in at the south-west and turns east.
  pave(zone, -52, 36, -42, BOUNDS.z1, SOUTH_Y, T.road(), 8);
  pave(zone, -42, 46, 30, 56, SOUTH_Y, T.road(), 8);
  pave(zone, -55.4, 36, -52, BOUNDS.z1, SOUTH_Y, T.walk(), 6);
  pave(zone, -42, 36, -38.6, 46, SOUTH_Y, T.walk(), 6);
  pave(zone, -42, 56, 30, 59.4, SOUTH_Y, T.walk(), 6);
  pave(zone, -42, 42.6, 30, 46, SOUTH_Y, T.walk(), 6);

  // B: main street, east–west across the middle terrace.
  pave(zone, BOUNDS.x0, 6, 62, 15, MAIN_Y, T.road(), 8);
  pave(zone, BOUNDS.x0, 2.6, 62, 6, MAIN_Y, T.walk(), 6);
  pave(zone, BOUNDS.x0, 15, 62, 18.4, MAIN_Y, T.walk(), 6);
  kerb(zone, BOUNDS.x0, 5.9, 62, 6.1, MAIN_Y);
  kerb(zone, BOUNDS.x0, 14.9, 62, 15.1, MAIN_Y);
  // the landing where the west flight arrives
  pave(zone, -54, 18.4, -40, SEAM_AB, MAIN_Y, T.walk(), 6);
  // and the approach to the east flight
  pave(zone, 52, 0, 62, 6, MAIN_Y, T.walk(), 6);

  const dash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 122),
    new THREE.MeshLambertMaterial({
      map: repeated(T.roadLine(), 1, 24), transparent: true, alphaTest: 0.35,
    }),
  );
  dash.rotation.x = -Math.PI / 2;
  dash.rotation.z = Math.PI / 2;
  dash.position.set(-4, MAIN_Y + 0.05, 10.5);
  S.add(dash);

  // C: the residential street, and the dead-end spur north to the town sign.
  pave(zone, -44, -26, 64, -17, HOUSE_Y, T.road(), 8);
  pave(zone, -44, -29.4, 64, -26, HOUSE_Y, T.walk(), 6);
  pave(zone, -44, -17, 64, -13.6, HOUSE_Y, T.walk(), 6);
  kerb(zone, -44, -26.1, 64, -25.9, HOUSE_Y);
  kerb(zone, -44, -17.1, 64, -16.9, HOUSE_Y);
  pave(zone, 52, -13.6, 62, SEAM_BC, HOUSE_Y, T.walk(), 6);
  // north spur, dead-ending at the town sign
  pave(zone, -4, -46, 5, -26, HOUSE_Y, T.road(), 8);
  pave(zone, -7.4, -46, -4, -26, HOUSE_Y, T.walk(), 6);
  pave(zone, 5, -46, 8.4, -26, HOUSE_Y, T.walk(), 6);
  // east road, dead-ending toward the lake
  pave(zone, 64, -26, 72, -17, HOUSE_Y, T.dirtPath(), 7, 'dirt');
  // the dirt track that leaves the street and climbs onto the hill
  pave(zone, 16, -56, 22, -29.4, HOUSE_Y, T.dirtPath(), 7, 'dirt');
  pave(zone, 16, -61, 22, -51, HOUSE_Y, T.dirtPath(), 7, 'dirt');

  // ======================================================================
  // C — the residential shelf: your house and the neighbours'
  // ======================================================================

  S.add(building({
    name: "player's house", x: 34, z: -38, y: HOUSE_Y, w: 11, d: 9,
    h: HOUSE_H, storeys: 2, wall: P.wallCream, wallTex: 'siding',
    roof: P.roofRed, roofType: 'gable', ridge: 'x', roofH: 2.0, roofOverhang: 0.8,
    chimney: true, trim: shade(P.wallCream, -0.22), cornice: true,
    base: { tex: 'stone', h: 0.6 }, yaw: -0.02, roofTilt: 0.016,
    doors: [{ side: 'south', offset: -1.4, target: 'nessHouse', spawn: 'front', label: 'HOME' }],
    windows: [
      { side: 'south', offset: 2.8, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofRed },
      { side: 'south', offset: -2.9, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'south', offset: 2.8, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'east', offset: 0, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'west', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));
  S.add(fence(30.4, -31.4, HOUSE_Y, 3.2, 'x', ctx, P.wallWhite));
  S.add(fence(37.6, -31.4, HOUSE_Y, 4.8, 'x', ctx, P.wallWhite));
  pave(zone, 31.4, -32.6, 34.2, -29.4, HOUSE_Y, T.walk(), 4);
  S.add(mailbox(36.2, -31.9, HOUSE_Y, ctx));
  S.add(tree(26, -37, HOUSE_Y, { scale: 1.05 }, ctx));
  S.add(flowerPatch(28.5, -32, HOUSE_Y, 7));

  S.add(building({
    name: 'neighbours', x: 51, z: -38, y: HOUSE_Y, w: 11, d: 9,
    h: HOUSE_H, storeys: 2, wall: P.wallSky, wallTex: 'siding',
    roof: P.roofBlue, roofType: 'gable', ridge: 'x', roofH: 2.0, roofOverhang: 0.8,
    chimney: true, trim: P.wallWhite, cornice: true,
    base: { tex: 'stone', h: 0.6 }, yaw: 0.025, roofTilt: -0.014,
    doors: [{ side: 'south', offset: 1.3, target: 'neighborHouse', spawn: 'front', label: "NEIGHBOUR'S HOUSE" }],
    windows: [
      { side: 'south', offset: -2.9, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofBlue },
      { side: 'south', offset: -2.9, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'south', offset: 2.8, y: 3.7, w: 1.3, h: 1.3 },
      { side: 'west', offset: 0, y: 1.0, w: 1.3, h: 1.4 },
    ],
  }, ctx));
  S.add(fence(47.4, -31.4, HOUSE_Y, 4.8, 'x', ctx, P.wallWhite));
  S.add(fence(54.6, -31.4, HOUSE_Y, 3.2, 'x', ctx, P.wallWhite));
  pave(zone, 51.6, -32.6, 54.4, -29.4, HOUSE_Y, T.walk(), 4);
  S.add(mailbox(50.2, -31.9, HOUSE_Y, ctx));
  S.add(tree(59, -36, HOUSE_Y, { scale: 1.15 }, ctx));

  // Hospital, out at the west end of the shelf.
  const hospital = building({
    name: 'hospital', x: -34, z: -36, y: HOUSE_Y, w: 16, d: 11, h: 4.0,
    wall: P.wallWhite, wallTex: 'stucco', roof: '#c8c4b8', roofType: 'flat',
    cornice: '#dfe6ea', pilasters: true, base: { tex: 'stone', h: 0.7 },
    signBand: { y: 3.0 }, yaw: 0.015,
    sign: { text: 'HOSPITAL', bg: '#eef4f8', fg: '#d04848', side: 'south', y: 3.05, w: 8, h: 1.1 },
    doors: [{ side: 'south', offset: 0, target: 'hospital', spawn: 'front', kind: 'glass', label: 'HOSPITAL' }],
    windows: [
      { side: 'south', offset: -5.2, y: 1.1, w: 2.0, h: 1.5 },
      { side: 'south', offset: 5.2, y: 1.1, w: 2.0, h: 1.5 },
      { side: 'east', offset: 0, y: 1.3, w: 1.4, h: 1.4 },
      { side: 'west', offset: 0, y: 1.3, w: 1.4, h: 1.4 },
    ],
  }, ctx);
  const crossMat = flatMat('#d04848');
  const cross = new THREE.Group();
  cross.add(box(1.3, 0.42, 0.14, crossMat, 0, 0, 0));
  cross.add(box(0.42, 1.3, 0.14, crossMat, 0, -0.44, 0));
  cross.position.set(0, 4.9, 5.7);
  hospital.add(cross);
  S.add(hospital);
  pave(zone, -35.6, -30.6, -32.4, -29.4, HOUSE_Y, T.walk(), 4);

  // The dead-end at the top of the north spur: the town sign.
  S.add(signPost(0.5, -44, HOUSE_Y, 'ONETT', ctx, { bg: '#3a7a52', fg: '#fff6e0' }));
  for (const x of [-10, -14, 10, 14]) S.add(hedge(x, -45, HOUSE_Y, 4, 2.4, 1.3, ctx));
  S.add(tree(-12, -38, HOUSE_Y, { scale: 1.2, kind: 'pine' }, ctx));
  S.add(tree(13, -40, HOUSE_Y, { scale: 1.1, kind: 'pine' }, ctx));

  // The east road out toward the lake.
  S.add(signPost(67, -28.5, HOUSE_Y, 'LAKE >', ctx, { rotation: -0.3 }));
  zone.interactables.push({
    x: 70, z: -21, r: 3.4, name: 'east road',
    lines: ['The road east runs down to the lake, and past it, the way up Giant Step.',
      'Another day. There is still the hill to see.'],
  });

  for (const x of [-30, -6, 12, 34, 46]) S.add(lamp(x, -14.6, HOUSE_Y, ctx));
  S.add(car(-6, -21.5, HOUSE_Y, Math.PI / 2, '#d8d0c0', ctx));
  S.add(car(40, -21.5, HOUSE_Y, -Math.PI / 2, '#6a9ad0', ctx));

  // ======================================================================
  // B — the shopping street
  // ======================================================================

  const shopRow = [
    {
      name: 'drug store', x: -46, w: 13, wall: P.brick, wallTex: 'brick', roof: P.roofRed,
      sign: 'DRUG STORE', signBg: '#c03a30', awn: ['#3f9c4a', '#f4f0e2', true],
    },
    {
      name: 'bakery', x: -30, w: 11, wall: P.wallCream, wallTex: 'stucco', roof: P.roofOrange,
      sign: 'BAKERY', signBg: '#e0872c', awn: ['#e0872c', '#f4f0e2', false],
    },
    {
      name: 'library', x: -13, w: 12, wall: P.wallTan, wallTex: 'stucco', roof: P.roofGreen,
      sign: 'LIBRARY', signBg: '#3a7a52', awn: null,
    },
    {
      name: 'burger shop', x: 6, w: 12, wall: P.wallSalmon, wallTex: 'stucco', roof: '#d8563c',
      sign: 'BURGER', signBg: '#c03a30', awn: ['#f0c040', '#f4f0e2', false],
    },
  ];
  shopRow.forEach((s, i) => {
    S.add(building({
      name: s.name, x: s.x, z: -1.5, y: MAIN_Y, w: s.w, d: 9, h: SHOP_H,
      wall: s.wall, wallTex: s.wallTex, roof: s.roof, roofType: 'gable', ridge: 'x',
      roofH: 2.3, roofOverhang: 0.45, cornice: true, pilasters: true,
      base: { tex: 'cobble', h: 0.7 }, signBand: { y: SHOP_H - 1.2 },
      yaw: (i % 2 ? 0.014 : -0.012), roofTilt: (i % 2 ? -0.015 : 0.013),
      sign: { text: s.sign, bg: s.signBg, fg: '#fff6e0', side: 'south', y: SHOP_H - 1.2, w: s.w * 0.7, h: 1.0 },
      awning: s.awn ? { color: s.awn[0], color2: s.awn[1], check: s.awn[2], w: s.w * 0.6, side: 'south', y: 2.3 } : false,
      doors: [{
        side: 'south', offset: 0,
        target: s.name === 'drug store' ? 'drugstore' : null,
        spawn: 'drugstore', kind: 'glass', label: s.sign,
      }],
      windows: [
        { side: 'south', offset: -s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
        { side: 'south', offset: s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
      ],
    }, ctx));
  });

  // The arcade sits at the east end of main street, flat-roofed and lurid.
  const arcade = building({
    name: 'arcade', x: 24, z: -2, y: MAIN_Y, w: 14, d: 10, h: 3.9,
    wall: P.wallLilac, wallTex: 'stucco', roof: '#6a4a9a', roofType: 'flat',
    cornice: '#5a3a86', base: { tex: 'cobble', h: 0.7 }, pilasters: true, yaw: -0.01,
    sign: { text: 'ARCADE', bg: '#4a2a6a', fg: '#ffe060', side: 'south', y: 3.1, w: 8, h: 1.3 },
    doors: [{ side: 'south', offset: 0, target: 'arcade', spawn: 'arcade', kind: 'glass', label: 'ARCADE' }],
    windows: [
      { side: 'south', offset: -4.6, y: 0.9, w: 2.6, h: 1.6, lit: true },
      { side: 'south', offset: 4.6, y: 0.9, w: 2.6, h: 1.6, lit: true },
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
    b.position.set(-4.4 + i * 0.8, 3.95, 5.3);
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

  // Hotel, at the far east of the street by the stairs up to the houses.
  S.add(building({
    name: 'hotel', x: 43, z: -3, y: MAIN_Y, w: 15, d: 11, h: 2.8, storeys: 2,
    wall: P.wallSky, wallTex: 'siding', roof: P.roofBlue, roofType: 'hip', roofH: 2.0,
    trim: P.wallWhite, cornice: true, base: { tex: 'stone', h: 0.6 }, yaw: 0.012,
    sign: { text: 'HOTEL', bg: P.roofBlue, fg: '#ffffff', side: 'south', y: 2.2, w: 5, h: 1.0 },
    awning: { color: P.roofBlue, color2: '#e8f0f8', w: 4.2, side: 'south', y: 2.1 },
    doors: [{ side: 'south', offset: 0, target: 'hotel', spawn: 'hotel', kind: 'glass', label: 'HOTEL' }],
    windows: [
      { side: 'south', offset: -5, y: 0.9, w: 1.7, h: 1.3 },
      { side: 'south', offset: 5, y: 0.9, w: 1.7, h: 1.3 },
      { side: 'south', offset: -5, y: 3.7, w: 1.5, h: 1.3 },
      { side: 'south', offset: 0, y: 3.7, w: 1.5, h: 1.3 },
      { side: 'south', offset: 5, y: 3.7, w: 1.5, h: 1.3, lit: true },
      { side: 'west', offset: 0, y: 3.7, w: 1.5, h: 1.3 },
    ],
  }, ctx));

  // Civic row, facing the shops from the south side of the street.
  S.add(building({
    name: 'police station', x: -40, z: 22, y: MAIN_Y, w: 13, d: 9, h: 3.4,
    wall: P.wallTan, wallTex: 'brick', roof: P.roofBlue, roofType: 'gable', ridge: 'x',
    roofH: 1.7, cornice: true, base: { tex: 'stone', h: 0.7 }, pilasters: true, yaw: -0.014,
    sign: { text: 'POLICE', bg: '#2c3a6a', fg: '#f0f4ff', side: 'north', y: 2.4, w: 6, h: 1.0 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'POLICE STATION' }],
    windows: [
      { side: 'north', offset: -4, y: 1.0, w: 1.4, h: 1.4 },
      { side: 'north', offset: 4, y: 1.0, w: 1.4, h: 1.4 },
    ],
  }, ctx));

  const hall = building({
    name: 'city hall', x: -12, z: 22, y: MAIN_Y, w: 15, d: 11, h: 4.2,
    wall: P.wallCream, wallTex: 'stucco', roof: P.roofGreen, roofType: 'hip', roofH: 2.2,
    cornice: true, pilasters: true, base: { tex: 'stone', h: 0.9 }, yaw: 0.008,
    sign: { text: 'CITY HALL', bg: '#3a7a52', fg: '#fff6e0', side: 'north', y: 3.0, w: 7.5, h: 1.0 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'CITY HALL' }],
    windows: [
      { side: 'north', offset: -5.4, y: 1.2, w: 1.3, h: 1.9 },
      { side: 'north', offset: 5.4, y: 1.2, w: 1.3, h: 1.9 },
      { side: 'east', offset: 0, y: 1.3, w: 1.4, h: 1.5 },
      { side: 'west', offset: 0, y: 1.3, w: 1.4, h: 1.5 },
    ],
  }, ctx);
  const colMat = mat(repeated(T.concrete(), 1, 3), 0xf0ece0);
  for (const cx of [-3.0, 3.0]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 4.0, 8), colMat);
    col.position.set(cx, 2.0, -6.1);
    col.castShadow = true;
    hall.add(col);
  }
  hall.add(box(7.6, 0.34, 1.3, flatMat('#efe9dc'), 0, 4.0, -6.1));
  S.add(hall);

  S.add(building({
    name: 'house', x: 22, z: 22, y: MAIN_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofPurple, roofType: 'gable', ridge: 'x',
    roofH: 1.9, chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.02,
    doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'north', offset: -3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofPurple },
      { side: 'north', offset: 3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofPurple },
      { side: 'north', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));

  for (const x of [-58, -36, -18, 2, 20, 38]) {
    S.add(lamp(x, 3.4, MAIN_Y, ctx));
    S.add(lamp(x + 9, 17.4, MAIN_Y, ctx));
  }
  S.add(car(-24, 8.4, MAIN_Y, Math.PI / 2, '#d05050', ctx));
  S.add(car(14, 12.8, MAIN_Y, -Math.PI / 2, '#f0d060', ctx));
  S.add(car(-52, 12.8, MAIN_Y, -Math.PI / 2, '#58a878', ctx));

  const poles = [];
  for (const x of [-64, -44, -24, -4, 16, 36, 54]) {
    S.add(telephonePole(x, 17.8, MAIN_Y, ctx));
    poles.push({ x, y: MAIN_Y + 6.4, z: 17.8 });
  }
  for (let i = 0; i < poles.length - 1; i++) S.add(wire(poles[i], poles[i + 1]));

  for (const [x, z] of [[-52, 3.9], [-2, 16.9], [34, 3.9]]) S.add(hydrant(x, z, MAIN_Y, ctx));
  for (const [x, z, ry] of [[-36, 4.2, 0], [6, 16.6, Math.PI], [30, 4.2, 0]]) {
    S.add(bench(x, z, MAIN_Y, ry, ctx));
  }
  for (const [x, z] of [[-22, 4.0], [12, 17.2], [40, 4.0]]) S.add(trashCan(x, z, MAIN_Y, ctx));
  S.add(vendingMachine(37, 3.6, MAIN_Y, ctx));
  S.add(busStop(-56, 4.0, MAIN_Y, ctx));

  // ======================================================================
  // A — the way in from Twoson
  // ======================================================================

  S.add(signPost(-45, 52, SOUTH_Y, '< TWOSON', ctx, { rotation: 0.2 }));
  zone.interactables.push({
    x: -47, z: 60, r: 4.0, name: 'road west',
    lines: ['The road west leaves town toward Twoson.',
      'Not today. There is still too much of Onett left to see.'],
  });

  S.add(building({
    name: 'house', x: -14, z: 36, y: SOUTH_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallSalmon, wallTex: 'siding', roof: P.roofGrey, roofType: 'gable', ridge: 'x',
    roofH: 1.9, chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: -0.018,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));
  S.add(tree(-24, 38, SOUTH_Y, { scale: 1.15 }, ctx));

  S.add(building({
    name: 'house', x: 16, z: 36, y: SOUTH_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofRed, roofType: 'hip', roofH: 1.9,
    cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.02,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
    ],
  }, ctx));
  S.add(tree(27, 38, SOUTH_Y, { scale: 1.2 }, ctx));
  S.add(bush(3, 40, SOUTH_Y, ctx, { scale: 1.1 }));

  for (const x of [-46, 4, 26]) S.add(lamp(x, 41.6, SOUTH_Y, ctx));
  S.add(car(-47, 50, SOUTH_Y, 0, '#8a7ab8', ctx));

  // ======================================================================
  // D — the hill
  // ======================================================================

  buildMeteoriteHill(zone, S, ctx);

  // ======================================================================
  // Boundary planting — trees and hedges marking where the town stops
  // ======================================================================

  for (let z = 32; z < 60; z += 7) {
    S.add(tree(BOUNDS.x0 + 3, z, SOUTH_Y, { scale: 1.1, kind: z % 14 === 0 ? 'pine' : 'round' }, ctx));
    S.add(tree(BOUNDS.x1 - 3, z + 3, SOUTH_Y, { scale: 1.15 }, ctx));
  }
  for (let x = -66; x < 68; x += 8) {
    if (x > -52 && x < -38) continue;                 // leave the Twoson road open
    S.add(tree(x, BOUNDS.z1 - 3, SOUTH_Y, { scale: 1.15, kind: x % 16 === 0 ? 'pine' : 'round' }, ctx));
  }
  for (let z = -6; z < 26; z += 6) {
    S.add(hedge(BOUNDS.x0 + 1.4, z, MAIN_Y, 2.4, 6, 1.3, ctx));
    S.add(hedge(BOUNDS.x1 - 1.4, z, MAIN_Y, 2.4, 6, 1.3, ctx));
  }
  for (let z = -48; z < -12; z += 6) {
    S.add(hedge(BOUNDS.x0 + 1.4, z, HOUSE_Y, 2.4, 6, 1.3, ctx));
  }
  // the top of the shelf, north of the town sign: a treeline, then the hill
  for (let x = -66; x < 14; x += 7) {
    S.add(tree(x, -59, HOUSE_Y, { scale: 1.2, kind: 'pine' }, ctx));
  }
  for (let x = -66; x < -14; x += 8) {
    S.add(tree(x, -50, HOUSE_Y, { scale: 1.05, kind: x % 16 === 0 ? 'round' : 'pine' }, ctx));
  }
  for (const [x, z, y] of [
    [-54, 3.2, MAIN_Y], [-20, 3.2, MAIN_Y], [18, 16.6, MAIN_Y], [44, 3.2, MAIN_Y],
    [-8, -14.2, HOUSE_Y], [24, -14.2, HOUSE_Y], [-40, -14.2, HOUSE_Y],
  ]) {
    S.add(bush(x, z, y, ctx, { scale: 0.9 }));
  }

  // ======================================================================
  // Spawns and cast
  // ======================================================================

  zone.addSpawn('start', 33.0, -30.0, HOUSE_Y, 'down');
  zone.addSpawn('front', 33.0, -30.0, HOUSE_Y, 'down');
  zone.addSpawn('neighborHouse', 53.0, -30.0, HOUSE_Y, 'down');
  zone.addSpawn('drugstore', -46, 5.6, MAIN_Y, 'down');
  zone.addSpawn('arcade', 24, 5.8, MAIN_Y, 'down');
  zone.addSpawn('hotel', 43, 5.6, MAIN_Y, 'down');
  zone.addSpawn('hospital', -34, -27.6, HOUSE_Y, 'down');

  populateOnett(zone);
  return zone;
}

// --- the hill --------------------------------------------------------------

function buildMeteoriteHill(zone, S, ctx) {
  const MX = 48;
  const MZ = -68;

  // Scorched ground and a shallow crater.
  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 22),
    new THREE.MeshLambertMaterial({ map: repeated(T.scorch(), 2.6, 2.6) }),
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(MX, HILL_Y + 0.04, MZ);
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
  halo.position.set(MX, HILL_Y + 0.03, MZ);
  S.add(halo);

  // The meteorite: a faceted lump, glowing where it split open.
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a58 });
  const meteor = new THREE.Group();
  meteor.position.set(MX, HILL_Y, MZ);
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
  const glowLight = new THREE.PointLight(0xff7a4a, 2.6, 22, 2);
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
    p.position.set(MX + Math.random() * 2 - 1, HILL_Y + 2 + i * 1.1, MZ + Math.random() * 2 - 1);
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
    rock.position.set(MX + dx, HILL_Y + r * 0.55, MZ + dz);
    rock.rotation.set(dx, dz, r);
    rock.castShadow = true;
    S.add(rock);
    ctx.solids.circle(MX + dx, MZ + dz, r * 0.9, 'rock');
  }

  // Police barricade at the top of the dirt track, with a gap to squeeze past.
  for (const [bx, bz] of [[32.5, -58.5], [32.5, -53.0]]) {
    S.add(barricade(bx, bz, HILL_Y, ctx));
  }
  S.add(signPost(34.5, -51.0, HILL_Y, 'KEEP OUT', ctx, { bg: '#f0e0a0', fg: '#c03828', rotation: -0.5 }));

  // Hilltop trees and hedges around the rim.
  for (const [tx, tz] of [[62, -78], [38, -80], [66, -58], [34, -72], [56, -54]]) {
    S.add(tree(tx, tz, HILL_Y, { scale: 1.1, kind: 'pine' }, ctx));
  }
  for (let z = -82; z < -54; z += 6) S.add(hedge(70.6, z, HILL_Y, 2.4, 6, 1.3, ctx));
  for (let x = 34; x < 70; x += 6) S.add(hedge(x, -84.6, HILL_Y, 6, 2.4, 1.3, ctx));
  for (let z = -84; z < -62; z += 6) S.add(hedge(31.4, z, HILL_Y, 2.4, 6, 1.3, ctx));

  zone.interactables.push({
    x: MX, z: MZ + 5.5, r: 4.0, name: 'meteorite', speaker: 'METEORITE',
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
    // C — the residential shelf
    ['neighborKid', 42.5, -30.2, HOUSE_Y, [
      "Oh — it's you. Did the noise wake you up too?",
      'Something fell out of the sky and landed up on the hill. The whole house shook!',
    ], { wander: 2.5 }],
    ['mom', 30.0, -30.4, HOUSE_Y, [
      "Don't wander too far, dear.",
      'And put on a jacket if it gets cold up on that hill.',
    ], { wander: 0 }],
    ['granny', -28, -27.6, HOUSE_Y, [
      'In sixty years I have never heard a bang like that.',
      'Not even when my husband tried to fix the boiler.',
    ], { wander: 0 }],
    ['townsman', 6, -27.8, HOUSE_Y, [
      'The police blocked the track up the hill an hour ago.',
      'Nobody in this town has slept since that thing came down.',
    ], { wander: 3 }],
    ['dog', 46, -27.5, HOUSE_Y, ['Woof!'], { wander: 4, speed: 3.4, scale: 0.9 }],

    // D — the hill
    ['cop', 33.5, -55.8, HILL_Y, [
      'Police business, kid. The hill is closed.',
      "...Between you and me? I have no idea what that thing is either.",
    ], { wander: 0 }],
    ['cop', 36, -51.5, HILL_Y, [
      'Keep behind the barricade, please.',
    ], { wander: 1.5 }],

    // B — main street
    ['photographer', -6, 4.5, MAIN_Y, [
      'Say — you have a great face for a photograph!',
      'I take pictures all over the world. One day I will get one of you.',
    ], { wander: 0 }],
    ['businessman', -25, 4.4, MAIN_Y, [
      'Meteorite or no meteorite, the shops open at nine.',
    ], { wander: 2 }],
    ['townswoman', -39, 4.4, MAIN_Y, [
      'The drug store has everything. Bandages, cola, umbrellas...',
    ], { wander: 2.5 }],
    ['punk', 17, 4.6, MAIN_Y, [
      'This is our street, got it?',
      'Ahh, forget it. My high score is unbeatable anyway.',
    ], { wander: 2 }],
    ['neighborKidSmall', 22.5, 5.6, MAIN_Y, [
      'I spent all my allowance in the arcade.',
      'Worth it!',
    ], { wander: 2 }],
    ['nurse', -44, 4.4, MAIN_Y, [
      'If you get hurt out there, come straight to the hospital.',
      "We're open through the night, and it has been a long one already.",
    ], { wander: 0 }],
    ['townsman', 41, 16.6, MAIN_Y, [
      'The hotel is nice, but the walls are thin.',
      'You can hear the guy in the next room dreaming.',
    ], { wander: 3 }],
    ['dog', 2, 16.8, MAIN_Y, ['Arf!'], { wander: 6, speed: 3.8, scale: 0.9 }],

    // A — the way in from Twoson
    ['townswoman', -30, 44.4, SOUTH_Y, [
      'That road west goes to Twoson.',
      'It is a long walk. Longer than you think.',
    ], { wander: 2.5 }],
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
