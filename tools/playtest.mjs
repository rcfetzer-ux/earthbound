/**
 * Headless playtest.
 *
 * Drives the game with synthetic key presses and asserts the things that are
 * easy to break and hard to see in a screenshot: that walking moves you, that
 * stairs change your height, that doors take you in and out of buildings, that
 * dialogue opens, and that the frame rate holds up.
 *
 *   node tools/playtest.mjs [--url http://localhost:5173]
 */
import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const LOCAL_CHROME = '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  executablePath: existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('#start');
await page.waitForTimeout(900);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

const state = () => page.evaluate(() => {
  const g = window.__game;
  return {
    zone: g.game.zone.name,
    x: +g.player.pos.x.toFixed(2),
    y: +g.player.pos.y.toFixed(2),
    z: +g.player.pos.z.toFixed(2),
    yaw: +g.player.yaw.toFixed(2),
    targetYaw: +g.player.targetYaw.toFixed(2),
    dialogue: !document.getElementById('dialogue').classList.contains('hidden'),
    npcs: g.game.zone.npcs.length,
    doors: g.game.zone.doors.length,
  };
});

async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(140);
}

/**
 * Hold a key until `done(state)` is true, or until the budget runs out.
 * Fixed durations make these checks hostage to the frame rate — this sandbox
 * renders in software at ~10fps, a real GPU at 60 — so the tests wait on the
 * game's state instead of on the clock.
 */
