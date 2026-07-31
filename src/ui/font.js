/**
 * Hand-drawn pixel typefaces.
 *
 * The dialogue used the browser's monospace at whatever size the CSS asked for,
 * which is the one thing on screen that could never look like it came from this
 * world. These glyphs are drawn by hand on a 5×7 grid and blitted to a canvas,
 * so the text is made of the same square pixels as everything else.
 *
 * Two faces, as the original had several:
 *   town   — the everyday voice, upright and friendly
 *   odd    — for anyone who isn't quite from around here: every glyph gets a
 *            wobble, a tilt and a bounce, so the line never sits still
 *
 * Glyphs are authored as strings of `.` and `#`, top row first.
 */

const G = {
  A: '.###.,#...#,#...#,#####,#...#,#...#,#...#',
  B: '####.,#...#,####.,#...#,#...#,#...#,####.',
  C: '.####,#....,#....,#....,#....,#....,.####',
  D: '####.,#...#,#...#,#...#,#...#,#...#,####.',
  E: '#####,#....,####.,#....,#....,#....,#####',
  F: '#####,#....,####.,#....,#....,#....,#....',
  G: '.####,#....,#....,#..##,#...#,#...#,.####',
  H: '#...#,#...#,#####,#...#,#...#,#...#,#...#',
  I: '.###.,..#..,..#..,..#..,..#..,..#..,.###.',
  J: '..###,...#.,...#.,...#.,...#.,#..#.,.##..',
  K: '#...#,#..#.,#.#..,##...,#.#..,#..#.,#...#',
  L: '#....,#....,#....,#....,#....,#....,#####',
  M: '#...#,##.##,#.#.#,#...#,#...#,#...#,#...#',
  N: '#...#,##..#,#.#.#,#..##,#...#,#...#,#...#',
  O: '.###.,#...#,#...#,#...#,#...#,#...#,.###.',
  P: '####.,#...#,#...#,####.,#....,#....,#....',
  Q: '.###.,#...#,#...#,#...#,#.#.#,#..#.,.##.#',
  R: '####.,#...#,#...#,####.,#.#..,#..#.,#...#',
  S: '.####,#....,#....,.###.,....#,....#,####.',
  T: '#####,..#..,..#..,..#..,..#..,..#..,..#..',
  U: '#...#,#...#,#...#,#...#,#...#,#...#,.###.',
  V: '#...#,#...#,#...#,#...#,#...#,.#.#.,..#..',
  W: '#...#,#...#,#...#,#.#.#,#.#.#,##.##,#...#',
  X: '#...#,#...#,.#.#.,..#..,.#.#.,#...#,#...#',
  Y: '#...#,#...#,.#.#.,..#..,..#..,..#..,..#..',
  Z: '#####,....#,...#.,..#..,.#...,#....,#####',

  a: '.....,.....,.###.,....#,.####,#...#,.####',
  b: '#....,#....,####.,#...#,#...#,#...#,####.',
  c: '.....,.....,.####,#....,#....,#....,.####',
  d: '....#,....#,.####,#...#,#...#,#...#,.####',
  e: '.....,.....,.###.,#...#,#####,#....,.####',
  f: '..##.,.#...,####.,.#...,.#...,.#...,.#...',
  g: '.....,.....,.####,#...#,.####,....#,.###.',
  h: '#....,#....,####.,#...#,#...#,#...#,#...#',
  i: '..#..,.....,.##..,..#..,..#..,..#..,.###.',
  j: '...#.,.....,..##.,...#.,...#.,#..#.,.##..',
  k: '#....,#..#.,#.#..,##...,#.#..,#..#.,#...#',
  l: '.##..,..#..,..#..,..#..,..#..,..#..,.###.',
  m: '.....,.....,##.#.,#.#.#,#.#.#,#.#.#,#.#.#',
  n: '.....,.....,####.,#...#,#...#,#...#,#...#',
  o: '.....,.....,.###.,#...#,#...#,#...#,.###.',
  p: '.....,.....,####.,#...#,####.,#....,#....',
  q: '.....,.....,.####,#...#,.####,....#,....#',
  r: '.....,.....,#.##.,##...,#....,#....,#....',
  s: '.....,.....,.####,#....,.###.,....#,####.',
  t: '.#...,.#...,####.,.#...,.#...,.#..#,..##.',
  u: '.....,.....,#...#,#...#,#...#,#...#,.####',
  v: '.....,.....,#...#,#...#,#...#,.#.#.,..#..',
  w: '.....,.....,#.#.#,#.#.#,#.#.#,#.#.#,.#.#.',
  x: '.....,.....,#...#,.#.#.,..#..,.#.#.,#...#',
  y: '.....,.....,#...#,#...#,.####,....#,.###.',
  z: '.....,.....,#####,...#.,..#..,.#...,#####',

  0: '.###.,#..##,#.#.#,#.#.#,##..#,#...#,.###.',
  1: '..#..,.##..,..#..,..#..,..#..,..#..,.###.',
  2: '.###.,#...#,....#,...#.,..#..,.#...,#####',
  3: '####.,....#,....#,.###.,....#,....#,####.',
  4: '#...#,#...#,#...#,#####,....#,....#,....#',
  5: '#####,#....,####.,....#,....#,#...#,.###.',
  6: '.###.,#....,#....,####.,#...#,#...#,.###.',
  7: '#####,....#,...#.,..#..,.#...,.#...,.#...',
  8: '.###.,#...#,#...#,.###.,#...#,#...#,.###.',
  9: '.###.,#...#,#...#,.####,....#,....#,.###.',

  ' ': '.....,.....,.....,.....,.....,.....,.....',
  '.': '.....,.....,.....,.....,.....,.##..,.##..',
  ',': '.....,.....,.....,.....,.##..,.##..,.#...',
  '!': '..#..,..#..,..#..,..#..,..#..,.....,..#..',
  '?': '.###.,#...#,....#,..##.,..#..,.....,..#..',
  "'": '..#..,..#..,.....,.....,.....,.....,.....',
  '"': '.#.#.,.#.#.,.....,.....,.....,.....,.....',
  '-': '.....,.....,.....,#####,.....,.....,.....',
  '—': '.....,.....,.....,#####,.....,.....,.....',
  ':': '.....,..#..,.....,.....,..#..,.....,.....',
  ';': '.....,..#..,.....,.....,..#..,..#..,.#...',
  '(': '...#.,..#..,.#...,.#...,.#...,..#..,...#.',
  ')': '.#...,..#..,...#.,...#.,...#.,..#..,.#...',
  '/': '....#,....#,...#.,..#..,.#...,#....,#....',
  '&': '.##..,#..#.,#.#..,.#...,#.#.#,#..#.,.##.#',
  '…': '.....,.....,.....,.....,.....,.....,#.#.#',
  '*': '.....,#.#.#,.###.,#####,.###.,#.#.#,.....',
  '+': '.....,..#..,..#..,#####,..#..,..#..,.....',
  '%': '#...#,#..#.,...#.,..#..,.#...,.#..#,#...#',
  '#': '.#.#.,#####,.#.#.,.#.#.,#####,.#.#.,.....',
  '’': '..#..,..#..,.....,.....,.....,.....,.....',
  '“': '.#.#.,.#.#.,.....,.....,.....,.....,.....',
  '”': '.#.#.,.#.#.,.....,.....,.....,.....,.....',
};

