/**
 * ONETT — the first town, and the country north of it.
 *
 * Laid out to follow the shape of the original: a hillside town that climbs
 * from the south-west corner up to the north-east in a switchback. You come in
 * from the Twoson road at the bottom, the road turns east along the shopping
 * street, turns north again at its far end, and arrives at the residential
 * shelf where your house and the neighbours' sit. From there a lane runs north
 * past the town sign, the pavement gives out, and the hills begin.
 *
 *   A  y = 0     south — the way in from Twoson, two houses
 *   B  y = 2.8   the city — the shopping street and the civic row, with a
 *                green between the shops and the shelf above
 *   C  y = 5.8   home — your house, the neighbours, the hospital, the sign
 *   —            the country, which is not a terrace at all: see terrain.js
 *
 * The three built pieces are deliberately far apart. Each one wants to read as
 * somewhere you have gone *to*, not as another quarter of the same block, and
 * the walk between them is what sells that.
 *
 * The country is the opposite idea. The town is genuinely on a grid and
 * rectangles are honest for it; the hills are a continuous height function, so
 * the walk out to the impact site wanders, and what turns you back is a
 * hillside you can see rather than an edge you cannot.
 *
 * This is drawn from the shape of the original's map rather than from a copy of
 * it: the landmarks and the way they connect, not a survey.
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';
import { T, repeated, signTexture, rng } from '../core/tex.js';
import {
  Zone, addSky, addClouds, addOutdoorLight, addBackdrop, addSurroundingLand,
  terrace, pave, kerb, stairs,
} from './zone.js';
import { makeCountry, countryMesh, countryTrail, scatterCountry } from './terrain.js';
import { timePreset, DEFAULT_TIME } from './daylight.js';
import {
  building, tree, hedge, fence, lamp, signPost, car, bush, flowerPatch,
  grassTufts, box, flatMat, mat, decal,
} from './build.js';
import { Actor } from '../entities/actor.js';

// --- level constants -------------------------------------------------------

export const SOUTH_Y = 0;      // A: the way in
export const MAIN_Y = 2.8;     // B: the city
export const HOUSE_Y = 5.8;    // C: home

/** Kept for anything still importing the old names. */
export const TOWN_Y = MAIN_Y;
export const SHELF_Y = HOUSE_Y;
export const HILL_Y = 15.0;

const BOUNDS = { x0: -110, x1: 110, z0: -196, z1: 96 };

/**
 * Terrace seams. Each terrace is a rectangle of walkable ground; the stairs
 * that join them have to sit *inside* one of the two, never straddling the
 * seam, or the flight ends up buried in the plate above it.
 */
const SEAM_AB = 46;    // the south road meets the city
const SEAM_BC = -16;   // the city meets home
const SEAM_CW = -76;   // home meets open country

/** Where the meteorite came down, far out in the hills. */
const IMPACT = { x: -4.6, z: -158 };

