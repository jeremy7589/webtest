// Headless QA: load the built app, capture console errors, run interactions, take screenshots.
const { chromium } = require('/opt/node-tools/node_modules/playwright')
const fs = require('fs')
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-webtest/0fe178d8-f3ae-5692-a8bd-1c5535c01f41/scratchpad/shots'
const URL = process.argv[3] || 'http://127.0.0.1:8787/dist/index.html'
const STEPS = (process.argv[4] || 'overview,top,slice,probe,explode,thick,fence,layer10').split(',')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const logs = []
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push(`[${t}] ${m.text()}`) })
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`))
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 })
  try { await page.waitForFunction(() => !document.querySelector('#loader') || document.querySelector('#loader').classList.contains('done'), null, { timeout: 180000 }) } catch (e) { logs.push('[timeout] loader did not finish') }
  logs.push(`[info] loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await page.waitForTimeout(3500)
  try { await page.waitForFunction(() => window.app && app.model.lodId === 'lod1k' && !app._hiresLoading, null, { timeout: 240000 }) } catch (e) { logs.push('[warn] hires not finished') }
  page.setDefaultTimeout(120000)
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 }); logs.push(`[shot] ${name}`) }
  const run = async (fn) => page.evaluate(fn)
  for (const s of STEPS) {
    try {
      if (s === 'first') { await shot('00-first-view') }
      if (s === 'overview') { await run(() => app.preset('overview', false)); await shot('01-overview') }
      if (s === 'top') { await run(() => { app.setContour(2); app.preset('top', false) }); await shot('02-top-contours'); await run(() => app.setContour(0)) }
      if (s === 'slice') { await run(() => { app.cutPreset('ew-trough'); app.preset('trough-cut', false) }); await shot('03-slice-trough') }
      if (s === 'probe') { await run(() => { app._setCut('off'); app.preset('overview', false); app.setProbe(true); app.probe.probeXY(760000, 7050000) }); await shot('04-probe') }
      if (s === 'explode') { await run(() => { app.probe.clear(); app.setProbe(false); app.setExplode(45); app.preset('explode', false) }); await shot('05-explode'); await run(() => app.setExplode(0)) }
      if (s === 'thick') { await run(() => { app.setMode(2); app.preset('overview', false) }); await shot('06-thickness'); await run(() => app.setMode(0)) }
      if (s === 'fence') { await run(() => { app._setCut('fence'); app.section.setFencePoints([{ x: -180, y: -200 }, { x: 0, y: -40 }, { x: 160, y: 120 }]); app.setGhost(true); app.preset('overview', false) }); await shot('07-fence'); await run(() => { app.setGhost(false); app._setCut('off') }) }
      if (s === 'layer10') { await run(() => { app.model.solo(10); app.flyToLayer(10) }); await page.waitForTimeout(1500); await shot('08-walloon'); await run(() => app.model.setAllVisible(true)) }
      if (s === 'slab') { await run(() => { app.section.azimuth = 0; app.section.offset = 20; app.section.width = 60; app._setCut('slab'); app.preset('overview', false) }); await shot('09-slab'); await run(() => app._setCut('off')) }
      if (s === 'ui') { await run(() => app._showTab('view')); await shot('10-ui-view'); await run(() => app._showTab('cut')); await shot('11-ui-cut') }
      if (s === 'hydro') { await run(() => { app.setMode('hydro'); app.preset('overview', false) }); await shot('13-hydro'); await run(() => app.setMode('age')); await shot('14-age'); await run(() => app.setMode('formation')) }
      if (s === 'tour') { await run(() => app.tour.start()); await shot('12-tour') }
    } catch (e) { logs.push(`[step ${s}] ${e.message}`) }
  }
  try { const stats = await run(() => ({ lod: app.model.lodId, layers: [...app.model.layers.values()].map(L => L.counts && L.counts.tris), mem: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null })); logs.push(`[stats] ${JSON.stringify(stats)}`) } catch (e) { logs.push(`[stats] ${e.message}`) }
  try { logs.push('[status] ' + await page.evaluate(() => (document.querySelector('#loader-status') || {}).textContent)) } catch (e) {}
  fs.writeFileSync(`${OUT}/log.txt`, logs.join('\n'))
  console.log(logs.join('\n'))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