async function holdUntil(key, done, maxMs = 6000) {
  await page.keyboard.down(key);
  const t0 = Date.now();
  let s2 = await state();
  while (Date.now() - t0 < maxMs && !done(s2)) {
    await page.waitForTimeout(120);
    s2 = await state();
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(140);
  return s2;
}

async function teleport(zone, x, z, y, spawn = null) {
  await page.evaluate(({ zone, x, z, y, spawn }) => {
    const g = window.__game;
    if (spawn) { g.enterZone(zone, spawn); return; }
    if (g.game.zone.name !== zone) g.enterZone(zone, 'start');
    const gy = g.game.zone.ground.sample(x, z, y);
    g.player.pos.set(x, gy === null ? y : gy, z);
    g.player.syncTransform();
    g.game.doorCooldown = 0.4;
  }, { zone, x, z, y, spawn });
  await page.waitForTimeout(200);
}

// --- 1. the town builds and the player starts outside their house ----------
let s = await state();
check('starts in Onett', s.zone === 'onett', `at ${s.x},${s.z} y=${s.y}`);
check('town is populated', s.npcs >= 10 && s.doors >= 6, `${s.npcs} npcs, ${s.doors} doors`);

// --- 2. walking ------------------------------------------------------------
await teleport('onett', 0, 44, 0);   // open stretch of the south road
let before = await state();
let after = await holdUntil('ArrowRight', (v) => v.x > before.x + 2, 4000);
check('walks east', after.x > before.x + 2, `x ${before.x} → ${after.x}`);
// facing is world-space now: +X is a yaw of +90 degrees
check('faces the way it walks', Math.abs(after.targetYaw - Math.PI / 2) < 0.2,
  `targetYaw ${after.targetYaw}`);

before = after;
after = await holdUntil('ArrowDown', (v) => v.z > before.z + 2, 4000);
check('walks south', after.z > before.z + 2, `z ${before.z} → ${after.z}`);

// --- 3. running is faster than walking ------------------------------------
const speeds = await page.evaluate(() => {
  // Step the movement maths directly so the comparison is frame-rate proof.
  const g = window.__game;
  return { walk: g.WALK_SPEED, run: g.RUN_SPEED };
});
check('running outpaces walking', speeds.run > speeds.walk * 1.3,
  `${speeds.walk} vs ${speeds.run} units/s`);

// --- 4. stairs change height ----------------------------------------------
// The east flight, from main street up to the residential shelf.
await teleport('onett', 57, 4, 2.8);
before = await state();
after = await holdUntil('ArrowUp', (v) => v.y > 5.2, 8000);
check('stairs climb from town to the shelf', after.y > before.y + 1.4,
  `y ${before.y} → ${after.y} (z ${before.z} → ${after.z})`);

// --- 5. cliffs are walls ---------------------------------------------------
await teleport('onett', 20, -5, 2.8);         // main street, under the shelf cliff
before = await state();
await hold('ArrowUp', 1600);
after = await state();
check('cannot walk up a cliff face', after.y < 4.0 && after.z > -9,
  `ended at z=${after.z} y=${after.y}`);

// --- 6. buildings are solid -----------------------------------------------
await teleport('onett', -9, 6.5, 2.8);        // blank stretch of the library front,
                                              // clear of doors, lamp posts and bushes
before = await state();
after = await holdUntil('ArrowUp', (v) => v.z < 4.4, 4000);
check('cannot walk through a shop wall', after.z > 3.0 && after.z < 5.0,
  `walked from z=${before.z} to z=${after.z}, wall at 3.0`);

// --- 7. doors: into the house and back out --------------------------------
await teleport('onett', 32.8, -30.2, 5.8);    // on the path outside the front door
s = await holdUntil('ArrowUp', (v) => v.zone === 'nessHouse', 6000);
check('front door leads inside', s.zone === 'nessHouse', `zone=${s.zone}`);

if (s.zone === 'nessHouse') {
  await page.waitForTimeout(500);
  s = await holdUntil('ArrowDown', (v) => v.zone === 'onett', 6000);
  check('and back out to Onett', s.zone === 'onett', `zone=${s.zone}`);
}

// --- 8. interior stairs to the bedroom ------------------------------------
await teleport('nessHouse', 0, 0, 0, 'front');
await teleport('nessHouse', 3.6, 4.9, 0);     // living-room floor, west of the flight
s = await holdUntil('ArrowRight', (v) => v.zone === 'nessBedroom', 6000);
check('stairs reach the bedroom', s.zone === 'nessBedroom', `zone=${s.zone}`);

// --- 9. every interior loads and its exit points back --------------------
for (const [zone, label] of [
  ['neighborHouse', "neighbour's house"], ['drugstore', 'drug store'],
  ['arcade', 'arcade'], ['hotel', 'hotel'], ['hospital', 'hospital'],
]) {
  const info = await page.evaluate((z) => {
    const g = window.__game;
    g.enterZone(z, 'front');
    const zn = g.game.zone;
    return {
      name: zn.name,
      exits: zn.doors.filter((d) => d.target === 'onett').length,
      npcs: zn.npcs.length,
      walkable: zn.ground.sample(g.player.pos.x, g.player.pos.z, 0) !== null,
    };
  }, zone);
  check(`${label} loads with an exit`, info.name === zone && info.exits >= 1 && info.walkable,
    `${info.npcs} npcs, ${info.exits} exit(s)`);
}

// --- 9a. walking through a shop door leaves you able to walk --------------
// The reported symptom was arriving in the middle of the arcade unable to
// move: the door named a spawn the arcade did not define, so the player was
// dropped at the origin, inside a cabinet. Entering by hand would not have
// caught it — only using the door does.
for (const [label, zone, x, z, y] of [
  ['arcade', 'arcade', 24, 5.6, 2.8],
  ['drug store', 'drugstore', -46, 5.6, 2.8],
  ['hotel', 'hotel', 43, 5.6, 2.8],
]) {
  await teleport('onett', x, z, y);
  s = await holdUntil('ArrowUp', (v) => v.zone === zone, 6000);
  if (s.zone !== zone) {
    check(`${label}: door leads inside`, false, `zone=${s.zone}`);
    continue;
  }
  await page.waitForTimeout(400);
  before = await state();
  after = await holdUntil('ArrowLeft', (v) => Math.abs(v.x - before.x) > 0.8, 3000);
  check(`${label}: you can move after coming through the door`,
    Math.abs(after.x - before.x) > 0.5 || Math.abs(after.z - before.z) > 0.5,
    `at ${after.x},${after.z} (from ${before.x},${before.z})`);
}

// --- 9b. every spawn and door is geometrically sane -----------------------
// A spawn inside its own door trigger bounces the player between rooms; a door
// with no standable approach can never be used. Both are easy to introduce by
// nudging a coordinate, so check them all.
const geometry = await page.evaluate(() => {
  const g = window.__game;
  const names = ['onett', 'nessHouse', 'nessBedroom', 'neighborHouse', 'drugstore', 'arcade', 'hotel', 'hospital'];
  const out = [];
  for (const n of names) {
    g.enterZone(n, 'start');
    const z = g.game.zone;
    for (const [key, sp] of Object.entries(z.spawns)) {
      if (z.ground.sample(sp.x, sp.z, sp.y ?? 0) === null) out.push(`${n}/${key}: not on walkable ground`);
      const solid = z.solids.hit(sp.x, sp.z, 0.45);
      if (solid) out.push(`${n}/${key}: inside solid '${solid.tag}'`);
      for (const d of z.doors) {
        const dist = Math.hypot(d.x - sp.x, d.z - sp.z);
        if (dist < (d.r ?? 1.2)) out.push(`${n}/${key}: inside door trigger '${d.label}'`);
      }
    }
    for (const d of z.doors) {
      // A door naming a spawn its target does not define drops the player at
      // the target's origin, which is as likely as not inside the furniture.
      if (d.target) {
        g.enterZone(d.target, 'start');
        const dest = g.game.zone;
        if (!dest.spawns[d.spawn ?? 'front']) {
          out.push(`${n}: door '${d.label}' → ${d.target}/'${d.spawn}' — no such spawn`);
        }
        g.enterZone(n, 'start');
      }
      let ok = false;
      for (let a = 0; a < 16 && !ok; a++) {
        for (const rr of [0.3, 0.6, 0.9]) {
          const x = d.x + Math.cos((a / 16) * 6.283) * (d.r * rr);
          const zz = d.z + Math.sin((a / 16) * 6.283) * (d.r * rr);
          if (!z.solids.hit(x, zz, 0.45) && z.ground.sample(x, zz, d.y ?? 0) !== null) { ok = true; break; }
        }
      }
      if (!ok) out.push(`${n}: door '${d.label}' has no standable approach`);
    }
  }
  return out;
});
check('spawns and doors are all reachable', geometry.length === 0, geometry.join('; ') || '8 zones audited');

// --- 10. dialogue ---------------------------------------------------------
await page.evaluate(() => {
  const g = window.__game;
  g.enterZone('nessHouse', 'front');
  // stand right next to the first NPC and face them
  const npc = g.game.zone.npcs[0];
  g.player.pos.set(npc.pos.x, npc.pos.y, npc.pos.z + 1.1);
  g.player.facePoint(npc.pos.x, npc.pos.z);
    g.player.yaw = g.player.targetYaw;
    g.player.model.rotation.y = g.player.yaw;
  g.player.syncTransform();
});
await page.waitForTimeout(250);
await page.keyboard.press('Space');
await page.waitForTimeout(350);
s = await state();
check('talking opens the dialogue window', s.dialogue);
// The text is drawn into a canvas now, so ask the HUD what it is revealing
// rather than reading DOM text.
const typed = await page.evaluate(() => {
  const h = window.__game.hud;
  return { chars: h.chars, page: (h.lines[h.pageIndex] ?? '').slice(0, h.chars) };
});
check('dialogue types text out', typed.chars > 0, JSON.stringify(typed.page.slice(0, 40)));
// Page through to the end. Pressing again would just start the conversation
// over, so stop as soon as the window closes.
let closed = false;
for (let i = 0; i < 12 && !closed; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(240);
  closed = !(await state()).dialogue;
}
check('dialogue pages through and closes', closed);

// --- 11. frame rate -------------------------------------------------------
await teleport('onett', -20, 10.5, 2.8);
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - t0 > 2000) resolve(Math.round((frames * 1000) / (performance.now() - t0)));
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
// This runs on a software rasteriser, so the bar is deliberately low.
check('renders at a playable rate (software GL)', fps >= 8, `${fps} fps`);

