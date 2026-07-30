/** Keyboard + touch input, normalised into a small intent object. */
import * as THREE from 'three';

const MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  // Z/X for confirm/cancel, the way a SNES pad maps to a keyboard.
  Space: 'action', Enter: 'action', KeyZ: 'action',
  Escape: 'cancel', KeyX: 'cancel',
  KeyQ: 'camLeft', Comma: 'camLeft',
  KeyE: 'camRight', Period: 'camRight',
  KeyC: 'camReset',
};

export class Input {
  constructor(el = window) {
    this.down = new Set();
    /**
     * Presses are *counted*, not flagged: if two taps land inside one frame
     * (easy on a slow machine) both still get seen instead of coalescing.
     */
    this.pressed = new Map();
    this.axis = new THREE.Vector2();

    el.addEventListener('keydown', (e) => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.down.has(a)) this.pressed.set(a, (this.pressed.get(a) ?? 0) + 1);
      this.down.add(a);
    });
    el.addEventListener('keyup', (e) => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.down.delete(a);
    });
    window.addEventListener('blur', () => this.down.clear());

    // --- touch: left half = virtual stick, right half = action -------------
    this.touchVec = new THREE.Vector2();
    this._touchId = null;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.5 && this._touchId === null) {
          this._touchId = t.identifier;
          this._touchOrigin = { x: t.clientX, y: t.clientY };
        } else {
          this.pressed.set('action', (this.pressed.get('action') ?? 0) + 1);
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._touchId) continue;
        const dx = t.clientX - this._touchOrigin.x;
        const dy = t.clientY - this._touchOrigin.y;
        const r = 44;
        this.touchVec.set(
          THREE.MathUtils.clamp(dx / r, -1, 1),
          THREE.MathUtils.clamp(dy / r, -1, 1),
        );
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) {
          this._touchId = null;
          this.touchVec.set(0, 0);
        }
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
  }

  /** Screen-space movement axis: x = right, y = up. */
  readAxis() {
    let x = 0;
    let y = 0;
    if (this.down.has('left')) x -= 1;
    if (this.down.has('right')) x += 1;
    if (this.down.has('up')) y += 1;
    if (this.down.has('down')) y -= 1;
    x += this.touchVec.x;
    y -= this.touchVec.y;
    this.axis.set(x, y);
    if (this.axis.lengthSq() > 1) this.axis.normalize();
    return this.axis;
  }

  held(a) { return this.down.has(a); }

  /** Consume one queued press of this action. */
  once(a) {
    const n = this.pressed.get(a) ?? 0;
    if (n <= 0) return false;
    if (n === 1) this.pressed.delete(a);
    else this.pressed.set(a, n - 1);
    return true;
  }

  /** Drop anything not consumed this frame, so presses never pile up. */
  endFrame() { this.pressed.clear(); }
}
