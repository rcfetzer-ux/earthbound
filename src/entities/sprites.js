/**
 * Procedural character sprite sheets.
 *
 * Every character is painted pixel by pixel into a 4×4 sheet
 * (columns = walk frames, rows = facing: down, left, right, up) at 24×34 per
 * cell, then given a hard 1px outline by an edge pass — the chunky,
 * heavy-outlined look of the original's overworld cast.
 *
 * Nothing is traced from the game: bodies are assembled from parametric parts
 * (cap, hair, dress, uniform, stripes…) so the town can be populated with a
 * varied crowd from a handful of numbers.
 */
import * as THREE from 'three';
import { P, shade } from '../core/palette.js';

export const CELL_W = 24;
export const CELL_H = 34;
export const DIRS = ['down', 'left', 'right', 'up'];
export const FRAMES = 4;
/** World units per sprite pixel. */
export const PX = 0.07;

// --- character definitions -------------------------------------------------

/**
 * @typedef {Object} CharCfg
 * @property {'kid'|'adult'|'stout'|'small'} build
 * @property {string} skin
 * @property {string} hair
 * @property {'none'|'cap'|'capBack'|'hat'|'peaked'|'nurse'} hat
 * @property {string} [hatColor]
 * @property {string} shirt
 * @property {string} [shirt2]     stripe / trim colour
 * @property {'plain'|'stripes'|'vstripes'|'dress'|'coat'|'apron'} top
 * @property {string} pants
 * @property {string} shoes
 * @property {'short'|'long'|'ponytail'|'bun'|'pompadour'|'bald'} hairStyle
 * @property {boolean} [backpack]
 * @property {boolean} [glasses]
 */

export const CHARS = {
  // The player: red cap, striped shirt, blue shorts, yellow-ish sneakers.
  hero: {
    build: 'kid', skin: P.skin, hair: P.hairBrown, hairStyle: 'short',
    hat: 'cap', hatColor: P.capRed,
    top: 'stripes', shirt: P.shirtStripeA, shirt2: P.shirtStripeB,
    pants: P.shortsBlue, shoes: P.shoeYellow, backpack: true,
  },
  // The pushy neighbour kid next door.
  neighborKid: {
    build: 'stout', skin: P.skin, hair: P.hairBlonde, hairStyle: 'short',
    hat: 'none',
    top: 'stripes', shirt: '#e8c860', shirt2: '#8a5aa8',
    pants: '#7c5a3a', shoes: '#5a4a3a',
  },
  neighborKidSmall: {
    build: 'small', skin: P.skin, hair: P.hairBlonde, hairStyle: 'short',
    hat: 'none',
    top: 'plain', shirt: '#8ac8e8', shirt2: '#5a9ac8',
    pants: '#6a5a8a', shoes: '#5a4a3a',
  },
  mom: {
    build: 'adult', skin: P.skin, hair: '#c0682c', hairStyle: 'bun',
    hat: 'none',
    top: 'dress', shirt: '#f0a0b8', shirt2: '#f8d8e0',
    pants: '#f0a0b8', shoes: '#a04858',
  },
  sister: {
    build: 'small', skin: P.skin, hair: '#c0682c', hairStyle: 'ponytail',
    hat: 'none',
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
    build: 'adult', skin: P.skin, hair: P.hairBrown, hairStyle: 'bald',
    hat: 'none', glasses: true,
    top: 'coat', shirt: '#4a5a7a', shirt2: '#d05050',
    pants: '#3a4658', shoes: '#2a2028',
  },
  punk: {
    build: 'adult', skin: P.skin, hair: '#3a2a28', hairStyle: 'pompadour',
    hat: 'none',
    top: 'plain', shirt: '#7a4a9a', shirt2: '#c8a8e0',
    pants: '#3a3a4a', shoes: '#201828',
  },
  granny: {
    build: 'adult', skin: '#f0d0b0', hair: '#d8d8e0', hairStyle: 'bun',
    hat: 'none', glasses: true,
    top: 'dress', shirt: '#b8a8d8', shirt2: '#e8e0f0',
    pants: '#b8a8d8', shoes: '#6a5a68',
  },
  townsman: {
    build: 'adult', skin: '#e0a878', hair: P.hairBlack, hairStyle: 'short',
    hat: 'none',
    top: 'plain', shirt: '#68b878', shirt2: '#4a9a5a',
    pants: '#8a6a4a', shoes: '#4a3a2a',
  },
  townswoman: {
    build: 'adult', skin: P.skin, hair: '#7a4a28', hairStyle: 'long',
    hat: 'none',
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
    build: 'stout', skin: P.skin, hair: '#5a4a3a', hairStyle: 'bald',
    hat: 'none',
    top: 'apron', shirt: '#6ab0d0', shirt2: '#f0ece0',
    pants: '#4a5a6a', shoes: '#3a3028',
  },
};

