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

    // --- touch -------------------------------------------------------------
    // The on-screen controls in ui/touch.js drive these; nothing here listens to
    // raw touches, so the pad and buttons can't fight each other for a gesture.
    this.touchVec = new THREE.Vector2();
    this.touchRun = false;
    /** True once any touch has been seen — used to reveal the on-screen pad. */
    this.touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    window.addEventListener('touchstart', () => { this.touch = true; }, { passive: true, once: true });
  }

  /** Called by the on-screen pad. `x` right, `y` up, each in [-1, 1]. */
  setTouchAxis(x, y, run = false) {
    this.touchVec.set(x, y);
    this.touchRun = run;
  }

  /** Called by the on-screen buttons. */
  press(action) {
    this.pressed.set(action, (this.pressed.get(action) ?? 0) + 1);
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
    y += this.touchVec.y;
    this.axis.set(x, y);
    if (this.axis.lengthSq() > 1) this.axis.normalize();
    return this.axis;
  }

  held(a) {
    // Pushing the on-screen pad to its outer ring counts as running.
    if (a === 'run' && this.touchRun) return true;
    return this.down.has(a);
  }

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
