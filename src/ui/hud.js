/**
 * Dialogue window, place banner and the contextual prompt.
 *
 * Text types out character by character with a blip per letter, and the window
 * waits on a keypress between pages — the pacing of a 16-bit RPG.
 *
 * The text is drawn into a canvas with the hand-drawn pixel face from font.js
 * rather than set as DOM text: browser type at any size was the one thing on
 * screen that could never belong to this world. A speaker can carry an odd,
 * wobbling face — the original changed typeface for anyone strange enough to
 * deserve one.
 */
import { FACES, wrapText, drawText, GLYPH_HEIGHT } from './font.js';

/** Speakers whose voice gets the unsteady face. */
const ODD_SPEAKERS = new Set(['METEORITE', 'DOG']);

export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.el = document.getElementById('dialogue');
    this.textEl = this.el.querySelector('.text');
    this.ctx = this.textEl.getContext('2d');
    this.moreEl = this.el.querySelector('.more');
    this.placeEl = document.getElementById('place');
    this.hintEl = document.getElementById('hint');
    this.fadeEl = document.getElementById('fade');

    this.open = false;
    this.lines = [];
    this.pageIndex = 0;
    this.chars = 0;
    this.typing = false;
    this.charsPerSecond = 46;
    this._acc = 0;
    this._blipAcc = 0;
    this._placeTimer = 0;
  }

  /** Show a sequence of lines. Returns immediately; advance() drives it. */
  say(lines, who = '') {
    this.lines = Array.isArray(lines) ? lines.slice() : [String(lines)];
    this.pageIndex = 0;
    this.who = who ?? '';
    this.face = ODD_SPEAKERS.has(this.who) ? FACES.odd : FACES.town;
    this.open = true;
    this.el.classList.remove('hidden');
    this._startPage();
  }

  /**
   * Size the canvas to its box in device pixels, at a whole-number glyph scale
   * so the letters stay square.
   */
  _resizeCanvas() {
    const rect = this.textEl.getBoundingClientRect();
    const w = Math.max(64, Math.round(rect.width));
    const h = Math.max(48, Math.round(rect.height));
    if (this.textEl.width !== w || this.textEl.height !== h) {
      this.textEl.width = w;
      this.textEl.height = h;
    }
    return { w, h };
  }

  /**
   * Pick the largest whole-pixel glyph scale at which the page still fits.
   *
   * Long lines were being silently cut off at the bottom of the window, and the
   * wobbling face needs more room per line than the upright one, so the size has
   * to be chosen from the text rather than from the window alone.
   */
  _fitScale(page, w, h) {
    const max = Math.max(2, Math.min(5, Math.floor(w / 190)));
    const nameH = this.who ? (GLYPH_HEIGHT + 5) : 0;
    for (let s = max; s > 1; s--) {
      const lines = wrapText(page, w, s, this.face);
      const lineH = (GLYPH_HEIGHT + this.face.lineGap) * s;
      // the wobble face lifts and drops glyphs off the baseline
      const slack = this.face.wobble * s * 2;
      if (nameH * Math.max(1, s - 1) + lines.length * lineH + slack <= h) return s;
    }
    return 2;
  }

  /** Redraw the speaker name and the visible part of the current page. */
  _paint() {
    const { w, h } = this._resizeCanvas();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const page = this.lines[this.pageIndex] ?? '';
    const s = this._fitScale(page, w, h);
    let y = Math.round(this.face.wobble * s);
    if (this.who) {
      drawText(ctx, [this.who], {
        x: 0, y, scale: Math.max(1, s - 1), color: '#f0c440', shadow: '#000000',
        face: FACES.town, seed: 3,
      });
      y += (GLYPH_HEIGHT + 5) * Math.max(1, s - 1);
    }

    const shown = page.slice(0, this.chars);
    // Wrap on the *whole* page so words don't jump lines as they type in.
    const full = wrapText(page, w, s, this.face);
    let remaining = shown.length;
    const visible = [];
    for (const line of full) {
      if (remaining <= 0) break;
      visible.push(line.slice(0, remaining));
      remaining -= line.length + 1;   // +1 for the space the wrap consumed
    }
    // The window is a veil now, not a wall, so whatever is behind it shows
    // through — the drop shadow has to be opaque black to keep the lettering
    // legible against a lit wall or a pale road.
    drawText(ctx, visible, {
      x: 0, y, scale: s, color: '#ffffff', shadow: '#000000',
      face: this.face, seed: 11 + this.pageIndex * 5,
    });
    void h;
  }

  _startPage() {
    this.chars = 0;
    this._acc = 0;
    this.typing = true;
    this.moreEl.classList.remove('done');
    this.moreEl.style.visibility = 'hidden';
    this._paint();
  }

  /** Player pressed the action button. Returns true if the box consumed it. */
  advance() {
    if (!this.open) return false;
    const page = this.lines[this.pageIndex] ?? '';
    if (this.typing && this.chars < page.length) {
      // reveal the rest of the page immediately
      this.chars = page.length;
      this._paint();
      this.typing = false;
      this.moreEl.style.visibility = 'visible';
      this.moreEl.classList.add('done');
      return true;
    }
    this.pageIndex++;
    if (this.pageIndex >= this.lines.length) {
      this.close();
      this.audio?.sfx('cancel');
      return true;
    }
    this.audio?.sfx('select');
    this._startPage();
    return true;
  }

  close() {
    this.open = false;
    this.el.classList.add('hidden');
  }

  update(dt) {
    if (this.open && this.typing) {
      const page = this.lines[this.pageIndex] ?? '';
      this._acc += dt * this.charsPerSecond;
      while (this._acc >= 1 && this.chars < page.length) {
        this._acc -= 1;
        this.chars++;
        const ch = page[this.chars - 1];
        this._blipAcc++;
        if (ch !== ' ' && this._blipAcc % 2 === 0) this.audio?.sfx('text');
      }
      this._paint();
      if (this.chars >= page.length) {
        this.typing = false;
        this.moreEl.style.visibility = 'visible';
        this.moreEl.classList.add('done');
      }
    }
    if (this._placeTimer > 0) {
      this._placeTimer -= dt;
      if (this._placeTimer <= 0) this.placeEl.classList.remove('show');
    }
  }

  /** Flash the place name, like a location banner on entering a new area. */
  showPlace(name, seconds = 2.6) {
    this.placeEl.textContent = name;
    this.placeEl.classList.add('show');
    this._placeTimer = seconds;
  }

  hint(html) {
    if (!html) {
      this.hintEl.classList.add('hidden');
      return;
    }
    if (this.hintEl.innerHTML !== html) this.hintEl.innerHTML = html;
    this.hintEl.classList.remove('hidden');
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
  }
}
