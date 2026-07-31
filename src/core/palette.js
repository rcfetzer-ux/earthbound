/**
 * Palette for the Onett homage.
 *
 * The original game leans on bright, slightly chalky pastels with a few
 * saturated accents, all sitting on warm greens and lavender-grey asphalt.
 * Everything here is authored as hex so it can be dropped straight into
 * canvas fills and three.js colors alike.
 */

export const P = {
  // --- ground -------------------------------------------------------------
  grassLight: '#8ed24a',
  grass: '#6fbe32',
  grassDark: '#4f9f27',
  grassShadow: '#3d8420',

  dirt: '#c39a5e',
  dirtDark: '#a67c45',

  // Tarmac reads warm-grey, not lilac. The afternoon grade tints shadows blue,
  // so anything that starts violet finishes properly purple on screen.
  road: '#8d8b92',
  roadDark: '#74727c',
  roadLine: '#f2e9a8',
  walk: '#d8d2c4',
  walkDark: '#bdb6a6',

  // --- architecture -------------------------------------------------------
  wallCream: '#f4e3bd',
  wallMint: '#b9e6cf',
  wallSalmon: '#f0b1a1',
  wallSky: '#b6d8f2',
  wallLilac: '#d2c0e8',
  wallWhite: '#f6f2e8',
  wallTan: '#e0bf8f',

  roofRed: '#d8563c',
  roofRedDark: '#a83c2a',
  roofBlue: '#4f7fc4',
  roofBlueDark: '#37609e',
  roofGreen: '#4aa06a',
  roofGrey: '#8f8fa3',
  roofOrange: '#e8934a',
  roofPurple: '#8a6ec0',

  brick: '#c4705a',
  brickDark: '#9c5342',
  brickMortar: '#e6d8c4',

  wood: '#b07f4c',
  woodDark: '#8a5f36',
  woodLight: '#d0a173',

  glass: '#7ec4e0',
  glassDark: '#4f9ec2',
  glassLit: '#ffe9a8',

  // --- interiors ----------------------------------------------------------
  floorWood: '#c2905c',
  floorWoodDark: '#a2724a',
  carpetRed: '#c85c5c',
  carpetBlue: '#5c7cc8',
  carpetGreen: '#5ca86c',
  wallpaperA: '#f2dcc0',
  wallpaperB: '#e4c6a0',
  wallpaperMint: '#cde8d8',
  tile: '#e8e4d8',
  tileDark: '#c8c4b8',

  // --- sky / atmosphere ---------------------------------------------------
  sky: '#79c8ee',
  skyHigh: '#4aa8e0',
  skyLow: '#c8ecf8',
  cloud: '#ffffff',
  cloudShade: '#d9ecf8',
  fog: '#bfe4f2',

  // --- characters ---------------------------------------------------------
  skin: '#f8c8a0',
  skinShade: '#d89c74',
  capRed: '#e2413a',
  capRedDark: '#b02c28',
  shirtStripeA: '#f2e8d8',
  shirtStripeB: '#e2413a',
  shortsBlue: '#3c5aa6',
  shortsBlueDark: '#2c4380',
  shoeYellow: '#f0c440',
  hairBrown: '#7a4a28',
  hairBlack: '#3a2a28',
  hairBlonde: '#e8c464',
  outline: '#2a2030',

  // --- ui -----------------------------------------------------------------
  uiFrame: '#f8f4e8',
  uiBack: '#181028',
  uiText: '#ffffff',
  uiShadow: '#3a2a48',
};

/** Small helper: darken/lighten a hex color by a factor. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0')}`;
}

/** Mix two hex colors, t in [0,1]. */
export function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