/**
 * Buildings are deliberately small: three to four character-heights, the way
 * they read in the reference art. Earlier they were nearer six, which made the
 * cast look like pedestrians in a real town rather than characters in a toy one.
 */
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
  // Countryside under and around the town, so the boundary is a place you
  // cannot walk rather than the edge of the world. The hills north of Onett
  // own their own stretch of horizon, so this stays clear of them.
  addSurroundingLand(S, {
    y: SOUTH_Y, seed: 9, size: 900,
    keepOut: { x0: -190, x1: 190, z0: -260, z1: -66 },
  });
  addBackdrop(S, { radius: 268, seed: 5 });
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
  // The three built terraces, climbing south to north
  // ======================================================================

  terrace(zone, BOUNDS.x0, SEAM_AB, BOUNDS.x1, BOUNDS.z1, SOUTH_Y, 14);     // A
  terrace(zone, BOUNDS.x0, SEAM_BC, BOUNDS.x1, SEAM_AB, MAIN_Y, 9);         // B
  terrace(zone, BOUNDS.x0, SEAM_CW, BOUNDS.x1, SEAM_BC, HOUSE_Y, 9);        // C

  // The switchback: west flight down to the south road, east flight up home.
  stairs(zone, -84, SEAM_AB, -74, 54, MAIN_Y, SOUTH_Y, 'z', { steps: 9 });
  stairs(zone, 84, SEAM_BC, 94, -8, HOUSE_Y, MAIN_Y, 'z', { steps: 9 });

  // ======================================================================
  // The country: hills, and the walk out to the impact site
  // ======================================================================

  const country = makeCountry({
    seed: 5, southZ: SEAM_CW, northZ: BOUNDS.z0,
    baseY: HOUSE_Y, topY: 17.0, impact: IMPACT,
  });
  zone.country = country;
  zone.ground.field(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, SEAM_CW, country.height,
    { maxSlope: 0.75, tag: 'country' });
  // The visible land runs well past where you can walk, and past the map edge.
  S.add(countryMesh(country, { x0: -190, x1: 190, z0: -252, z1: SEAM_CW, step: 2.8 }));
  S.add(countryTrail(country, { from: SEAM_CW - 1, to: IMPACT.z + 4, segments: 84 }));

  // ======================================================================
  // Roads
  // ======================================================================

  // A: the Twoson road comes in at the south-west and turns east.
  pave(zone, -84, 54, -74, BOUNDS.z1, SOUTH_Y, T.road(), 8);
  pave(zone, -74, 68, 48, 78, SOUTH_Y, T.road(), 8);
  pave(zone, -87.4, 54, -84, BOUNDS.z1, SOUTH_Y, T.walk(), 6);
  pave(zone, -74, 54, -70.6, 68, SOUTH_Y, T.walk(), 6);
  pave(zone, -74, 78, 48, 81.4, SOUTH_Y, T.walk(), 6);
  pave(zone, -74, 64.6, 48, 68, SOUTH_Y, T.walk(), 6);
  pave(zone, -86, 54, -72, 60, SOUTH_Y, T.walk(), 6);          // stair landing
  kerb(zone, -74, 67.9, 48, 68.1, SOUTH_Y);
  kerb(zone, -74, 77.9, 48, 78.1, SOUTH_Y);

  // B: main street, east–west across the middle terrace.
  pave(zone, BOUNDS.x0, 20, 96, 30, MAIN_Y, T.road(), 8);
  pave(zone, BOUNDS.x0, 16.6, 96, 20, MAIN_Y, T.walk(), 6);
  pave(zone, BOUNDS.x0, 30, 96, 33.4, MAIN_Y, T.walk(), 6);
  kerb(zone, BOUNDS.x0, 19.9, 96, 20.1, MAIN_Y);
  kerb(zone, BOUNDS.x0, 29.9, 96, 30.1, MAIN_Y);
  pave(zone, -86, 33.4, -72, SEAM_AB, MAIN_Y, T.walk(), 6);    // west flight arrives
  pave(zone, 84, -8, 94, 20, MAIN_Y, T.walk(), 6);             // east flight leaves

  const dash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 200),
    new THREE.MeshLambertMaterial({
      map: repeated(T.roadLine(), 1, 40), transparent: true, alphaTest: 0.35,
    }),
  );
  dash.rotation.x = -Math.PI / 2;
  dash.rotation.z = Math.PI / 2;
  dash.position.set(-6, MAIN_Y + 0.05, 25);
  S.add(dash);

  // C: the residential street, and the lane north to the sign and the hills.
  pave(zone, -72, -44, 96, -35, HOUSE_Y, T.road(), 8);
  pave(zone, -72, -47.4, 96, -44, HOUSE_Y, T.walk(), 6);
  pave(zone, -72, -35, 96, -31.6, HOUSE_Y, T.walk(), 6);
  kerb(zone, -72, -44.1, 96, -43.9, HOUSE_Y);
  kerb(zone, -72, -35.1, 96, -34.9, HOUSE_Y);
  pave(zone, 84, -31.6, 94, SEAM_BC, HOUSE_Y, T.walk(), 6);
  // the lane north — tarmac, then pavement, then dirt, then hills
  pave(zone, 8, -70, 18, -44, HOUSE_Y, T.road(), 8);
  pave(zone, 4.6, -70, 8, -44, HOUSE_Y, T.walk(), 6);
  pave(zone, 18, -70, 21.4, -44, HOUSE_Y, T.walk(), 6);
  pave(zone, 7, SEAM_CW, 21, -70, HOUSE_Y, T.dirtPath(), 7, 'dirt');
  // east road, dead-ending toward the lake
  pave(zone, 96, -44, BOUNDS.x1, -35, HOUSE_Y, T.dirtPath(), 7, 'dirt');

  // ======================================================================
  // C — home: your house, the neighbours', the hospital
  // ======================================================================

  S.add(building({
    name: "player's house", x: 40, z: -58, y: HOUSE_Y, w: 11, d: 9,
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
  S.add(fence(36.4, -51.4, HOUSE_Y, 3.2, 'x', ctx, P.wallWhite));
  S.add(fence(43.6, -51.4, HOUSE_Y, 4.8, 'x', ctx, P.wallWhite));
  pave(zone, 37.4, -52.6, 40.2, -47.4, HOUSE_Y, T.walk(), 4);
  S.add(mailbox(42.2, -51.9, HOUSE_Y, ctx));
  S.add(tree(31, -57, HOUSE_Y, { scale: 1.05 }, ctx));
  S.add(flowerPatch(33.5, -52, HOUSE_Y, 7));

  S.add(building({
    name: 'neighbours', x: 60, z: -58, y: HOUSE_Y, w: 11, d: 9,
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
  S.add(fence(56.4, -51.4, HOUSE_Y, 4.8, 'x', ctx, P.wallWhite));
  S.add(fence(63.6, -51.4, HOUSE_Y, 3.2, 'x', ctx, P.wallWhite));
  pave(zone, 60.6, -52.6, 63.4, -47.4, HOUSE_Y, T.walk(), 4);
  S.add(mailbox(59.2, -51.9, HOUSE_Y, ctx));
  S.add(tree(69, -56, HOUSE_Y, { scale: 1.15 }, ctx));

  // Hospital, out at the west end of the shelf.
  const hospital = building({
    name: 'hospital', x: -44, z: -56, y: HOUSE_Y, w: 16, d: 11, h: 4.0,
    wall: P.wallWhite, wallTex: 'stucco', roof: '#c8c4b8', roofType: 'flat',
    cornice: '#dfe6ea', pilasters: true, base: { tex: 'stone', h: 0.7 },
    signBand: { y: 3.0 }, yaw: 0.015,
    sign: { text: 'HOSPITAL', bg: '#eef4f8', fg: '#d04848', icon: 'cross', side: 'south', y: 3.05, w: 8.5, h: 1.2 },
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
  pave(zone, -45.6, -50.6, -42.4, -47.4, HOUSE_Y, T.walk(), 4);
  S.add(tree(-58, -56, HOUSE_Y, { scale: 1.1 }, ctx));
  S.add(bush(-30, -52, HOUSE_Y, ctx, { scale: 1.0 }));

  // Where the pavement ends: the town sign, and then the hills.
  S.add(signPost(24, -70, HOUSE_Y, 'ONETT', ctx, { bg: '#3a7a52', fg: '#fff6e0', rotation: -0.35 }));
  zone.interactables.push({
    x: 13, z: -73, r: 4.6, name: 'the way north',
    lines: ['The lane gives out here. Past the sign it is all hills.',
      'Somewhere out there, still smoking, is whatever came down last night.'],
  });

  // The east road out toward the lake.
  S.add(signPost(100, -46.5, HOUSE_Y, 'LAKE >', ctx, { rotation: -0.3 }));
  zone.interactables.push({
    x: 106, z: -39, r: 3.6, name: 'east road',
    lines: ['The road east runs down to the lake, and past it, the way up Giant Step.',
      'Another day. There are the hills to see first.'],
  });

  for (const x of [-52, -22, 4, 30, 56, 78]) S.add(lamp(x, -32.6, HOUSE_Y, ctx));
  S.add(car(-14, -39.5, HOUSE_Y, Math.PI / 2, '#d8d0c0', ctx));
  S.add(car(48, -39.5, HOUSE_Y, -Math.PI / 2, '#6a9ad0', ctx));
  S.add(bench(-4, -46.4, HOUSE_Y, Math.PI, ctx));
  S.add(trashCan(28, -46.6, HOUSE_Y, ctx));

  // ======================================================================
  // B — the city
  // ======================================================================

  const shopRow = [
    {
      name: 'drug store', x: -66, w: 13, wall: P.brick, wallTex: 'brick', roof: P.roofRed,
      sign: 'DRUG STORE', signBg: '#c03a30', icon: 'pill', awn: ['#3f9c4a', '#f4f0e2', true],
    },
    {
      name: 'bakery', x: -46, w: 11, wall: P.wallCream, wallTex: 'stucco', roof: P.roofOrange,
      sign: 'BAKERY', signBg: '#e0872c', icon: 'bread', awn: ['#e0872c', '#f4f0e2', false],
    },
    {
      name: 'library', x: -24, w: 12, wall: P.wallTan, wallTex: 'stucco', roof: P.roofGreen,
      sign: 'LIBRARY', signBg: '#3a7a52', icon: 'book', awn: null,
    },
    {
      name: 'burger shop', x: -2, w: 12, wall: P.wallSalmon, wallTex: 'stucco', roof: '#d8563c',
      sign: 'BURGER', signBg: '#c03a30', icon: 'burger', awn: ['#f0c040', '#f4f0e2', false],
    },
  ];
  shopRow.forEach((s, i) => {
    S.add(building({
      name: s.name, x: s.x, z: 11, y: MAIN_Y, w: s.w, d: 9, h: SHOP_H,
      wall: s.wall, wallTex: s.wallTex, roof: s.roof, roofType: 'gable', ridge: 'x',
      roofH: 2.3, roofOverhang: 0.32, cornice: true, pilasters: true,
      base: { tex: 'cobble', h: 0.7 }, signBand: { y: SHOP_H - 1.05 },
      yaw: (i % 2 ? 0.014 : -0.012), roofTilt: (i % 2 ? -0.015 : 0.013),
      sign: { text: s.sign, bg: s.signBg, fg: '#fff6e0', icon: s.icon, side: 'south', y: SHOP_H - 1.05, w: s.w * 0.78, h: 1.05 },
      awning: s.awn ? { color: s.awn[0], color2: s.awn[1], check: s.awn[2], w: s.w * 0.66, side: 'south', y: 1.95 } : false,
      doors: [{
        side: 'south', offset: 0,
        target: s.name === 'drug store' ? 'drugstore' : null,
        spawn: 'front', kind: 'glass', label: s.sign,
      }],
      windows: [
        { side: 'south', offset: -s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
        { side: 'south', offset: s.w * 0.3, y: 0.9, w: 2.0, h: 1.4 },
      ],
    }, ctx));
  });

  // The arcade sits at the east end of main street, flat-roofed and lurid.
  const arcade = building({
    name: 'arcade', x: 24, z: 10, y: MAIN_Y, w: 14, d: 10, h: 3.9,
    wall: P.wallLilac, wallTex: 'stucco', roof: '#6a4a9a', roofType: 'flat',
    cornice: '#5a3a86', base: { tex: 'cobble', h: 0.7 }, pilasters: true, yaw: -0.01,
    sign: { text: 'ARCADE', bg: '#4a2a6a', fg: '#ffe060', icon: 'arcade', side: 'south', y: 3.1, w: 8, h: 1.3 },
    doors: [{ side: 'south', offset: 0, target: 'arcade', spawn: 'front', kind: 'glass', label: 'ARCADE' }],
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

  // Hotel, at the far east of the street by the stairs up home.
  S.add(building({
    name: 'hotel', x: 52, z: 9.5, y: MAIN_Y, w: 15, d: 11, h: 2.8, storeys: 2,
    wall: P.wallSky, wallTex: 'siding', roof: P.roofBlue, roofType: 'hip', roofH: 2.0,
    trim: P.wallWhite, cornice: true, base: { tex: 'stone', h: 0.6 }, yaw: 0.012,
    sign: { text: 'HOTEL', bg: P.roofBlue, fg: '#ffffff', icon: 'bed', side: 'south', y: 2.5, w: 6, h: 1.1 },
    awning: { color: P.roofBlue, color2: '#e8f0f8', w: 4.6, side: 'south', y: 1.95 },
    doors: [{ side: 'south', offset: 0, target: 'hotel', spawn: 'front', kind: 'glass', label: 'HOTEL' }],
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
    name: 'police station', x: -60, z: 38, y: MAIN_Y, w: 13, d: 9, h: 3.4,
    wall: P.wallTan, wallTex: 'brick', roof: P.roofBlue, roofType: 'gable', ridge: 'x',
    roofH: 1.7, cornice: true, base: { tex: 'stone', h: 0.7 }, pilasters: true, yaw: -0.014,
    sign: { text: 'POLICE', bg: '#2c3a6a', fg: '#f0f4ff', icon: 'shield', side: 'north', y: 2.4, w: 7, h: 1.1 },
    doors: [{ side: 'north', offset: 0, target: null, label: 'POLICE STATION' }],
    windows: [
      { side: 'north', offset: -4, y: 1.0, w: 1.4, h: 1.4 },
      { side: 'north', offset: 4, y: 1.0, w: 1.4, h: 1.4 },
    ],
  }, ctx));

  const hall = building({
    name: 'city hall', x: -22, z: 38, y: MAIN_Y, w: 15, d: 11, h: 4.2,
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
    name: 'house', x: 22, z: 38, y: MAIN_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofPurple, roofType: 'gable', ridge: 'x',
    roofH: 1.9, chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.02,
    doors: [{ side: 'north', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'north', offset: -3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofPurple },
      { side: 'north', offset: 3.2, y: 1.0, w: 1.3, h: 1.4, shutters: P.roofPurple },
      { side: 'north', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));

  // The green between the shops and the shelf above: somewhere to stand still.
  townGreen(zone, S, ctx, 4, -4);

  for (const x of [-86, -62, -38, -14, 10, 34, 58, 80]) {
    S.add(lamp(x, 17.6, MAIN_Y, ctx));
    S.add(lamp(x + 11, 32.4, MAIN_Y, ctx));
  }
  S.add(car(-44, 22.4, MAIN_Y, Math.PI / 2, '#d05050', ctx));
  S.add(car(6, 27.2, MAIN_Y, -Math.PI / 2, '#f0d060', ctx));
  S.add(car(-72, 27.2, MAIN_Y, -Math.PI / 2, '#58a878', ctx));
  S.add(car(64, 22.4, MAIN_Y, Math.PI / 2, '#c8a0d8', ctx));

  const poles = [];
  for (const x of [-96, -74, -52, -30, -8, 14, 36, 58, 80]) {
    S.add(telephonePole(x, 32.9, MAIN_Y, ctx));
    poles.push({ x, y: MAIN_Y + 6.4, z: 32.9 });
  }
  for (let i = 0; i < poles.length - 1; i++) S.add(wire(poles[i], poles[i + 1]));

  for (const [x, z] of [[-78, 18.9], [-10, 31.9], [44, 18.9]]) S.add(hydrant(x, z, MAIN_Y, ctx));
  for (const [x, z, ry] of [[-56, 19.2, 0], [-2, 31.6, Math.PI], [40, 19.2, 0], [72, 31.6, Math.PI]]) {
    S.add(bench(x, z, MAIN_Y, ry, ctx));
  }
  for (const [x, z] of [[-34, 19.0], [18, 32.2], [66, 19.0]]) S.add(trashCan(x, z, MAIN_Y, ctx));
  S.add(vendingMachine(41, 18.6, MAIN_Y, ctx));
  S.add(busStop(-90, 19.0, MAIN_Y, ctx));

  // ======================================================================
  // A — the way in from Twoson
  // ======================================================================

  S.add(signPost(-78, 88, SOUTH_Y, '< TWOSON', ctx, { rotation: 0.2 }));
  zone.interactables.push({
    x: -79, z: 93, r: 4.4, name: 'road west',
    lines: ['The road west leaves town toward Twoson.',
      'Not today. There is still too much of Onett left to see.'],
  });

  S.add(building({
    name: 'house', x: -26, z: 56, y: SOUTH_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallSalmon, wallTex: 'siding', roof: P.roofGrey, roofType: 'gable', ridge: 'x',
    roofH: 1.9, chimney: true, cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: -0.018,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 0, y: 3.7, w: 1.3, h: 1.3 },
    ],
  }, ctx));
  S.add(tree(-38, 58, SOUTH_Y, { scale: 1.15 }, ctx));

  S.add(building({
    name: 'house', x: 12, z: 56, y: SOUTH_Y, w: 11, d: 9, h: HOUSE_H, storeys: 2,
    wall: P.wallMint, wallTex: 'siding', roof: P.roofRed, roofType: 'hip', roofH: 1.9,
    cornice: true, base: { tex: 'stone', h: 0.5 }, yaw: 0.02,
    doors: [{ side: 'south', offset: 0, target: null, label: 'HOUSE' }],
    windows: [
      { side: 'south', offset: -3.2, y: 1.0, w: 1.3, h: 1.4 },
      { side: 'south', offset: 3.2, y: 1.0, w: 1.3, h: 1.4 },
    ],
  }, ctx));
  S.add(tree(25, 58, SOUTH_Y, { scale: 1.2 }, ctx));
  S.add(bush(-6, 61, SOUTH_Y, ctx, { scale: 1.1 }));

  for (const x of [-62, -8, 34]) S.add(lamp(x, 63.6, SOUTH_Y, ctx));
  S.add(car(-79, 74, SOUTH_Y, 0, '#8a7ab8', ctx));

  // ======================================================================
  // The impact site
  // ======================================================================

  buildImpactSite(zone, S, ctx, country);

  // ======================================================================
  // Boundary planting, and the planting of the hills
  // ======================================================================

  const wob = rng(4242);
  const jog = (v, amt) => v + (wob() - 0.5) * 2 * amt;

  // A treeline planted on an exact grid reads as fence posts, so everything
  // below carries a deterministic wobble in place, size and species.
  for (let z = 50; z < 94; z += 7) {
    S.add(tree(jog(BOUNDS.x0 + 4, 2.4), jog(z, 2.6), SOUTH_Y,
      { scale: 1.0 + wob() * 0.3, kind: wob() > 0.55 ? 'pine' : 'round' }, ctx));
    S.add(tree(jog(BOUNDS.x1 - 4, 2.4), jog(z + 3, 2.6), SOUTH_Y,
      { scale: 1.0 + wob() * 0.35 }, ctx));
  }
  for (let x = -104; x < 106; x += 7) {
    if (x > -90 && x < -68) continue;                 // leave the Twoson road open
    S.add(tree(jog(x, 2.2), jog(BOUNDS.z1 - 1.4, 0.9), SOUTH_Y,
      { scale: 1.05 + wob() * 0.35, kind: wob() > 0.6 ? 'pine' : 'round' }, ctx));
  }
  for (let z = -12; z < 44; z += 6) {
    S.add(hedge(BOUNDS.x0 + 1.6, z, MAIN_Y, 2.4, 6, 1.3, ctx));
    S.add(hedge(BOUNDS.x1 - 1.6, z, MAIN_Y, 2.4, 6, 1.3, ctx));
  }
  for (let z = -72; z < -20; z += 6) {
    S.add(hedge(BOUNDS.x0 + 1.6, z, HOUSE_Y, 2.4, 6, 1.3, ctx));
    S.add(hedge(BOUNDS.x1 - 1.6, z, HOUSE_Y, 2.4, 6, 1.3, ctx));
  }
  for (const [x, z, y] of [
    [-92, 17.2, MAIN_Y], [-30, 17.2, MAIN_Y], [30, 31.6, MAIN_Y], [76, 17.2, MAIN_Y],
    [-20, -31.0, HOUSE_Y], [50, -31.0, HOUSE_Y], [-66, -31.0, HOUSE_Y],
  ]) {
    S.add(bush(x, z, y, ctx, { scale: 0.9 }));
  }

  // Terrace seams are dead-straight lines the full width of the map — the one
  // thing the eye reads instantly as "made of rectangles". Boulders and scrub
  // spilling over each lip break the line without touching the ground data.
  const seams = [
    { z: SEAM_AB, y: SOUTH_Y, top: MAIN_Y, skip: [[-90, -70]] },
    { z: SEAM_BC, y: MAIN_Y, top: HOUSE_Y, skip: [[82, 96]] },
  ];
  for (const seam of seams) {
    for (let x = BOUNDS.x0 + 5; x < BOUNDS.x1 - 5; x += 7) {
      const px = jog(x, 2.2);
      if (seam.skip.some(([a, b]) => px > a && px < b)) continue;
      const r = 0.7 + wob() * 0.8;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(r, 0),
        mat(repeated(T.stoneCourse(), 1, 1), 0xa8a49c),
      );
      const pz = seam.z - 0.9 - wob() * 0.9;
      rock.position.set(px, seam.top - r * 0.62, pz);
      rock.rotation.set(px, r, seam.z);
      rock.castShadow = true;
      S.add(rock);
      ctx.solids.circle(px, pz, r * 0.8, 'boulder');
      if (wob() > 0.45) {
        S.add(bush(jog(px + 3, 1.6), seam.z - 2.2 - wob() * 1.8, seam.top, ctx,
          { scale: 0.7 + wob() * 0.5 }));
      }
    }
  }

  plantCountry(zone, S, ctx, country);

  // ======================================================================
  // Tall grass — the lawns were a flat texture with nothing growing out of
  // them. Everything already paved is registered on zone.surfaces, so the
  // scatter can simply refuse to grow through it.
  // ======================================================================

  // Paving and building footprints share a shape, so one list covers both.
  const paved = [...zone.surfaces, ...zone.solids.rects];
  for (const [x0, z0, x1, z1, y, n, seed] of [
    [BOUNDS.x0, SEAM_AB, BOUNDS.x1, BOUNDS.z1, SOUTH_Y, 850, 21],
    [BOUNDS.x0, SEAM_BC, BOUNDS.x1, SEAM_AB, MAIN_Y, 900, 22],
    [BOUNDS.x0, SEAM_CW, BOUNDS.x1, SEAM_BC, HOUSE_Y, 950, 23],
  ]) {
    const tufts = grassTufts(x0, z0, x1, z1, y, { count: n, seed, avoid: paved, scale: 1.2 });
    if (tufts) S.add(tufts);
  }
  // …and out in the country, dropped onto the terrain, thickest on the floor.
  const wild = grassTufts(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, SEAM_CW, 0, {
    count: 900, seed: 31, scale: 1.35,
    heightAt: country.height,
    want: (x, z) => country.offSpine(x, z) < 0.78 && country.slope(x, z) < 0.7
      && Math.abs(x - country.spineX(z)) > 3.4
      && country.fromImpact(x, z) > 13,
  });
  if (wild) S.add(wild);

  // ======================================================================
  // Spawns and cast
  // ======================================================================

  zone.addSpawn('start', 39.0, -50.0, HOUSE_Y, 'down');
  zone.addSpawn('front', 39.0, -50.0, HOUSE_Y, 'down');
  zone.addSpawn('neighborHouse', 62.0, -50.0, HOUSE_Y, 'down');
  zone.addSpawn('drugstore', -66, 18.4, MAIN_Y, 'down');
  zone.addSpawn('arcade', 24, 18.6, MAIN_Y, 'down');
  zone.addSpawn('hotel', 52, 18.6, MAIN_Y, 'down');
  zone.addSpawn('hospital', -44, -47.8, HOUSE_Y, 'down');

  populateOnett(zone, country);
  return zone;
}

// --- the town green --------------------------------------------------------

/**
 * A small park on the strip between the shops and the shelf above them.
 *
 * The city needed somewhere that is not a shopfront or a road — a place to
 * stand still in, which is half of what makes a town feel inhabited.
 */
function townGreen(zone, S, ctx, cx, cz) {
  pave(zone, cx - 13, cz - 7, cx + 13, cz + 7, MAIN_Y, T.walk(), 5);
  // a ring of grass left unpaved in the middle
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(7.4, 20),
    new THREE.MeshLambertMaterial({ map: repeated(T.grass(), 2.4, 2.4) }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, MAIN_Y + 0.06, cz);
  lawn.receiveShadow = true;
  S.add(lawn);

  // A fountain: three stacked drums and a pale disc of water.
  const stone = mat(repeated(T.stoneCourse(), 2, 1), 0xcfc7b6);
  const f = new THREE.Group();
  f.position.set(cx, MAIN_Y, cz);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 1.1, 14), stone);
  basin.position.y = 0.55;
  basin.castShadow = true;
  basin.receiveShadow = true;
  f.add(basin);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 16),
    new THREE.MeshLambertMaterial({ color: 0x7fc4e0 }),
  );
  water.rotation.x = -Math.PI / 2;
  // Just proud of the rim. Sunk even a few centimetres inside a solid drum and
  // the water is invisible from a camera looking down at it.
  water.position.y = 1.14;
  f.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 2.1, 10), stone);
  column.position.y = 2.1;
  column.castShadow = true;
  f.add(column);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.5, 0.36, 12), stone);
  bowl.position.y = 3.2;
  bowl.castShadow = true;
  f.add(bowl);
  const spill = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ec }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.y = 3.4;
  f.add(spill);
  S.add(f);
  ctx.solids.circle(cx, cz, 2.9, 'fountain');

  for (const [dx, dz, ry] of [[-6.4, -3.4, 0.7], [6.4, -3.4, -0.7], [-6.4, 3.4, 2.4], [6.4, 3.4, -2.4]]) {
    S.add(bench(cx + dx, cz + dz, MAIN_Y, ry, ctx));
  }
  for (const [dx, dz] of [[-10, -5], [10, -5], [-10, 5], [10, 5]]) {
    S.add(tree(cx + dx, cz + dz, MAIN_Y, { scale: 1.15 }, ctx));
  }
  S.add(flowerPatch(cx - 4.5, cz + 5.5, MAIN_Y, 9));
  S.add(flowerPatch(cx + 4.5, cz - 5.5, MAIN_Y, 9));
  S.add(trashCan(cx + 11, cz + 2, MAIN_Y, ctx));

  zone.interactables.push({
    x: cx, z: cz + 3.6, r: 3.2, name: 'fountain',
    lines: ['Someone has thrown a coin in. Several someones, by the look of it.',
      'The water is very cold and smells faintly of pennies.'],
  });
}

