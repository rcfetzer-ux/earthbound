/**
 * Dialogue window, place banner and the contextual prompt.
 *
 * Text types out character by character with a blip per letter, and the window
 * waits on a keypress between pages — the pacing of a 16-bit RPG.
 */

export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.el = document.getElementById('dialogue');
    this.whoEl = this.el.querySelector('.who');
    this.textEl = this.el.querySelector('.text');
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
    this.who = who;
    this.open = true;
    this.el.classList.remove('hidden');
    this.whoEl.textContent = who;
    this._startPage();
  }

  _startPage() {
    this.chars = 0;
    this._acc = 0;
    this.typing = true;
    this.textEl.textContent = '';
    this.moreEl.classList.remove('done');
    this.moreEl.style.visibility = 'hidden';
  }

  /** Player pressed the action button. Returns true if the box consumed it. */
  advance() {
    if (!this.open) return false;
    const page = this.lines[this.pageIndex] ?? '';
    if (this.typing && this.chars < page.length) {
      // reveal the rest of the page immediately
      this.chars = page.length;
      this.textEl.textContent = page;
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
      this.textEl.textContent = page.slice(0, this.chars);
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