// --- painting primitives ---------------------------------------------------

const BUILDS = {
  kid:    { top: 6,  headW: 10, headH: 10, bodyW: 10, legLen: 4, shoulder: 2 },
  small:  { top: 9,  headW: 10, headH: 9,  bodyW: 9,  legLen: 3, shoulder: 2 },
  stout:  { top: 6,  headW: 11, headH: 10, bodyW: 12, legLen: 4, shoulder: 2 },
  adult:  { build: 'adult', top: 2, headW: 10, headH: 9, bodyW: 11, legLen: 6, shoulder: 3 },
};

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * Paint one character cell.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox cell origin x
 * @param {number} oy cell origin y
 * @param {'down'|'left'|'right'|'up'} dir
 * @param {number} frame 0..3 (0/2 = neutral, 1 = left step, 3 = right step)
 * @param {CharCfg} cfg
 */
export function drawChar(ctx, ox, oy, dir, frame, cfg) {
  const b = BUILDS[cfg.build] ?? BUILDS.kid;
  const feet = oy + CELL_H - 2;
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const flip = dir === 'left';

  // Horizontal centre of the cell; side views sit a hair off-centre.
  const cx = ox + CELL_W / 2;
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = frame % 2 === 1 ? -1 : 0; // 1px bounce on stepping frames

  const legLen = b.legLen;
  const shoeH = 2;
  const bodyH = side ? 7 : 7;
  const legTop = feet - legLen - shoeH;
  const bodyBottom = legTop + 1;
  const bodyTop = bodyBottom - bodyH + bob;
  const headH = b.headH;
  const headBottom = bodyTop + 1;
  const headTop = headBottom - headH;
  const headW = side ? b.headW - 1 : b.headW;
  const headX = cx - headW / 2 + (side ? (flip ? -1 : 1) : 0);
  const bodyW = side ? b.bodyW - 2 : b.bodyW;
  const bodyX = cx - bodyW / 2;

  const skinShade = shade(cfg.skin, -0.16);
  const pantsShade = shade(cfg.pants, -0.2);

  // ---- legs ---------------------------------------------------------------
  const legW = Math.max(3, Math.floor(bodyW / 3));
  const legGap = bodyW - legW * 2;
  const drawLeg = (lx, offset, front) => {
    const c = front ? cfg.pants : pantsShade;
    px(ctx, lx, legTop + Math.max(0, -offset), legW, legLen + Math.min(0, offset), c);
    // shoe
    px(ctx, lx - (side ? 1 : 0), feet - shoeH + offset, legW + (side ? 2 : 0), shoeH,
      front ? cfg.shoes : shade(cfg.shoes, -0.2));
  };
  if (side) {
    const dirSign = flip ? -1 : 1;
    // back leg first
    drawLeg(bodyX + (dirSign < 0 ? 1 : -1) * step, 0, false);
    drawLeg(bodyX + dirSign * step * 2, step === 0 ? 0 : -1, true);
  } else {
    drawLeg(bodyX, frame === 1 ? -1 : 0, frame !== 3);
    drawLeg(bodyX + legW + legGap, frame === 3 ? -1 : 0, frame !== 1);
  }

  // ---- torso --------------------------------------------------------------
  const shirt = cfg.shirt;
  const shirt2 = cfg.shirt2 ?? shade(shirt, -0.2);
  if (cfg.top === 'dress') {
    // Bodice, then a skirt that flares to just above the ankles — the legs and
    // shoes below keep the silhouette from reading as one solid lump.
    const skirtLen = bodyH + legLen - 3;
    for (let i = 0; i < skirtLen; i++) {
      const y = bodyTop + i;
      const grow = Math.max(0, i - 4) * 0.62;
      const w = bodyW - 1 + grow * 2;
      let c = shirt;
      if (i === skirtLen - 1) c = shade(shirt, -0.22);       // hem shadow
      else if (i > 4 && (i % 3 === 0)) c = shade(shirt, -0.09); // fold hints
      px(ctx, cx - w / 2, y, w, 1, c);
    }
    px(ctx, cx - bodyW / 2 + 0.5, bodyTop + 4, bodyW - 1, 1, shirt2); // waistband
    px(ctx, cx - 2, bodyTop, 4, 2, shade(shirt, 0.14));              // collar
  } else {
    px(ctx, bodyX, bodyTop, bodyW, bodyH, shirt);
    if (cfg.top === 'stripes') {
      for (let y = bodyTop; y < bodyTop + bodyH; y += 2) px(ctx, bodyX, y, bodyW, 1, shirt2);
    } else if (cfg.top === 'vstripes') {
      for (let x = bodyX; x < bodyX + bodyW; x += 3) px(ctx, x, bodyTop, 1, bodyH, shirt2);
    } else if (cfg.top === 'coat') {
      // open jacket over a lighter shirt
      px(ctx, cx - 2, bodyTop, 4, bodyH, shade(shirt, 0.42));
      if (!back) px(ctx, cx - 1, bodyTop + 1, 2, 3, shirt2); // tie
      px(ctx, bodyX, bodyTop, 2, bodyH, shade(shirt, -0.12));
      px(ctx, bodyX + bodyW - 2, bodyTop, 2, bodyH, shade(shirt, -0.12));
    } else if (cfg.top === 'apron') {
      px(ctx, bodyX + 1, bodyTop + 2, bodyW - 2, bodyH - 1, shirt2);
      px(ctx, bodyX + 2, bodyTop, 1, 3, shirt2);
      px(ctx, bodyX + bodyW - 3, bodyTop, 1, 3, shirt2);
    }
    // hem shading
    px(ctx, bodyX, bodyTop + bodyH - 1, bodyW, 1, shade(shirt, -0.18));
  }
  // shorts / trousers waist for non-dress
  if (cfg.top !== 'dress') px(ctx, bodyX, bodyBottom - 1, bodyW, 2, cfg.pants);

  // ---- arms ---------------------------------------------------------------
  const armH = bodyH - 1;
  const armY = bodyTop + 1;
  const armSwing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const sleeve = cfg.top === 'coat' ? shade(shirt, -0.08) : shirt;
  if (side) {
    const ax = flip ? bodyX - 2 : bodyX + bodyW;
    px(ctx, ax, armY - armSwing, 2, armH - 1, sleeve);
    px(ctx, ax, armY + armH - 1 - armSwing, 2, 2, cfg.skin); // hand
  } else {
    px(ctx, bodyX - 2, armY + armSwing, 2, armH - 1, sleeve);
    px(ctx, bodyX - 2, armY + armH - 1 + armSwing, 2, 2, cfg.skin);
    px(ctx, bodyX + bodyW, armY - armSwing, 2, armH - 1, sleeve);
    px(ctx, bodyX + bodyW, armY + armH - 1 - armSwing, 2, 2, cfg.skin);
  }

  // ---- backpack (drawn behind on 'up', at the side otherwise) -------------
  if (cfg.backpack) {
    if (back) {
      px(ctx, bodyX + 1, bodyTop + 1, bodyW - 2, bodyH - 1, '#d8b040');
      px(ctx, bodyX + 2, bodyTop + 2, bodyW - 4, 2, shade('#d8b040', -0.25));
    } else if (side) {
      const bx = flip ? bodyX + bodyW - 1 : bodyX - 1;
      px(ctx, bx, bodyTop + 1, 2, bodyH - 2, '#d8b040');
    }
  }

  // ---- head ---------------------------------------------------------------
  px(ctx, headX, headTop, headW, headH, cfg.skin);
  px(ctx, headX, headTop + headH - 1, headW, 1, skinShade);
  if (side) {
    // nose nub
    const nx = flip ? headX - 1 : headX + headW;
    px(ctx, nx, headTop + Math.floor(headH * 0.55), 1, 2, cfg.skin);
  }

  // hair
  const hair = cfg.hair;
  const hairDark = shade(hair, -0.25);
  if (cfg.hairStyle !== 'bald') {
    px(ctx, headX, headTop, headW, 3, hair);
    if (!back) {
      px(ctx, headX, headTop + 2, 2, 3, hair);
      px(ctx, headX + headW - 2, headTop + 2, 2, 3, hair);
    } else {
      px(ctx, headX, headTop, headW, headH - 2, hair);
      px(ctx, headX + 1, headTop + 1, headW - 2, 2, shade(hair, 0.18));
    }
  }
  if (cfg.hairStyle === 'long') {
    px(ctx, headX - 1, headTop + 1, 2, headH + 2, hair);
    px(ctx, headX + headW - 1, headTop + 1, 2, headH + 2, hair);
  } else if (cfg.hairStyle === 'ponytail') {
    const tx = back ? headX + headW / 2 - 1 : (flip ? headX + headW : headX - 2);
    px(ctx, tx, headTop + 2, 2, 6, hair);
    px(ctx, tx, headTop + 7, 2, 2, hairDark);
  } else if (cfg.hairStyle === 'bun') {
    px(ctx, headX + headW / 2 - 2, headTop - 2, 4, 3, hair);
  } else if (cfg.hairStyle === 'pompadour') {
    px(ctx, headX - 1, headTop - 3, headW + 2, 4, hair);
    px(ctx, headX + (flip ? -2 : headW - 1), headTop - 3, 3, 3, hair);
  }

  // hats
  if (cfg.hat === 'cap' || cfg.hat === 'capBack') {
    const hc = cfg.hatColor ?? P.capRed;
    const hcd = shade(hc, -0.28);
    px(ctx, headX - 1, headTop - 2, headW + 2, 4, hc);
    px(ctx, headX, headTop - 3, headW, 2, hc);
    px(ctx, headX - 1, headTop + 1, headW + 2, 1, hcd);
    if (back) {
      px(ctx, headX + headW / 2 - 2, headTop + 1, 4, 2, hcd); // adjuster strap
    } else if (side) {
      const bx = flip ? headX - 4 : headX + headW - 1;
      px(ctx, bx, headTop + 1, 5, 2, hc); // brim, in profile
      px(ctx, bx, headTop + 2, 5, 1, hcd);
    } else {
      px(ctx, headX - 2, headTop + 1, headW + 4, 2, hc); // brim, facing us
      px(ctx, headX - 2, headTop + 2, headW + 4, 1, hcd);
    }
  } else if (cfg.hat === 'peaked') {
    const hc = cfg.hatColor ?? '#2c3a6a';
    px(ctx, headX - 1, headTop - 2, headW + 2, 4, hc);
    px(ctx, headX - 2, headTop + 1, headW + 4, 2, shade(hc, -0.3));
    if (!back) px(ctx, headX + headW / 2 - 2, headTop - 1, 4, 2, '#e8d060'); // badge
  } else if (cfg.hat === 'hat') {
    const hc = cfg.hatColor ?? '#c85838';
    px(ctx, headX - 3, headTop, headW + 6, 2, shade(hc, -0.2)); // wide brim
    px(ctx, headX, headTop - 4, headW, 4, hc);
    px(ctx, headX, headTop - 1, headW, 1, shade(hc, -0.3));
  } else if (cfg.hat === 'nurse') {
    px(ctx, headX + 1, headTop - 2, headW - 2, 3, '#ffffff');
    if (!back) px(ctx, headX + headW / 2 - 1, headTop - 1, 2, 1, '#e05868');
  }

  // face
  if (!back) {
    const eyeY = headTop + Math.floor(headH * 0.5);
    const eye = P.outline;
    if (side) {
      const ex = flip ? headX + 1 : headX + headW - 3;
      px(ctx, ex, eyeY, 2, 2, eye);
    } else {
      px(ctx, headX + 2, eyeY, 2, 2, eye);
      px(ctx, headX + headW - 4, eyeY, 2, 2, eye);
      // cheeks
      px(ctx, headX + 1, eyeY + 3, 1, 1, '#f0a090');
      px(ctx, headX + headW - 2, eyeY + 3, 1, 1, '#f0a090');
      px(ctx, headX + headW / 2 - 1, eyeY + 3, 2, 1, skinShade); // mouth
    }
    if (cfg.glasses) {
      const gy = eyeY - 1;
      if (side) {
        const gx = flip ? headX : headX + headW - 4;
        px(ctx, gx, gy, 4, 4, '#b8d8e8');
        px(ctx, gx, gy, 4, 1, P.outline);
      } else {
        px(ctx, headX + 1, gy, 4, 4, '#b8d8e8');
        px(ctx, headX + headW - 5, gy, 4, 4, '#b8d8e8');
        px(ctx, headX + 5, gy + 1, headW - 10, 1, P.outline);
        px(ctx, headX + 1, gy, 4, 1, P.outline);
        px(ctx, headX + headW - 5, gy, 4, 1, P.outline);
        px(ctx, headX + 2, gy + 1, 2, 2, P.outline);
        px(ctx, headX + headW - 4, gy + 1, 2, 2, P.outline);
      }
    }
  }
}

