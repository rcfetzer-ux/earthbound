/**
 * Aerial map shot.
 *
 * Lifts the game camera straight up over the town so the whole layout can be
 * compared against the reference map. It renders through the normal pipeline —
 * same low-resolution buffer, same dither and grade — just from much higher up,
 * with fog, clouds and shadows out of the way so nothing is hidden.
 *
 *   node tools/aerial.mjs [--url http://localhost:5173] [--out shots]
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
mkdirSync(OUT, { recursive: true });

/** [name, centreX, centreZ, altitude, fovDegrees] */
const VIEWS = [
  ['aerial-all', -20, -60, 470, 62],     // town and the valley out to the crater
  ['aerial-town', 0, 14, 210, 60],       // the street grid on its own
];

const { existsSync } = await import('node:fs');
const LOCAL_CHROME = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 820, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('#start');
await page.waitForTimeout(1400);

// Take the camera off its leash, clear everything that hides the ground, and
// give the offscreen buffer enough pixels to be worth looking at.
await page.evaluate(() => {
  const g = window.__game;
  g.cam.update = () => {};
  g.renderer.adapt = () => {};
  g.renderer.internalHeight = 900;
  g.renderer.maxInternalWidth = 900;
  g.renderer.resize();

  const zone = g.game.zone;
  zone.scene.fog = null;
  for (const c of zone.scene.children) {
    if (c.name === 'sky' || (c.isGroup && c.children[0]?.material?.map?.name === 'cloud')) {
      c.visible = false;
    }
  }
  // clouds sit in a bare group; find it by the billboards' geometry
  zone.scene.traverse((o) => {
    if (o.isMesh && o.material?.fog === false && o.renderOrder === -1) o.visible = false;
  });
  // A shadow map that only covers 60 units around the player is worse than
  // none at all from up here.
  if (zone.light) zone.light.sun.castShadow = false;
  // and the player should not be a speck in the middle of the map
  g.player.group.visible = false;
  for (const el of ['hud', 'hint', 'touch', 'dialogue']) {
    document.getElementById(el)?.classList.add('hidden');
  }
});
await page.waitForTimeout(400);

for (const [name, cx, cz, alt, fov] of VIEWS) {
  await page.evaluate(({ cx, cz, alt, fov }) => {
    const g = window.__game;
    const c = g.cam.camera;
    c.fov = fov;
    c.far = 4000;
    c.position.set(cx, alt, cz + 0.01);   // a hair off vertical so up stays north
    c.up.set(0, 0, -1);
    c.lookAt(cx, 0, cz);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }, { cx, cz, alt, fov });
  await page.waitForTimeout(900);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  process.stdout.write(`✓ ${name}\n`);
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('no page errors');
