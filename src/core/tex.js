/**
 * Procedural pixel-art texture library.
 *
 * Everything is painted into small canvases (16–96px) with a seeded RNG so the
 * town looks identical on every load, then handed to three.js with NEAREST
 * magnification (crunchy texels up close) and mipmapped minification (stable
 * in the distance — the N64 half of the "SNES→N64" brief).
 */
import * as THREE from 'three';
import { P, shade, mix } from './palette.js';
import { drawText, measureText, GLYPH_HEIGHT } from '../ui/font.js';

// --- deterministic noise ---------------------------------------------------

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered-dither a rectangle between two colors. `t` = amount of colour `b`. */
export function dither(ctx, x, y, w, h, a, b, t) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const threshold = (BAYER4[j & 3][i & 3] + 0.5) / 16;
      ctx.fillStyle = t > threshold ? b : a;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Sprinkle single-pixel speckles. */
function speckle(ctx, w, h, color, count, rand) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 1, 1);
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

const cache = new Map();

/**
 * Build (or fetch) a texture.
 * @param {string} key cache key
 * @param {number} w
 * @param {number} h
 * @param {(ctx:CanvasRenderingContext2D, w:number, h:number, rand:()=>number)=>void} paint
 * @param {{repeat?:[number,number], mag?:any, transparent?:boolean, aniso?:number}} opts
 */