/**
 * Add a 1px dark outline around every opaque cluster, and a soft inner
 * shadow on the lower-right — cheap volume, very 16-bit.
 */
function outlinePass(ctx, w, h, color = P.outline) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) > 0) continue;
      if (alphaAt(x - 1, y) > 200 || alphaAt(x + 1, y) > 200 ||
          alphaAt(x, y - 1) > 200 || alphaAt(x, y + 1) > 200) {
        out.push(x, y);
      }
    }
  }
  ctx.fillStyle = color;
  for (let i = 0; i < out.length; i += 2) ctx.fillRect(out[i], out[i + 1], 1, 1);
}

const sheetCache = new Map();

/** Build (and cache) a 4×4 walk-cycle sheet for a character config. */
export function characterSheet(name, cfg = CHARS[name]) {
  if (sheetCache.has(name)) return sheetCache.get(name);
  const c = document.createElement('canvas');
  c.width = CELL_W * FRAMES;
  c.height = CELL_H * DIRS.length;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < FRAMES; f++) {
      drawChar(ctx, f * CELL_W, row * CELL_H, dir, f, cfg);
    }
  });
  outlinePass(ctx, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sheet = { texture: tex, cols: FRAMES, rows: DIRS.length, cfg };
  sheetCache.set(name, sheet);
  return sheet;
}