// --- the impact site -------------------------------------------------------

function buildImpactSite(zone, S, ctx, country) {
  const MX = country.impact.x;
  const MZ = country.impact.z;
  const MY = country.height(MX, MZ);

  // The scorch is painted into the terrain's vertex colours over in
  // terrain.js, not laid on as a disc: a flat decal in a curved bowl is half
  // buried and half floating, and no amount of nudging fixes that.

  // The meteorite: a faceted lump, glowing where it split open.
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

  // Smoke curling off the impact site — visible from a long way down the valley,
  // which is what gives you something to walk toward.
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

  // Ejecta, thrown clear of the crater and sitting on whatever slope it landed on.
  for (const [dx, dz, r] of [
    [-7, 4, 0.9], [6, -6, 1.1], [-5, -7, 0.7], [10, 5, 0.8], [-11, -2, 0.6],
    [13, -3, 0.9], [-9, 9, 0.7], [3, 12, 1.0],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(MX + dx, country.height(MX + dx, MZ + dz) + r * 0.5, MZ + dz);
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

  // The police cordon, back at the mouth of the valley where the lane gives out.
  const bz = SEAM_CW - 5;
  const bx = country.spineX(bz);
  for (const off of [-7.5, 7.5]) {
    S.add(barricade(bx + off, bz, country.height(bx + off, bz), ctx));
  }
  S.add(signPost(bx - 12, bz + 1, country.height(bx - 12, bz + 1), 'KEEP OUT', ctx,
    { bg: '#f0e0a0', fg: '#c03828', rotation: -0.5 }));
}

/**
 * Plant the hills.
 *
 * Everything here asks the terrain where it should go rather than being placed
 * on a grid: trees take the flanks, boulders the steep ground, scrub the edges
 * of the valley floor. The planting follows the shape of the land, so the land
 * is what you end up reading.
 */
function plantCountry(zone, S, ctx, country) {
  const box2 = { x0: -150, x1: 150, z0: BOUNDS.z0 - 30, z1: SEAM_CW };
  // Nothing grows in the crater. Without this the scatter buries the one thing
  // the whole walk exists to arrive at under its own trees.
  const clearOfImpact = (x, z, r = 24) => country.fromImpact(x, z) > r;

  // Woodland climbing the flanks. No solids: they are already out of reach, and
  // a few hundred collision circles on unreachable ground is pure waste.
  scatterCountry(country, {
    ...box2, count: 260, seed: 12,
    want: (x, y, z, i) => i.off > 0.5 && i.slope < 1.6 && clearOfImpact(x, z, 30),
    place: (x, y, z, i) => {
      S.add(tree(x, z, y, {
        scale: 0.95 + i.rand() * 0.5,
        kind: i.rand() > 0.42 ? 'pine' : 'round',
      }));
    },
  });

  // A scattering of trees down in the valley too, so the floor is not bare.
  scatterCountry(country, {
    x0: -90, x1: 90, z0: BOUNDS.z0, z1: SEAM_CW, count: 42, seed: 13,
    want: (x, y, z, i) => i.off < 0.42 && i.slope < 0.5
      && Math.abs(x - country.spineX(z)) > 7 && clearOfImpact(x, z, 30),
    place: (x, y, z, i) => {
      S.add(tree(x, z, y, { scale: 1.0 + i.rand() * 0.45, kind: i.rand() > 0.6 ? 'pine' : 'round' }, ctx));
    },
  });

  // Boulders where the ground steepens, and scrub along the break of slope.
  const stone = mat(repeated(T.stoneCourse(), 1, 1), 0xa8a49c);
  scatterCountry(country, {
    x0: -120, x1: 120, z0: BOUNDS.z0, z1: SEAM_CW, count: 90, seed: 14,
    want: (x, y, z, i) => i.slope > 0.4 && i.slope < 1.8 && clearOfImpact(x, z, 26),
    place: (x, y, z, i) => {
      const r = 0.55 + i.rand() * 0.85;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
      m.position.set(x, y + r * 0.35, z);
      m.rotation.set(x, z, r);
      m.castShadow = true;
      S.add(m);
      if (i.off < 0.55) ctx.solids.circle(x, z, r * 0.75, 'boulder');
    },
  });
  scatterCountry(country, {
    x0: -110, x1: 110, z0: BOUNDS.z0, z1: SEAM_CW, count: 130, seed: 15,
    want: (x, y, z, i) => i.off > 0.2 && i.off < 0.75 && i.slope < 0.9 && clearOfImpact(x, z),
    place: (x, y, z, i) => S.add(bush(x, z, y, null, { scale: 0.7 + i.rand() * 0.7 })),
  });
  // Wildflowers on the floor, thickest in the clearings.
  scatterCountry(country, {
    x0: -80, x1: 80, z0: BOUNDS.z0, z1: SEAM_CW, count: 46, seed: 16,
    want: (x, y, z, i) => i.off < 0.3 && i.slope < 0.35 && clearOfImpact(x, z),
    place: (x, y, z) => S.add(flowerPatch(x, z, y, 6)),
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

function populateOnett(zone, country) {
  const mouthZ = SEAM_CW - 5;
  const mouthX = country.spineX(mouthZ);

  /** @type {Array<[string, number, number, number, string[], object]>} */
  const cast = [
    // C — home
    ['neighborKid', 51.5, -50.2, HOUSE_Y, [
      "Oh — it's you. Did the noise wake you up too?",
      'Something fell out of the sky and came down way out in the hills. The whole house shook!',
    ], { wander: 2.5 }],
    ['mom', 36.0, -50.4, HOUSE_Y, [
      "Don't wander too far, dear.",
      'And put on a jacket if it gets cold out on those hills.',
    ], { wander: 0 }],
    ['granny', -38, -47.6, HOUSE_Y, [
      'In sixty years I have never heard a bang like that.',
      'Not even when my husband tried to fix the boiler.',
    ], { wander: 0 }],
    ['townsman', 0, -47.8, HOUSE_Y, [
      'The police shut the lane north about an hour ago.',
      'Nobody in this town has slept since that thing came down.',
    ], { wander: 3 }],
    ['dog', 68, -47.5, HOUSE_Y, ['Woof!'], { wander: 4, speed: 3.4, scale: 0.9 }],

    // the mouth of the valley, and one who went further
    ['cop', mouthX - 2, mouthZ + 3.4, country.height(mouthX - 2, mouthZ + 3.4), [
      'Police business, kid. Nobody goes up the valley.',
      "...Between you and me? I have no idea what that thing is either.",
    ], { wander: 0 }],
    ['cop', mouthX + 12, mouthZ + 2, country.height(mouthX + 12, mouthZ + 2), [
      'Keep behind the barricade, please.',
    ], { wander: 1.5 }],
    ['photographer', country.spineX(-118) + 5, -118, country.height(country.spineX(-118) + 5, -118), [
      'I walked out here at first light and I still cannot see the end of it.',
      'Whatever came down, it is further up this valley. Keep going.',
    ], { wander: 3 }],

    // B — the city
    ['businessman', -14, 18.4, MAIN_Y, [
      'Meteorite or no meteorite, the shops open at nine.',
    ], { wander: 2 }],
    ['townswoman', -56, 18.4, MAIN_Y, [
      'The drug store has everything. Bandages, cola, umbrellas...',
    ], { wander: 2.5 }],
    ['punk', 12, 18.6, MAIN_Y, [
      'This is our street, got it?',
      'Ahh, forget it. My high score is unbeatable anyway.',
    ], { wander: 2 }],
    ['neighborKidSmall', 19.5, 18.6, MAIN_Y, [
      'I spent all my allowance in the arcade.',
      'Worth it!',
    ], { wander: 2 }],
    ['nurse', -74, 18.4, MAIN_Y, [
      'If you get hurt out there, come straight to the hospital.',
      "We're open through the night, and it has been a long one already.",
    ], { wander: 0 }],
    ['townsman', 54, 31.6, MAIN_Y, [
      'The hotel is nice, but the walls are thin.',
      'You can hear the guy in the next room dreaming.',
    ], { wander: 3 }],
    ['dog', -18, 31.8, MAIN_Y, ['Arf!'], { wander: 6, speed: 3.8, scale: 0.9 }],
    // on the green
    ['photographer', 8, -6.5, MAIN_Y, [
      'Say — you have a great face for a photograph!',
      'I take pictures all over the world. One day I will get one of you.',
    ], { wander: 0 }],
    ['granny', -2, 1.0, MAIN_Y, [
      'I sit here most mornings. It is the only quiet corner left.',
      'Well. It was, until last night.',
    ], { wander: 0 }],

    // A — the way in from Twoson
    ['townswoman', -44, 66.4, SOUTH_Y, [
      'That road west goes to Twoson.',
      'It is a long walk. Longer than you think.',
    ], { wander: 2.5 }],
    ['townsman', 20, 79.8, SOUTH_Y, [
      'Two buses came through this morning and neither of them stopped.',
    ], { wander: 3 }],
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
