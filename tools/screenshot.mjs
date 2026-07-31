/**
 * Screenshot harness.
 *
 * Boots the game in headless Chromium, teleports the player to a list of
 * vantage points, and saves a PNG of each so the look can be reviewed and
 * iterated on. Also fails loudly on console errors, which makes it a decent
 * smoke test.
 *
 *   node tools/screenshot.mjs [--url http://localhost:5173] [--out shots]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

const URL = arg('url', 'http://localhost:5173/');
const OUT = arg('out', 'shots');
const ONLY = arg('only', null);

/** [name, zone, spawnOrPos, camYawDegrees] */
const SHOTS = [
  ['01-front-door', 'onett', { x: 33, z: -30, y: 5.8 }, 0],
  ['02-shelf-street', 'onett', { x: 44, z: -21.5, y: 5.8 }, 20],
  ['03-stairs-down', 'onett', { x: 57, z: -9, y: 5.8 }, 0],
  ['04-main-street', 'onett', { x: -20, z: 10.5, y: 2.8 }, 0],
  ['05-shops', 'onett', { x: -13, z: 5.5, y: 2.8 }, -25],
  ['06-civic-row', 'onett', { x: -12, z: 16.8, y: 2.8 }, 180],
  ['07-hotel', 'onett', { x: 43, z: 5.5, y: 2.8 }, 0],
  ['08-meteorite', 'onett', { x: 48, z: -60, y: 9.6 }, 0],
  ['09-south-road', 'onett', { x: -8, z: 50, y: 0 }, 0],
  ['10-drugstore-front', 'onett', { x: -46, z: 5.5, y: 2.8 }, 0],
  ['21-town-sign', 'onett', { x: 0.5, z: -40, y: 5.8 }, 0],
  ['22-west-stairs', 'onett', { x: -47, z: 30, y: 1.4 }, 0],
  ['23-hill-track', 'onett', { x: 26, z: -56, y: 7.7 }, 90],
  ['19-camera-occlusion', 'onett', { x: -46, z: 5.0, y: 2.8 }, 0],
  ['11-home-inside', 'nessHouse', 'front', 0],
  ['12-bedroom', 'nessBedroom', 'stairs', 0],
  ['13-drugstore-inside', 'drugstore', 'front', 0],
  ['14-arcade-inside', 'arcade', 'front', 0],
  ['15-hotel-inside', 'hotel', 'front', 0],
  ['16-hospital-inside', 'hospital', 'front', 0],
  ['17-neighbour-inside', 'neighborHouse', 'front', 0],
];

mkdirSync(OUT, { recursive: true });

// The sandbox ships a Chromium build that may not match this playwright
// revision, so point at it explicitly rather than downloading one.
const { existsSync } = await import('node:fs');
const LOCAL_CHROME = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });

// title screen, before anything is running
if (!ONLY || '00-title'.includes(ONLY)) {
  await page.waitForTimeout(500);
  writeFileSync(`${OUT}/00-title.png`, await page.screenshot());
  process.stdout.write('✓ 00-title\n');
}

await page.click('#start');
await page.waitForTimeout(1200);

for (const [name, zone, place, yawDeg] of SHOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  await page.evaluate(({ zone, place, yawDeg }) => {
    const g = window.__game;
    if (typeof place === 'string') {
      g.enterZone(zone, place);
    } else {
      if (g.game.zone?.name !== zone) g.enterZone(zone, 'start');
      const y = g.game.zone.ground.sample(place.x, place.z, place.y);
      g.player.pos.set(place.x, y === null ? place.y : y, place.z);
      g.player.syncTransform();
    }
    g.cam.desiredYaw = (yawDeg * Math.PI) / 180;
    g.cam.yaw = g.cam.desiredYaw;
    g.cam.first = true;
    g.game.doorCooldown = 999;   // don't get sucked through a door mid-shot
    g.game.transition = 0;
  }, { zone, place, yawDeg });
  await page.waitForTimeout(700);
  const buf = await page.screenshot();
  writeFileSync(`${OUT}/${name}.png`, buf);
  process.stdout.write(`✓ ${name}\n`);
}

// A conversation in progress, to check the text window.
if (!ONLY || '18-dialogue'.includes(ONLY)) {
  await page.evaluate(() => {
    const g = window.__game;
    g.enterZone('onett', 'start');
    const npc = g.game.zone.npcs.find((n) => n.kind === 'neighborKid') ?? g.game.zone.npcs[0];
    npc.pos.set(42.5, 5.8, -28.7);
    npc.syncTransform();
    g.player.pos.set(42.5, 5.8, -27.2);
    g.player.facePoint(npc.pos.x, npc.pos.z);
    g.player.yaw = g.player.targetYaw;
    g.player.model.rotation.y = g.player.yaw;
    g.player.syncTransform();
    g.game.doorCooldown = 999;
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1400);
  writeFileSync(`${OUT}/18-dialogue.png`, await page.screenshot());
  process.stdout.write('✓ 18-dialogue\n');
}

// The unsteady face, used by anything that isn't quite from around here.
if (!ONLY || '20-odd-font'.includes(ONLY)) {
  await page.evaluate(() => {
    const g = window.__game;
    g.enterZone('onett', 'start');
    g.player.pos.set(48, 9.6, -62.5);
    g.player.syncTransform();
    g.cam.desiredYaw = 0;
    g.cam.yaw = 0;
    g.cam.first = true;
    g.game.doorCooldown = 999;
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1600);
  writeFileSync(`${OUT}/20-odd-font.png`, await page.screenshot());
  process.stdout.write('✓ 20-odd-font\n');
}

await browser.close();

if (errors.length) {
  console.error('\n--- console errors ---');
  for (const e of [...new Set(errors)]) console.error(e);
  process.exit(1);
}
console.log('\nno console errors');