const GLYPH_W = 5;
const GLYPH_H = 7;

const parsed = new Map();
function glyph(ch) {
  if (parsed.has(ch)) return parsed.get(ch);
  const src = G[ch] ?? G[ch.toUpperCase()] ?? G['?'];
  const rows = src.split(',');
  parsed.set(ch, rows);
  return rows;
}

/** Trim the blank columns either side so the face is proportional, not fixed. */
const widthCache = new Map();
function glyphWidth(ch) {
  if (ch === ' ') return 2;
  if (widthCache.has(ch)) return widthCache.get(ch);
  const rows = glyph(ch);
  let last = 0;
  for (const r of rows) {
    for (let x = GLYPH_W - 1; x >= 0; x--) {
      if (r[x] === '#') { last = Math.max(last, x); break; }
    }
  }
  const w = last + 1;
  widthCache.set(ch, w);
  return w;
}

export const FACES = {
  /** Everyday speech. */
  town: { wobble: 0, tilt: 0, bounce: 0, gap: 1, lineGap: 3 },
  /**
   * For characters who aren't from around here. Every glyph is nudged off the
   * baseline and rotated a little, deterministically per position, so the line
   * is unsteady but never re-shuffles as it types out.
   */
  odd: { wobble: 1.6, tilt: 0.19, bounce: 1.2, gap: 2, lineGap: 3 },
};

/** Deterministic per-glyph jitter — same character, same wobble, every frame. */
function jitter(seed) {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Measure how the text will wrap.
 * @returns {string[]} lines
 */
export function wrapText(text, maxWidthPx, scale, face = FACES.town) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  const widthOf = (s) => {
    let w = 0;
    for (const ch of s) w += (glyphWidth(ch) + face.gap) * scale;
    return w;
  };
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && widthOf(attempt) > maxWidthPx) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw text into a 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {{x:number,y:number,scale:number,color:string,shadow?:string,face?:object,seed?:number}} o
 * @returns {number} the y position after the last line
 */
export function drawText(ctx, lines, o) {
  const { x, y, scale, color, shadow = null, face = FACES.town, seed = 0 } = o;
  let cy = y;
  let i = 0;
  for (const line of lines) {
    let cx = x;
    for (const ch of line) {
      const rows = glyph(ch);
      const w = glyphWidth(ch);
      if (ch !== ' ') {
        const j = jitter(seed + i * 7.3);
        const j2 = jitter(seed + i * 3.1 + 11);
        const dy = (j - 0.5) * 2 * face.wobble * scale;
        const tilt = (j2 - 0.5) * 2 * face.tilt;
        const bounce = face.bounce ? Math.sin(i * 1.7) * face.bounce * scale : 0;

        ctx.save();
        ctx.translate(cx, cy + dy + bounce);
        if (tilt) ctx.rotate(tilt);
        for (let ry = 0; ry < GLYPH_H; ry++) {
          for (let rx = 0; rx < w; rx++) {
            if (rows[ry][rx] !== '#') continue;
            if (shadow) {
              ctx.fillStyle = shadow;
              ctx.fillRect(rx * scale + scale, ry * scale + scale, scale, scale);
            }
          }
        }
        for (let ry = 0; ry < GLYPH_H; ry++) {
          for (let rx = 0; rx < w; rx++) {
            if (rows[ry][rx] !== '#') continue;
            ctx.fillStyle = color;
            ctx.fillRect(rx * scale, ry * scale, scale, scale);
          }
        }
        ctx.restore();
      }
      cx += (w + face.gap) * scale;
      i++;
    }
    cy += (GLYPH_H + face.lineGap) * scale;
  }
  return cy;
}

export const GLYPH_HEIGHT = GLYPH_H;
