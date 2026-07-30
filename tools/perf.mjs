/**
 * Render-cost probe.
 *
 * Reports scene complexity and frames-per-second for the town, then re-measures
 * with shadows off and at a lower internal resolution — enough to tell whether a
 * slowdown is geometry, the shadow pass, or plain fill rate.
 *
 * Note: this sandbox has no GPU, so absolute numbers come from a software
 * rasteriser and are far below what real hardware does. The *ratios* are the
 * useful part.
 *
 *   node tools/perf.mjs
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const LOCAL_CHROME = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('#start');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const g = window.__game;
  const r = g.renderer.renderer;
  let meshes = 0, casters = 0, tris = 0;
  g.game.zone.scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      if (o.castShadow) casters++;
      const p = o.geometry?.attributes?.position;
      if (p) tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
    }
  });
  return {
    sceneMeshes: meshes, casters, sceneTris: Math.round(tris),
    calls: r.info.render.calls, drawnTris: r.info.render.triangles,
    programs: r.info.programs.length, textures: r.info.memory.textures,
    geometries: r.info.memory.geometries,
    low: [g.renderer.lowW, g.renderer.lowH],
  };
});
console.log(JSON.stringify(info, null, 2));
// baseline first, then variations
for (const mode of ['baseline','noshadow','noshadow+lowres']) {
  await page.evaluate((mode) => {
    const g = window.__game;
    if (mode.includes('noshadow')) {
      g.renderer.renderer.shadowMap.enabled = false;
      g.game.zone.scene.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
    if (mode.includes('lowres')) { g.renderer.internalHeight = 200; g.renderer.resize(); }
  }, mode);
  const fps = await page.evaluate(() => new Promise((res) => {
    let f = 0; const t0 = performance.now();
    const tick = () => { f++; if (performance.now()-t0 > 2000) res(Math.round(f*1000/(performance.now()-t0))); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  console.log(mode, fps, 'fps');
}
await browser.close();
