/**
 * Character contact sheet.
 *
 * Lines the whole cast up in front of the camera and photographs them, so the
 * models can be judged against each other rather than spotted at a distance in
 * a street scene.
 *
 *   node tools/cast.mjs [--out shots]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('out', 'shots');
mkdirSync(OUT, { recursive: true });
const LOCAL = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(LOCAL) ? LOCAL : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(arg('url', 'http://localhost:5173/'), { waitUntil: 'networkidle' });
await page.click('#start');
await page.waitForTimeout(1200);

for (const [name, walking, yaw] of [['cast-idle', false, 0], ['cast-walk', true, 0], ['cast-back', false, 180]]) {
  await page.evaluate(({ walking, yaw }) => {
    const g = window.__game;
    const z = g.game.zone;
    // clear a patch of road and line everyone up across it
    const spot = { x: 0, z: 30 };
    g.player.pos.set(spot.x - 9, 0, spot.z);
    g.player.syncTransform();
    z.npcs.forEach((n, i) => {
      n.wanderRadius = 0;
      n.target = null;
      n.pos.set(spot.x - 7.4 + i * 1.15, 0, spot.z);
      n.yaw = (yaw * Math.PI) / 180;
      n.targetYaw = n.yaw;
      n.model.rotation.y = n.yaw;
      n.syncTransform();
      if (walking) {
        n.phase = 1.1 + i * 0.5;
        n.moving = true;
        n.animate(0.0001, 0.016, i * 0.4);
        n.frozen = true;
      } else {
        n.frozen = false;
      }
    });
    g.player.yaw = (yaw * Math.PI) / 180;
    g.player.targetYaw = g.player.yaw;
    if (walking) {
      g.player.phase = 1.6;
      g.player.moving = true;
      g.player.animate(0.0001, 0.016, 0);
      g.player.frozen = true;
    } else {
      g.player.frozen = false;
    }
    g.cam.desiredYaw = 0;
    g.cam.yaw = 0;
    g.cam.distance = 15;
    g.cam.pitch = 0.28;
    g.cam.height = 1.1;
    g.cam.first = true;
    g.game.doorCooldown = 999;
  }, { walking, yaw });
  await page.waitForTimeout(500);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  process.stdout.write(`✓ ${name}\n`);
}
await browser.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