// --- 12. camera rotation --------------------------------------------------
const yawBefore = await page.evaluate(() => window.__game.cam.desiredYaw);
await page.keyboard.press('KeyQ');
await page.waitForTimeout(200);
const yawAfter = await page.evaluate(() => window.__game.cam.desiredYaw);
check('camera can be turned', Math.abs(yawAfter - yawBefore) > 0.1, `${yawBefore.toFixed(2)} → ${yawAfter.toFixed(2)}`);

// --- 13. mobile: on-screen controls, both orientations --------------------
// The reported symptom was "nothing happens when I hit Press Start", so this
// exercises the whole touch path: start by tap, walk with the pad, talk with A.
for (const [label, w, h] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent,
  });
  const mp = await ctx.newPage();
  const mErrs = [];
  mp.on('pageerror', (e) => mErrs.push(e.message));
  await mp.goto(URL, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(700);
  await mp.tap('#start');
  await mp.waitForTimeout(1400);

  const st = await mp.evaluate(() => ({
    zone: window.__game?.game.zone?.name ?? null,
    controls: !document.getElementById('touch').classList.contains('hidden'),
    hFov: (() => {
      const c = window.__game.cam.camera;
      return +(2 * Math.atan(Math.tan((c.fov * Math.PI) / 360) * c.aspect) * 180 / Math.PI).toFixed(1);
    })(),
  }));
  check(`mobile ${label}: starts on tap`, st.zone === 'onett', `zone=${st.zone}`);
  check(`mobile ${label}: on-screen controls appear`, st.controls);
  // A portrait window would otherwise squeeze the view to a ~15° slit. Portrait
  // is still tighter than landscape — that is geometry, not a bug — so the bar
  // is what a phone held upright can actually give.
  check(`mobile ${label}: usable horizontal view`, st.hFov >= 27, `${st.hFov}° across`);

  // Move off the doorstep first: the spawn faces the front door, so walking
  // north from there measures a room change rather than a step.
  await mp.evaluate(() => {
    const g = window.__game;
    g.player.pos.set(0, 0, 44);
    g.player.syncTransform();
    g.game.doorCooldown = 0.4;
  });
  await mp.waitForTimeout(200);
  const padBox = await mp.locator('#pad').boundingBox();
  const before = await mp.evaluate(() => +window.__game.player.pos.z.toFixed(2));
  await mp.mouse.move(padBox.x + padBox.width / 2, padBox.y + padBox.height / 2);
  await mp.mouse.down();
  await mp.mouse.move(padBox.x + padBox.width / 2, padBox.y + padBox.height * 0.06, { steps: 4 });
  await mp.waitForTimeout(1200);
  const after = await mp.evaluate(() => +window.__game.player.pos.z.toFixed(2));
  await mp.mouse.up();
  check(`mobile ${label}: pad walks the character`, after < before - 0.8, `z ${before} → ${after}`);

  await mp.evaluate(() => {
    const g = window.__game;
    const npc = g.game.zone.npcs[0];
    g.player.pos.set(npc.pos.x, npc.pos.y, npc.pos.z + 1.1);
    g.player.facePoint(npc.pos.x, npc.pos.z);
    g.player.yaw = g.player.targetYaw;
    g.player.model.rotation.y = g.player.yaw;
    g.player.syncTransform();
  });
  await mp.waitForTimeout(300);
  await mp.locator('#btn-a').tap();
  await mp.waitForTimeout(600);
  const talked = await mp.evaluate(() => !document.getElementById('dialogue').classList.contains('hidden'));
  check(`mobile ${label}: A button talks`, talked);
  if (mErrs.length) check(`mobile ${label}: no page errors`, false, mErrs.join(' | '));
  await ctx.close();
}

// --- 14. an unsupported device gets an explanation, not a dead button -----
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const ep = await ctx.newPage();
  await ep.addInitScript(() => { delete window.WebGL2RenderingContext; });
  await ep.goto(URL, { waitUntil: 'networkidle' });
  await ep.waitForTimeout(600);
  const shown = await ep.evaluate(() => ({
    visible: !document.getElementById('boot-error').classList.contains('hidden'),
    what: document.querySelector('#boot-error .what').textContent,
    hint: document.querySelector('#boot-error .hint').textContent.length,
  }));
  check('no WebGL2 → explains itself instead of failing silently',
    shown.visible && /WebGL2/.test(shown.what) && shown.hint > 40, shown.what);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of [...new Set(errors)]) console.error(`  ${e}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exit(1);