export function make(key, w, h, paint, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const { c, ctx } = canvas(w, h);
  paint(ctx, w, h, rng(hash(key)));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = opts.mag ?? THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 4;
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  cache.set(key, t);
  return t;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const repeatCache = new Map();

/**
 * A view of a texture with its own repeat. Memoized: identical requests share
 * one texture object, which lets materials be shared, which in turn lets the
 * static-geometry baker merge meshes together.
 */
export function repeated(tex, rx, ry) {
  const key = `${tex.uuid}|${rx.toFixed(3)}|${ry.toFixed(3)}`;
  const hit = repeatCache.get(key);
  if (hit) return hit;
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  repeatCache.set(key, t);
  return t;
}

// --- ground ---------------------------------------------------------------

export const T = {
  grass: () =>
    make('grass', 64, 64, (ctx, w, h, rand) => {
      ctx.fillStyle = P.grass;
      ctx.fillRect(0, 0, w, h);
      // broad dithered patches of lighter/darker green
      for (let i = 0; i < 14; i++) {
        const px = Math.floor(rand() * w);
        const py = Math.floor(rand() * h);
        const pw = 8 + Math.floor(rand() * 18);
        const ph = 6 + Math.floor(rand() * 14);
        const lighter = rand() > 0.35;
        dither(ctx, px, py, Math.min(pw, w - px), Math.min(ph, h - py),
          P.grass, lighter ? P.grassLight : P.grassDark, 0.3 + rand() * 0.22);
      }
      // grass blades: little 2px vertical ticks
      for (let i = 0; i < 130; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.5 ? P.grassDark : P.grassLight;
        ctx.fillRect(x, y, 1, 2);
      }
      speckle(ctx, w, h, P.grassShadow, 60, rand);
      // occasional tiny flowers, very EarthBound
      for (let i = 0; i < 5; i++) {
        const x = 2 + Math.floor(rand() * (w - 4));
        const y = 2 + Math.floor(rand() * (h - 4));
        ctx.fillStyle = ['#f8f0a0', '#f8a8c8', '#ffffff'][Math.floor(rand() * 3)];
        ctx.fillRect(x, y, 2, 2);
      }
    }),

  grassTall: () =>
    make('grassTall', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = P.grassDark;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 80; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.4 ? P.grass : P.grassShadow;
        ctx.fillRect(x, y, 1, 3);
      }
    }),

  road: () =>
    make('road', 64, 64, (ctx, w, h, rand) => {
      ctx.fillStyle = P.road;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 10; i++) {
        const px = Math.floor(rand() * w);
        const py = Math.floor(rand() * h);
        dither(ctx, px, py, Math.min(20, w - px), Math.min(16, h - py),
          P.road, P.roadDark, 0.3 + rand() * 0.25);
      }
      speckle(ctx, w, h, P.roadDark, 220, rand);
      speckle(ctx, w, h, shade(P.road, 0.18), 140, rand);
      // hairline cracks — kept faint so they don't read as a repeating pattern
      ctx.fillStyle = shade(P.roadDark, -0.08);
      for (let i = 0; i < 2; i++) {
        let x = Math.floor(rand() * w);
        let y = Math.floor(rand() * h);
        for (let s = 0; s < 18; s++) {
          ctx.fillRect(x, y, 1, 1);
          x = (x + (rand() > 0.5 ? 1 : 0) + w) % w;
          y = (y + 1) % h;
        }
      }
    }),

  roadLine: () =>
    make('roadLine', 8, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = P.roadLine;
      ctx.fillRect(2, 0, 4, 18);
      ctx.fillStyle = shade(P.roadLine, -0.18);
      ctx.fillRect(2, 15, 4, 3);
    }, { transparent: true }),

  walk: () =>
    make('walk', 64, 64, (ctx, w, h, rand) => {
      ctx.fillStyle = P.walk;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, P.walkDark, 180, rand);
      speckle(ctx, w, h, shade(P.walk, 0.2), 120, rand);
      // slab seams every 32px
      ctx.fillStyle = P.walkDark;
      ctx.fillRect(0, 0, w, 1);
      ctx.fillRect(0, 32, w, 1);
      ctx.fillRect(0, 0, 1, h);
      ctx.fillRect(32, 0, 1, h);
      ctx.fillStyle = shade(P.walk, 0.25);
      ctx.fillRect(0, 1, w, 1);
      ctx.fillRect(0, 33, w, 1);
    }),

  dirtPath: () =>
    make('dirtPath', 64, 64, (ctx, w, h, rand) => {
      ctx.fillStyle = P.dirt;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) {
        const px = Math.floor(rand() * w);
        const py = Math.floor(rand() * h);
        dither(ctx, px, py, Math.min(18, w - px), Math.min(14, h - py),
          P.dirt, P.dirtDark, 0.4);
      }
      speckle(ctx, w, h, P.dirtDark, 200, rand);
      speckle(ctx, w, h, '#8a6436', 40, rand);
    }),

  cliff: () =>
    make('cliff', 48, 48, (ctx, w, h, rand) => {
      ctx.fillStyle = P.dirtDark;
      ctx.fillRect(0, 0, w, h);
      // horizontal strata
      for (let y = 0; y < h; y += 6) {
        dither(ctx, 0, y, w, 6, P.dirtDark, y % 12 === 0 ? P.dirt : '#8a6436', 0.45);
      }
      // rock chips
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.5 ? '#9c7a52' : '#6e4e2e';
        ctx.fillRect(x, y, 2 + Math.floor(rand() * 3), 2);
      }
      // No grass fringe here: the texture tiles vertically on tall cliff faces,
      // so the grass lip is a separate cap mesh in terrace().
    }),

  /** Scorched earth around the impact site. */
  scorch: () =>
    make('scorch', 64, 64, (ctx, w, h, rand) => {
      ctx.fillStyle = '#4a3a30';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const px = Math.floor(rand() * w);
        const py = Math.floor(rand() * h);
        dither(ctx, px, py, Math.min(20, w - px), Math.min(16, h - py),
          '#4a3a30', rand() > 0.5 ? '#2e2422' : '#6a5240', 0.45);
      }
      speckle(ctx, w, h, '#1e1a1c', 260, rand);
      speckle(ctx, w, h, '#7a6250', 120, rand);
      // glassy flecks where the heat fused the dirt
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = '#8a7060';
        ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 2, 1);
      }
    }),

  // --- walls --------------------------------------------------------------

  siding: (color, key) =>
    make(`siding-${key}`, 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = shade(color, -0.16);
        ctx.fillRect(0, y + 3, w, 1);
        ctx.fillStyle = shade(color, 0.13);
        ctx.fillRect(0, y, w, 1);
      }
      speckle(ctx, w, h, shade(color, -0.07), 30, rand);
    }),

  stucco: (color, key) =>
    make(`stucco-${key}`, 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, shade(color, -0.11), 150, rand);
      speckle(ctx, w, h, shade(color, 0.12), 110, rand);
    }),

  /** Rough cobble, for the base course of a shopfront. */
  cobble: () =>
    make('cobble', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = '#6f6a63';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 5) {
        for (let x = (y % 10 ? -3 : 0); x < w; x += 7) {
          const c = ['#8e8880', '#7b756d', '#9c958a', '#6a655e'][Math.floor(rand() * 4)];
          ctx.fillStyle = c;
          ctx.fillRect(x + 1, y + 1, 5, 3);
          ctx.fillStyle = shade(c, 0.2);
          ctx.fillRect(x + 1, y + 1, 5, 1);
        }
      }
      speckle(ctx, w, h, '#57534d', 90, rand);
    }),

  /** Dressed stone blocks — the base course under a painted wall. */
  stoneCourse: () =>
    make('stoneCourse', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = '#c9c0ae';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0, y = 0; y < h; y += 8, row++) {
        for (let x = row % 2 ? -6 : 0; x < w; x += 12) {
          const c = ['#d6cdba', '#c2b9a6', '#cdc4b1'][Math.floor(rand() * 3)];
          ctx.fillStyle = c;
          ctx.fillRect(x + 1, y + 1, 10, 6);
          ctx.fillStyle = shade(c, -0.18);
          ctx.fillRect(x + 1, y + 6, 10, 1);
        }
      }
      speckle(ctx, w, h, '#a89f8e', 70, rand);
    }),

  /** Awning stripes, for shopfronts. */
  awningStripe: (a, b, key) =>
    make(`awning-${key}`, 32, 32, (ctx, w, h) => {
      for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = a;
        ctx.fillRect(x, 0, 4, h);
        ctx.fillStyle = b;
        ctx.fillRect(x + 4, 0, 4, h);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, h - 3, w, 3);
    }),

  /** Checked awning, as on the drug store. */
  awningCheck: (a, b, key) =>
    make(`awningcheck-${key}`, 32, 32, (ctx, w, h) => {
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          ctx.fillStyle = ((x / 8) + (y / 8)) % 2 === 0 ? a : b;
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }),

  brick: () =>
    make('brick', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = P.brickMortar;
      ctx.fillRect(0, 0, w, h);
      const bh = 4;
      for (let row = 0, y = 0; y < h; y += bh, row++) {
        const off = row % 2 ? -4 : 0;
        for (let x = off; x < w; x += 8) {
          ctx.fillStyle = rand() > 0.25 ? P.brick : P.brickDark;
          ctx.fillRect(x, y, 7, bh - 1);
          ctx.fillStyle = shade(P.brick, -0.12);
          ctx.fillRect(x, y + bh - 2, 7, 1);
        }
      }
    }),

  // --- roofs --------------------------------------------------------------

  /**
   * Scalloped shingles.
   *
   * The old version varied by ±0.1, which the 30-level quantizer flattened
   * back into one colour: every roof in town read as a painted slab. These
   * courses are bigger, rounder and much higher contrast, so the pattern
   * survives both the low-resolution buffer and the mipmap chain.
   */
  shingle: (color, key) =>
    make(`shingle-${key}`, 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = shade(color, -0.3);
      ctx.fillRect(0, 0, w, h);
      const rh = 8;
      const tw = 8;
      for (let row = 0, y = 0; y < h; y += rh, row++) {
        const off = row % 2 ? -tw / 2 : 0;
        for (let x = off; x < w; x += tw) {
          // a fan of three widths makes the bottom edge scalloped, not straight
          const tone = rand() > 0.32 ? color : shade(color, -0.12);
          ctx.fillStyle = tone;
          ctx.fillRect(x + 1, y, tw - 2, rh - 1);
          ctx.fillRect(x + 2, y + rh - 1, tw - 4, 1);
          // lit top lip and shaded underside: the two lines that read as depth
          ctx.fillStyle = shade(tone, 0.26);
          ctx.fillRect(x + 1, y, tw - 2, 1);
          ctx.fillStyle = shade(tone, -0.34);
          ctx.fillRect(x + 1, y + rh - 2, tw - 2, 1);
        }
      }
    }),

  tileRoof: (color, key) =>
    make(`tileroof-${key}`, 32, 32, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 6) {
        ctx.fillStyle = shade(color, -0.3);
        ctx.fillRect(x, 0, 1, h);
        ctx.fillStyle = shade(color, 0.2);
        ctx.fillRect(x + 1, 0, 1, h);
      }
      for (let y = 0; y < h; y += 8) {
        ctx.fillStyle = shade(color, -0.18);
        ctx.fillRect(0, y, w, 1);
      }
    }),

  // --- openings -----------------------------------------------------------

  /** Window pane with frame, curtains and a specular glint. */
  window: (lit = false) =>
    make(`window-${lit}`, 24, 24, (ctx, w, h) => {
      ctx.fillStyle = P.wallWhite;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = shade(P.wallWhite, -0.25);
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(w - 2, 0, 2, h);
      const g0 = lit ? P.glassLit : P.glass;
      const g1 = lit ? shade(P.glassLit, -0.18) : P.glassDark;
      for (let y = 2; y < h - 2; y++) {
        const t = (y - 2) / (h - 4);
        ctx.fillStyle = mix(g0, g1, t * 0.85);
        ctx.fillRect(2, y, w - 4, 1);
      }
      // diagonal glint
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 16 - i, 2, 1);
      // mullions
      ctx.fillStyle = P.wallWhite;
      ctx.fillRect(w / 2 - 1, 2, 2, h - 4);
      ctx.fillRect(2, h / 2 - 1, w - 4, 2);
    }),

  door: (color = P.wood) =>
    make(`door-${color}`, 24, 32, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = shade(color, -0.3);
      ctx.fillRect(0, 0, w, 1);
      ctx.fillRect(0, 0, 1, h);
      ctx.fillStyle = shade(color, 0.2);
      ctx.fillRect(w - 1, 0, 1, h);
      // recessed panels
      const panel = (x, y, pw, ph) => {
        ctx.fillStyle = shade(color, -0.22);
        ctx.fillRect(x, y, pw, ph);
        ctx.fillStyle = shade(color, 0.1);
        ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
      };
      panel(4, 4, w - 8, 11);
      panel(4, 18, w - 8, 10);
      // knob
      ctx.fillStyle = P.shoeYellow;
      ctx.fillRect(w - 6, 17, 2, 2);
    }),

  glassDoor: () =>
    make('glassDoor', 24, 32, (ctx, w, h) => {
      ctx.fillStyle = P.wallWhite;
      ctx.fillRect(0, 0, w, h);
      for (let y = 2; y < h - 2; y++) {
        ctx.fillStyle = mix(P.glass, P.glassDark, (y - 2) / h);
        ctx.fillRect(2, y, w - 4, 1);
      }
      ctx.fillStyle = P.wallWhite;
      ctx.fillRect(w / 2 - 1, 0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 10; i++) ctx.fillRect(3 + i, 22 - i, 2, 1);
    }),

  // --- interiors ----------------------------------------------------------

  floorWood: () =>
    make('floorWood', 48, 48, (ctx, w, h, rand) => {
      ctx.fillStyle = P.floorWood;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 16) {
          const c = rand() > 0.5 ? P.floorWood : shade(P.floorWood, -0.07);
          ctx.fillStyle = c;
          ctx.fillRect(x + (y % 16 ? 8 : 0), y, 16, 7);
          // grain
          ctx.fillStyle = shade(c, -0.12);
          for (let g = 0; g < 3; g++) {
            ctx.fillRect(x + (y % 16 ? 8 : 0) + Math.floor(rand() * 14), y + 1 + g * 2, 3, 1);
          }
        }
        ctx.fillStyle = P.floorWoodDark;
        ctx.fillRect(0, y + 7, w, 1);
      }
    }),

  carpet: (color, key) =>
    make(`carpet-${key}`, 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, shade(color, -0.13), 200, rand);
      speckle(ctx, w, h, shade(color, 0.13), 160, rand);
      // Weave: short strokes in both directions, no border lines (those tiled
      // into a visible grid across big floors).
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.5 ? shade(color, 0.09) : shade(color, -0.09);
        if (rand() > 0.5) ctx.fillRect(x, y, 3, 1);
        else ctx.fillRect(x, y, 1, 3);
      }
    }),

  wallpaper: (base, accent, key) =>
    make(`wallpaper-${key}`, 32, 32, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = accent;
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const ox = (y / 8) % 2 ? 4 : 0;
          // tiny 4-petal motif
          ctx.fillRect(x + ox + 2, y + 1, 2, 1);
          ctx.fillRect(x + ox + 1, y + 2, 4, 2);
          ctx.fillRect(x + ox + 2, y + 4, 2, 1);
        }
      }
      ctx.fillStyle = shade(base, -0.1);
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
    }),

  tileFloor: () =>
    make('tileFloor', 32, 32, (ctx, w, h, rand) => {
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const light = ((x / 8) + (y / 8)) % 2 === 0;
          ctx.fillStyle = light ? P.tile : P.tileDark;
          ctx.fillRect(x, y, 8, 8);
          ctx.fillStyle = light ? shade(P.tile, -0.08) : shade(P.tileDark, -0.08);
          ctx.fillRect(x, y + 7, 8, 1);
          ctx.fillRect(x + 7, y, 1, 8);
        }
      }
      speckle(ctx, w, h, shade(P.tile, -0.14), 40, rand);
    }),

  ceiling: () =>
    make('ceiling', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = '#efe6d6';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, '#ddd2be', 90, rand);
    }),

  // --- props --------------------------------------------------------------

  bark: () =>
    make('bark', 16, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.5 ? P.wood : '#6a4526';
        ctx.fillRect(x, y, 1, 3 + Math.floor(rand() * 5));
      }
      ctx.fillStyle = shade(P.wood, 0.2);
      ctx.fillRect(w - 4, 0, 2, h);
    }),

  leaves: (color = '#3f8f2f') =>
    make(`leaves-${color}`, 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        const r = 2 + Math.floor(rand() * 4);
        ctx.fillStyle = rand() > 0.45 ? shade(color, 0.22) : shade(color, -0.2);
        ctx.fillRect(x, y, r, r);
      }
      speckle(ctx, w, h, shade(color, 0.4), 30, rand);
    }),

  hedge: () =>
    make('hedge', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = '#357a2a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        ctx.fillStyle = rand() > 0.4 ? '#4a9c36' : '#26601e';
        ctx.fillRect(x, y, 2, 2);
      }
      speckle(ctx, w, h, '#67b84a', 40, rand);
    }),

  planks: () =>
    make('planks', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = P.wood;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = rand() > 0.5 ? P.wood : shade(P.wood, -0.09);
        ctx.fillRect(x, 0, 7, h);
        ctx.fillStyle = P.woodDark;
        ctx.fillRect(x + 7, 0, 1, h);
      }
      speckle(ctx, w, h, P.woodDark, 40, rand);
    }),

  metal: (color = '#9aa0b0') =>
    make(`metal-${color}`, 16, 16, (ctx, w, h, rand) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, shade(color, -0.18), 30, rand);
      ctx.fillStyle = shade(color, 0.25);
      ctx.fillRect(0, 0, w, 1);
    }),

  concrete: () =>
    make('concrete', 32, 32, (ctx, w, h, rand) => {
      ctx.fillStyle = '#cfc9bb';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, '#b5afa0', 120, rand);
      speckle(ctx, w, h, '#e2ddd0', 90, rand);
    }),

  /** Fluffy pixel cloud with a hard-edged, dithered underside. */
  cloud: () =>
    make('cloud', 64, 32, (ctx, w, h, rand) => {
      ctx.clearRect(0, 0, w, h);
      // Build the silhouette from overlapping discs sitting on a flat base.
      const lumps = [];
      for (let i = 0; i < 7; i++) {
        lumps.push({
          x: 6 + (i / 6) * (w - 12) + (rand() - 0.5) * 4,
          y: 20 - Math.sin((i / 6) * Math.PI) * 8 - rand() * 3,
          r: 5 + rand() * 5,
        });
      }
      const inside = (x, y) => lumps.some((l) => ((x - l.x) ** 2 + (y - l.y) ** 2) < l.r * l.r) && y < 23;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!inside(x, y)) continue;
          // three flat bands: lit top, body, shaded belly — no gradients
          const top = lumps.some((l) => ((x - l.x) ** 2 + (y - (l.y - 1.5)) ** 2) < (l.r * 0.62) ** 2);
          ctx.fillStyle = y > 19 ? P.cloudShade : (top ? '#ffffff' : '#f2f8fd');
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // dithered edge along the underside
      for (let x = 0; x < w; x++) {
        for (let y = 18; y < 24; y++) {
          if (!inside(x, y)) continue;
          if (((x + y) & 3) === 0) { ctx.fillStyle = '#c6dfef'; ctx.fillRect(x, y, 1, 1); }
        }
      }
    }, { transparent: true }),

  /**
   * Warm pool cast by a street lamp. Additively blended onto the ground, which
   * is far cheaper than a real light and reads exactly like the reference: a
   * soft circle of warmth on unmown grass.
   */
  lightPool: () =>
    make('lightPool', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255, 226, 150, 0.95)');
      g.addColorStop(0.35, 'rgba(255, 200, 120, 0.5)');
      g.addColorStop(0.72, 'rgba(220, 150, 90, 0.16)');
      g.addColorStop(1, 'rgba(180, 120, 70, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { mag: THREE.LinearFilter }),

  /** Soft halo around a lit lamp head or a bright window. */
  glow: () =>
    make('glow', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255, 240, 190, 0.85)');
      g.addColorStop(0.4, 'rgba(255, 214, 130, 0.28)');
      g.addColorStop(1, 'rgba(255, 200, 110, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { mag: THREE.LinearFilter }),

  /** Soft radial blob used as a fake character shadow. */
  /**
   * A clump of grass blades on transparent ground, for the tufts scattered
   * across the lawns. Drawn as tapering columns rather than as noise: at this
   * resolution a blade has to be a deliberate shape or it dissolves.
   */
  tuft: (color = '#4fae3a') =>
    make(`tuft-${color}`, 32, 32, (ctx, w, h, rand) => {
      ctx.clearRect(0, 0, w, h);
      const blades = 7;
      for (let i = 0; i < blades; i++) {
        const bx = 3 + Math.floor((i / blades) * (w - 8)) + Math.floor(rand() * 3);
        const bh = 16 + Math.floor(rand() * 15);
        const lean = rand() < 0.5 ? -1 : 1;
        const tone = rand() > 0.55 ? shade(color, 0.18) : shade(color, -0.16);
        for (let s = 0; s < bh; s++) {
          const y = h - 1 - s;
          const x = bx + Math.round((s / bh) * (s / bh) * 4) * lean;
          const tw = s < bh * 0.55 ? 3 : (s < bh * 0.85 ? 2 : 1);
          ctx.fillStyle = s > bh * 0.72 ? shade(tone, 0.22) : tone;
          ctx.fillRect(x, y, tw, 1);
        }
      }
    }, { transparent: true }),

  blob: () =>
    make('blob', 32, 32, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(20,16,40,0.55)');
      g.addColorStop(0.6, 'rgba(20,16,40,0.28)');
      g.addColorStop(1, 'rgba(20,16,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { mag: THREE.LinearFilter }),
};

/**
 * Sign / storefront lettering rendered as a texture so shops read at a glance.
 */
export function signTexture(text, bg, fg, w = 96, h = 24, icon = null) {
  return make(`sign-${text}-${bg}-${fg}-${w}x${h}-${icon ?? ''}`, w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // frame: a bright inner rule and a dark drop edge read at low resolution
    ctx.fillStyle = shade(bg, -0.34);
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillRect(w - 2, 0, 2, h);
    ctx.fillStyle = shade(bg, 0.28);
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, 0, 1, h);
    ctx.strokeStyle = shade(bg, -0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 2.5, w - 5, h - 5);

    // A pictogram on the left, the way half the shopfronts in the reference
    // art work: you know what the shop sells before you can read the board.
    let left = 5;
    const art = icon && ICONS[icon];
    if (art) {
      const box = h - 9;
      const s = Math.max(1, Math.floor(box / art.length));
      const ix = left;
      const iy = Math.floor((h - art.length * s) / 2);
      for (let ry = 0; ry < art.length; ry++) {
        for (let rx = 0; rx < art[ry].length; rx++) {
          const c = art[ry][rx];
          if (c === '.') continue;
          ctx.fillStyle = ICON_INK[c] ?? fg;
          ctx.fillRect(ix + rx * s, iy + ry * s, s, s);
        }
      }
      left = ix + art[0].length * s + s * 2;
    }

    // The lettering is the same hand-drawn face the dialogue uses — the town's
    // signwriter and its storyteller should not be two different people.
    const avail = w - left - 5;
    let scale = Math.max(1, Math.floor((h - 8) / GLYPH_HEIGHT));
    while (scale > 1 && measureText(text, scale) > avail) scale--;
    const tw = measureText(text, scale);
    const tx = art ? left : Math.floor((w - tw) / 2);
    const ty = Math.floor((h - GLYPH_HEIGHT * scale) / 2);
    drawText(ctx, [text], {
      x: tx, y: ty, scale, color: fg, shadow: shade(bg, -0.5),
    });
  });
}

/** Pixel pictograms for shop boards. `#` takes the sign's ink; letters are keyed. */
const ICON_INK = {
  r: '#e04a3c', y: '#f5c53a', g: '#54b04a', w: '#fdf6e4', b: '#5aa8e0',
  o: '#e8873a', k: '#3a3040', p: '#f0a8c0', n: '#a8703a',
};
const ICONS = {
  // a capsule, half red half white
  pill: ['..rrww..', '.rrrwww.', 'rrrrwwww', 'rrrrwwww', '.rrrwww.', '..rrww..'],
  // a cottage loaf
  bread: ['..nnnn..', '.nnnnnn.', 'nnoonnon', 'nonnoonn', 'nnnnnnnn', '.nnnnnn.'],
  // a stack of books
  book: ['........', 'rrrrrrr.', 'yyyyyyy.', 'bbbbbbb.', 'gggggggg', 'kkkkkkkk'],
  // a burger in profile
  burger: ['.nnnnnn.', 'nnwnnnnn', 'gggggggg', 'rrrrrrrr', 'yyyyyyyy', '.nnnnnn.'],
  // a bed
  bed: ['........', 'k..wwww.', 'kbbbbbbk', 'kkkkkkkk', 'k......k', '........'],
  // a red cross
  cross: ['..rr....', '..rr....', 'rrrrrr..', 'rrrrrr..', '..rr....', '..rr....'],
  // an arcade cabinet
  arcade: ['.kkkkkk.', 'kbbbbbbk', 'kbyybbbk', 'kkkkkkkk', 'k.rr.k.k', 'kkkkkkkk'],
  // a police shield
  shield: ['.bbbbbb.', 'bbyyyybb', 'bbyyyybb', '.bbbbbb.', '..bbbb..', '...bb...'],
};
