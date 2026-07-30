/**
 * Time-of-day contact sheet.
 *
 * Shoots the same vantage points under every lighting preset, so the presets can
 * be compared against each other rather than judged one at a time.
 *
 *   node tools/times.mjs [--out shots/times] [--only 04]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const URL = arg('url', 'http://localhost:5173/');
const OUT = arg('out', 'shots/times');
const ONLY = arg('only', null);

const SPOTS = [
  ['04-main-street', { x: -20, z: 12, y: 0 }, 0],
  ['01-front-door', { x: -16, z: -36, y: 2.4 }, 0],
  ['05-shops', { x: 14, z: 8, y: 0 }, -25],
  ['08-meteorite', { x: 40, z: -50, y: 5.6 }, 0],
];
const TIMES = ['day', 'golden', 'dusk', 'night'];

mkdirSync(OUT, { recursive: true });
const LOCAL = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(LOCAL) ? LOCAL : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('#start');
await page.waitForTimeout(1200);

for (const [name, place, yaw] of SPOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  for (const t of TIMES) {
    await page.evaluate(({ place, yaw, t }) => {
      const g = window.__game;
      g.setTime(t);
      const y = g.game.zone.ground.sample(place.x, place.z, place.y);
      g.player.pos.set(place.x, y === null ? place.y : y, place.z);
      g.player.syncTransform();
      g.cam.desiredYaw = (yaw * Math.PI) / 180;
      g.cam.yaw = g.cam.desiredYaw;
      g.cam.first = true;
      g.game.doorCooldown = 999;
    }, { place, yaw, t });
    await page.waitForTimeout(600);
    writeFileSync(`${OUT}/${name}-${t}.png`, await page.screenshot());
  }
  process.stdout.write(`✓ ${name} × ${TIMES.length}\n`);
}
// Compose a 2x2 contact sheet per vantage point, so the presets can be compared
// in one glance. Done in the page to avoid pulling in an image library.
for (const [name] of SPOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  const shots = TIMES.map((t) => `${name}-${t}.png`);
  const b64 = shots.map((f) => readFileSync(`${OUT}/${f}`).toString('base64'));
  const sheet = await page.evaluate(async ({ b64, labels }) => {
    const imgs = await Promise.all(b64.map((d) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = `data:image/png;base64,${d}`;
    })));
    const w = imgs[0].width;
    const h = imgs[0].height;
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const cx = c.getContext('2d');
    imgs.forEach((im, i) => {
      const x = (i % 2) * w;
      const y = Math.floor(i / 2) * h;
      cx.drawImage(im, x, y);
      cx.fillStyle = 'rgba(10,8,18,0.8)';
      cx.fillRect(x + 8, y + h - 34, 120, 26);
      cx.fillStyle = '#f0c440';
      cx.font = 'bold 15px monospace';
      cx.fillText(labels[i].toUpperCase(), x + 16, y + h - 15);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { b64, labels: TIMES });
  writeFileSync(`${OUT}/${name}-SHEET.png`, Buffer.from(sheet, 'base64'));
  process.stdout.write(`✓ ${name}-SHEET\n`);
}

await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('no page errors');
