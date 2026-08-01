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
  ['01-front-door', 'onett', { x: 48.6, z: -62, y: 0 }, 90],
  ['02-lane', 'onett', { x: 56, z: -52, y: 0 }, 0],
  ['03-top-street', 'onett', { x: -30, z: -28, y: 0 }, 0],
  ['04-main-street', 'onett', { x: -28, z: 12, y: 0 }, 0],
  ['05-shops', 'onett', { x: -26, z: 18.6, y: 0 }, 180],
  ['06-city-hall', 'onett', { x: -28, z: 9, y: 0 }, 0],
  ['07-downtown', 'onett', { x: 28, z: 9, y: 0 }, 0],
  ['08-meteorite', 'onett', { x: -46, z: -164, y: 13 }, 0],
  ['09-south-road', 'onett', { x: 0, z: 74, y: 0 }, 0],
  ['10-drugstore-front', 'onett', { x: -40, z: 17.6, y: 0 }, 180],
  ['19-camera-occlusion', 'onett', { x: -40, z: 19, y: 0 }, 180],
  ['21-junction', 'onett', { x: 0, z: 12, y: 0 }, 45],
  ['22-arcade-front', 'onett', { x: 18, z: 17.6, y: 0 }, 180],
  ['23-hospital', 'onett', { x: -64, z: 12, y: 0 }, -90],
  ['25-valley-mouth', 'onett', { x: -30, z: -92, y: 1 }, 0],
  ['26-valley-mid', 'onett', { x: -20, z: -125, y: 8 }, 0],
  ['27-valley-bend', 'onett', { x: -40, z: -150, y: 12 }, 0],
  ['28-north-cordon', 'onett', { x: -30, z: -40, y: 0 }, 0],
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
    npc.pos.set(48.6, 0, -58);
    npc.syncTransform();
    g.player.pos.set(48.6, 0, -56.5);
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
    g.player.pos.set(-46, 13, -163);
    g.player.pos.y = g.game.zone.ground.sample(-46, -163, 13) ?? 13;
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
