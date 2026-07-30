/**
 * On-screen controls for touch devices.
 *
 * An analogue thumb pad plus an A button and two camera nudges. The pad reports
 * a direction and a magnitude — push to the outer ring and you run — so there is
 * no separate run control to find.
 *
 * Everything goes through pointer events with pointer capture, so a thumb that
 * slides off the pad keeps steering instead of dropping the input, and the pad
 * and buttons never compete for the same gesture.
 */

/**
 * @param {import('../core/input.js').Input} input
 * @param {{camLeft:Function, camRight:Function}} hooks
 */
export function initTouchControls(input, hooks = {}) {
  const pad = document.getElementById('pad');
  const nub = pad?.querySelector('.nub');
  const btnA = document.getElementById('btn-a');
  const btnL = document.getElementById('btn-cam-l');
  const btnR = document.getElementById('btn-cam-r');
  if (!pad || !btnA) return;

  // --- thumb pad -----------------------------------------------------------
  let active = null;

  const apply = (ev) => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width / 2;
    let dx = (ev.clientX - cx) / radius;
    let dy = (ev.clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }

    // Small deadzone so resting a thumb doesn't drift the character.
    const mag = Math.min(1, len);
    if (mag < 0.18) {
      input.setTouchAxis(0, 0, false);
      nub.style.transform = 'translate(0, 0)';
      pad.classList.remove('run');
      return;
    }
    const run = mag > 0.85;
    // screen y is down, world axis y is up
    input.setTouchAxis(dx, -dy, run);
    nub.style.transform = `translate(${dx * 42}%, ${dy * 42}%)`;
    pad.classList.toggle('run', run);
  };

  const release = () => {
    active = null;
    input.setTouchAxis(0, 0, false);
    nub.style.transform = 'translate(0, 0)';
    pad.classList.remove('run');
  };

  pad.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    active = ev.pointerId;
    pad.setPointerCapture(ev.pointerId);
    apply(ev);
  });
  pad.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== active) return;
    ev.preventDefault();
    apply(ev);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(type, (ev) => {
      if (ev.pointerId !== active) return;
      release();
    });
  }

  // --- buttons -------------------------------------------------------------
  const tap = (el, fn) => {
    if (!el) return;
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      fn();
    });
    // Stop a long press from selecting text or opening a context menu.
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  };

  tap(btnA, () => input.press('action'));
  tap(btnL, () => hooks.camLeft?.());
  tap(btnR, () => hooks.camRight?.());

  // Belt and braces: if the window loses focus mid-drag, stop walking.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}