/** A four-legged townsdog, drawn in the same style. */
export function dogSheet() {
  if (sheetCache.has('__dog')) return sheetCache.get('__dog');
  const c = document.createElement('canvas');
  c.width = CELL_W * FRAMES;
  c.height = CELL_H * DIRS.length;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const body = '#e8d8b0';
  const spot = '#8a6a4a';
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < FRAMES; f++) {
      const ox = f * CELL_W;
      const feet = row * CELL_H + CELL_H - 2;
      const side = dir === 'left' || dir === 'right';
      const flip = dir === 'left';
      const cx = ox + CELL_W / 2;
      const step = f % 2;
      // legs
      for (let i = 0; i < (side ? 2 : 2); i++) {
        const lx = side ? cx - 5 + i * 8 : cx - 4 + i * 6;
        px(ctx, lx, feet - 4 + (i === step ? -1 : 0), 2, 4 - (i === step ? -1 : 0), spot);
      }
      // torso
      const bw = side ? 14 : 9;
      px(ctx, cx - bw / 2, feet - 9, bw, 6, body);
      px(ctx, cx - bw / 2, feet - 4, bw, 1, shade(body, -0.2));
      // spots
      px(ctx, cx - bw / 2 + 2, feet - 8, 4, 3, spot);
      // head
      const hx = side ? (flip ? cx - bw / 2 - 4 : cx + bw / 2 - 3) : cx - 4;
      px(ctx, hx, feet - 14, 7, 6, body);
      px(ctx, hx - 1, feet - 14, 2, 3, spot); // ear
      px(ctx, hx + 6, feet - 14, 2, 3, spot);
      if (dir !== 'up') {
        px(ctx, hx + 1, feet - 12, 1, 1, P.outline);
        px(ctx, hx + 5, feet - 12, 1, 1, P.outline);
        px(ctx, hx + 3, feet - 10, 2, 1, P.outline);
      }
      // tail
      const tx = side ? (flip ? cx + bw / 2 : cx - bw / 2 - 2) : cx + 4;
      px(ctx, tx, feet - 12 - step, 2, 4, spot);
    }
  });
  outlinePass(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sheet = { texture: tex, cols: FRAMES, rows: DIRS.length, cfg: { build: 'small' } };
  sheetCache.set('__dog', sheet);
  return sheet;
}
