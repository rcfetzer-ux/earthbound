/**
 * Time of day.
 *
 * The single biggest thing separating the reference art from a generic 3D scene
 * is that it is never lit neutrally: there is a warm key from a low sun and the
 * shadows fall *cool*, not merely dark. Everything here exists to make that one
 * relationship adjustable — sun, sky fill, ambient, sky gradient, fog, the post
 * grade, and whether the street lamps are burning.
 *
 * Afternoon is the default: a low warm key with the palette still fully open,
 * which is where the bright chalky colours the art leans on read best. Dusk and
 * night are a keypress away and are where the meteorite is at its best.
 */
import * as THREE from 'three';

/**
 * @typedef {Object} TimePreset
 * @property {string} label            shown in the HUD when switching
 * @property {Object} sun              warm key light
 * @property {Object} hemi             sky/ground fill — the cool half of the contrast
 * @property {Object} ambient
 * @property {Object} sky              gradient stops for the dome
 * @property {Object} fog
 * @property {Object} grade            post-process shadow/highlight tinting
 * @property {boolean} lamps           street lamps and lit windows
 * @property {number} spriteTint       characters are unlit, so they get tinted by hand
 * @property {number} cloudTint
 */

/**
 * Sun placement is spherical: elevation above the horizon, azimuth around it.
 *
 * Note the low-sun presets carry much higher intensities than a physical model
 * would. From a near-top-down camera, most of what you see is ground and roofs —
 * exactly the surfaces a low sun starves — so the key has to be pushed hard and
 * the hemisphere fill raised to keep the scene readable.
 */
function sunOffset(elevationDeg, azimuthDeg, distance = 60) {
  const e = THREE.MathUtils.degToRad(elevationDeg);
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3(
    Math.cos(e) * Math.sin(a) * distance,
    Math.sin(e) * distance,
    Math.cos(e) * Math.cos(a) * distance,
  );
}

export const TIMES = {
  day: {
    label: 'MIDDAY',
    sun: { color: 0xfff4d8, intensity: 1.3, elevation: 54, azimuth: 34 },
    hemi: { sky: 0xd4ecff, ground: 0x86b45c, intensity: 1.1 },
    ambient: { color: 0xe8f2ff, intensity: 0.3 },
    sky: { top: '#3f9fdc', mid: '#79c8ee', horizon: '#c8ecf8' },
    fog: { color: '#bfe4f2', near: 90, far: 260 },
    grade: { shadow: [0.94, 0.98, 1.12], highlight: [1.05, 1.01, 0.94], amount: 0.35 },
    lamps: false,
    spriteTint: 0xffffff,
    cloudTint: 0xffffff,
    smokeTint: 0xb8aab0,
  },

  golden: {
    label: 'AFTERNOON',
    sun: { color: 0xffd49a, intensity: 1.85, elevation: 30, azimuth: 46 },
    hemi: { sky: 0xc8ddf8, ground: 0xb8945e, intensity: 1.05 },
    ambient: { color: 0xd0dcff, intensity: 0.28 },
    sky: { top: '#4a90cc', mid: '#9cc6e4', horizon: '#ffd7a6' },
    fog: { color: '#e8c9a2', near: 92, far: 250 },
    // Cool shadows, but not so cool that grey tarmac in shade reads violet.
    grade: { shadow: [0.90, 0.95, 1.11], highlight: [1.12, 1.03, 0.88], amount: 0.46 },
    lamps: false,
    spriteTint: 0xffeedd,
    cloudTint: 0xffe6c8,
    smokeTint: 0xc0a898,
  },

  /** The evening after the meteorite fell — lamps on, palette going blue. */
  dusk: {
    label: 'EVENING',
    sun: { color: 0xffa868, intensity: 1.8, elevation: 17, azimuth: 52 },
    hemi: { sky: 0x92a8e0, ground: 0x5c6478, intensity: 1.02 },
    ambient: { color: 0x92a4dc, intensity: 0.36 },
    sky: { top: '#243a76', mid: '#7466a4', horizon: '#f2a066' },
    fog: { color: '#8d7ba6', near: 84, far: 235 },
    grade: { shadow: [0.80, 0.88, 1.24], highlight: [1.16, 1.02, 0.84], amount: 0.6 },
    lamps: true,
    spriteTint: 0xf4e2e0,
    cloudTint: 0xe8b898,
    smokeTint: 0x8a7a86,
  },

  night: {
    label: 'NIGHT',
    // The "sun" is the moon: cool, dim, and from the other side of the sky.
    sun: { color: 0xa8c0f8, intensity: 0.72, elevation: 46, azimuth: 212 },
    hemi: { sky: 0x3d4f88, ground: 0x26303f, intensity: 0.62 },
    ambient: { color: 0x6478b8, intensity: 0.26 },
    sky: { top: '#0b1030', mid: '#182552', horizon: '#3d4c7c' },
    fog: { color: '#28315a', near: 62, far: 205 },
    grade: { shadow: [0.78, 0.86, 1.26], highlight: [1.06, 1.0, 0.92], amount: 0.55 },
    lamps: true,
    spriteTint: 0xc8cfe8,
    cloudTint: 0x8896c0,
    smokeTint: 0x53566e,
  },
};

export const TIME_ORDER = ['day', 'golden', 'dusk', 'night'];
export const DEFAULT_TIME = 'golden';

export function timePreset(name) {
  return TIMES[name] ?? TIMES[DEFAULT_TIME];
}

/** Where the key light sits relative to whatever it is following. */
export function sunVector(preset) {
  return sunOffset(preset.sun.elevation, preset.sun.azimuth);
}
