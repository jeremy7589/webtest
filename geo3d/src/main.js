import './style.css'
import * as THREE from 'three'
import { DATA_BASE } from './config.js'
import { Viewer } from './scene/viewer.js'
import { GeoModel, MODE } from './scene/model.js'
import { SectionTool } from './scene/section.js'
import { ProbeTool } from './scene/probe.js'
import { ContextLayer, toMga, toLonLat } from './scene/context.js'
import { LayerPanel } from './ui/layerPanel.js'
import { Section2D } from './ui/section2d.js'
import { Hud } from './ui/hud.js'
import { Tour } from './ui/tour.js'
import { FORMATIONS, byK } from './data/formations.js'
import { rampTexture } from './scene/material.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 860
const CONTOURS = [0, 50, 100, 200, 500, 1000]
const fmt = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–'

class App {
  constructor(manifest) {
    this.manifest = manifest
    this.viewer = new Viewer($('#view'), { shadows: !isMobile, ao: true, maxDpr: isMobile ? 1.5 : 2, shadowMapSize: isMobile ? 2048 : 4096 })
    this.model = new GeoModel(manifest, DATA_BASE)
    this.viewer.scene.add(this.model.root)
    this.section = new SectionTool(this.model, this.viewer)
    this.probe = new ProbeTool(this.model, this.viewer)
    this.context = new ContextLayer(this.model, this.viewer, DATA_BASE)
    this.hud = new Hud(this.viewer, { compass: $('#compass'), scaleBar: $('#scalebar .bar'), scaleLabel: $('#scale-label'), readout: $('#readout') })
    this.section2d = new Section2D($('#section2d'), $('#s2d-canvas'), (hit, pos) => this._onSectionHover(hit, pos))
    this.section2d.visibleK = (k) => this.model.layers.get(k).visible
    this.panel = new LayerPanel({ listEl: $('#layer-list'), legendEl: $('#legend'), model: this.model, viewer: this.viewer, onFly: (k) => this.flyToLayer(k) })
    this.tour = new Tour(this, { root: $('#tour'), step: $('#tour-step'), title: $('#tour-title'), text: $('#tour-text'), next: $('#tour-next'), prev: $('#tour-prev'), skip: $('#tour-skip') })
    this.mode = MODE.LAYER; this.contourIdx = 0; this.fenceDrawing = false; this.ghost = false
    this.state = { exag: 12, explode: 0 }
    this._wireUI(); this._wireHover(); this._wireKeys()
    this.model.addEventListener('change', () => { this.viewer.requestRender(); this._syncUrlSoon() })
    this.section.addEventListener('change', () => this._onSectionChange())
    this.viewer.controls.addEventListener('rest', () => this._syncUrlSoon())
    this.viewer.addEventListener('beforerender', () => { if (this.section.handle.visible) this.section.refreshHandle() })
  }

  // ---------------------------------------------------------------- loading
  async load() {
    const bar = $('#progress-bar'), status = $('#loader-status'), strata = $('#loader-strata')
    strata.innerHTML = FORMATIONS.map(f => `<div data-k="${f.k}" style="background:${f.color}"></div>`).join('')
    const lodId = 'lod2k'
    const lod = await this.model.load(lodId, (rec, tot) => { const p = tot ? rec / tot : 0; bar.style.width = `${(p * 45).toFixed(1)}%`; status.textContent = `Downloading 2 km model… ${(rec / 1e6).toFixed(1)} MB` })
    status.textContent = 'Building formations…'
    this.model.explodeGap = 140; this.model.applyExplode()
    await this.model.build(lod, (k, n, total) => { bar.style.width = `${(45 + 50 * n / total).toFixed(1)}%`; status.textContent = `Built ${byK[k].name}`; strata.querySelector(`[data-k="${k}"]`).classList.add('on') })
    this._applyUrlState()
    bar.style.width = '100%'; status.textContent = 'Ready'
    this.context.load().catch(e => console.warn('context failed', e))
    this._intro()
    $('#loader').classList.add('done')
    setTimeout(() => $('#loader').remove(), 900)
    if (!isMobile && $('#tg-hires').checked) this._loadHires()
  }

  async _loadHires() {
    if (this._hiresLoading || this.model.lodId === 'lod1k') return
    this._hiresLoading = true
    try {
      const lod = await this.model.load('lod1k', (rec, tot) => this.hud.setReadout(`Loading 1 km detail… ${(100 * rec / (tot || 1)).toFixed(0)}%`))
      this.hud.setReadout('Building 1 km detail…')
      await this.model.build(lod)
      if (this.section.mode !== 'off') this.section.mode === 'fence' ? this.section.updateFence() : this.section.update()
      if (this.probe.column) this.probe.probeXY(this.probe.column.x, this.probe.column.y)
      this.hud.setReadout('')
      this.viewer.requestRender(); this._updateStats()
    } catch (e) { console.warn('hires failed', e); this.hud.setReadout('') }
    this._hiresLoading = false
  }

  _intro() {
    const box = this._modelBox()
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
    if (!this._urlHadCamera) {
      // cinematic descent: start high above in plan view, glide down to the overview while the layers assemble
      const ctl = this.viewer.controls, prevSmooth = ctl.smoothTime
      ctl.setLookAt(c.x + 1, c.y - s.y * 0.6, s.y * 3.2, c.x, c.y, c.z, false)
      ctl.smoothTime = 0.9
      this.preset('overview').then(() => { ctl.smoothTime = prevSmooth })
      setTimeout(() => { ctl.smoothTime = prevSmooth }, 4000)
    }
    // layers assemble from an exploded state (skipped for reduced-motion users)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.model.setExplode(this.state.explode); this._updateStats(); return }
    const start = performance.now(), dur = 2400, from = this.model.explodeGap, to = this.state.explode
    this.viewer.holdAnimation(true)
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur); const e = 1 - Math.pow(1 - t, 3)
      this.model.setExplode(from + (to - from) * e)
      if (t < 1) requestAnimationFrame(tick); else { this.viewer.holdAnimation(false); this._updateStats() }
    }
    requestAnimationFrame(tick)
  }

  /** Box of the unexploded model in world units (camera presets aim here; explode is handled by the explode preset). */
  _modelBox() {
    const ex = this.manifest.extent, cx = this.model.cx, cy = this.model.cy, zr = this.manifest.zRange, e = this.model.exag
    return new THREE.Box3(new THREE.Vector3((ex[0] - cx) / 1000, (ex[1] - cy) / 1000, zr[0] / 1000 * e), new THREE.Vector3((ex[2] - cx) / 1000, (ex[3] - cy) / 1000, zr[1] / 1000 * e))
  }

  // ---------------------------------------------------------------- state API (used by UI and tour)
  reset() {
    this.tourResetting = true
    this.model.setAllVisible(true); for (const L of this.model.layers.values()) if (L.opacity !== 1) this.model.setOpacity(L.k, 1)
    this.setMode('formation'); this.setContour(0); this.setExplode(0); this.setExaggeration(12)
    this.section.setMode('off'); $$('#cut-seg button').forEach(b => b.classList.toggle('active', b.dataset.cut === 'off')); this._cutControls('off')
    this.probe.clear(); this.setProbe(false); this.setGhost(false); if (this.xray) this.setXray(false)
    this.tourResetting = false
  }
  setExaggeration(e) { this.state.exag = e; this.model.setExaggeration(e); $('#exag').value = e; $('#exag-val').textContent = `${e}×`; $('#exag-badge').textContent = `${e}× vertical`; this.viewer.requestRender() }
  setExplode(km) { this.state.explode = km; this.model.setExplode(km); $('#explode').value = km; $('#explode-val').textContent = `${km} km`; this.viewer.requestRender() }
  /** mode: 'formation' | 'age' | 'hydro' (palettes) or MODE.ELEV / MODE.THICK (data ramps). */
  setMode(mode, range) {
    if (mode === 0 || mode === '0') mode = 'formation'
    const isPalette = typeof mode === 'string' && isNaN(Number(mode))
    if (!isPalette) mode = Number(mode)
    this.mode = mode
    const m = isPalette ? MODE.LAYER : mode
    if (isPalette) this.model.setPalette(mode)
    const r = range || (m === MODE.ELEV ? [this.manifest.zRange[0], this.manifest.zRange[1]] : m === MODE.THICK ? [0, 800] : [0, 1])
    const ramp = m === MODE.THICK ? 'thick' : 'batlow'
    this.model.setRamp(rampTexture(ramp)); this.model.setMode(m, r)
    this.panel.setMode(m, r, ramp)
    $$('#mode-seg button').forEach(b => b.classList.toggle('active', String(b.dataset.mode) === String(mode)))
    this.viewer.requestRender()
  }
  setContour(idx) { this.contourIdx = idx; const m = CONTOURS[idx]; this.model.setContour(m); $('#contour').value = idx; $('#contour-val').textContent = m ? `${m} m` : 'off'; this.viewer.requestRender() }
  setProbe(on) { this.probe.setEnabled(on); $('#tg-probe').checked = on; if (on) this._showTab('probe') }
  setGhost(on) { this.ghost = on; for (const L of this.model.layers.values()) this.model.setOpacity(L.k, on ? 0.18 : 1); $('#fence-ghost').classList.toggle('active', on); this.viewer.requestRender() }
  /** X-ray: every formation translucent so the stack can be read through; hovering restores one. */
  setXray(on) { this.xray = on; for (const L of this.model.layers.values()) this.model.setOpacity(L.k, on ? 0.22 : 1); $('#tg-xray').checked = on; this.viewer.requestRender() }

  preset(name, transition = true) {
    const box = this._modelBox(); const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
    const ctl = this.viewer.controls
    const look = (px, py, pz, tx = c.x, ty = c.y, tz = c.z) => ctl.setLookAt(px, py, pz, tx, ty, tz, transition)
    switch (name) {
      case 'overview': return look(c.x + s.x * 0.25, c.y - s.y * 1.05, s.y * 0.75)
      case 'north': return look(c.x, c.y + s.y * 1.1, s.y * 0.7)
      case 'south': return look(c.x, c.y - s.y * 1.1, s.y * 0.7)
      case 'top': return look(c.x, c.y - 0.001, s.y * 1.25)
      case 'explode': {
        const wb = this.model.worldBox(); const wc = wb.getCenter(new THREE.Vector3()), ws = wb.getSize(new THREE.Vector3())
        const d = Math.max(ws.x, ws.y, ws.z) * 1.15
        return look(wc.x + d * 0.5, wc.y - d * 0.9, wc.z + d * 0.25, wc.x, wc.y, wc.z)
      }
      case 'trough': { const [x, y] = [771000, 7120500]; const tx = (x - this.model.cx) / 1000, ty = (y - this.model.cy) / 1000; return look(tx + 120, ty - 260, 150, tx, ty, -3 * this.model.exag) }
      case 'trough-cut': { const [x, y] = [771000, 7120500]; const tx = (x - this.model.cx) / 1000, ty = (y - this.model.cy) / 1000; return look(tx + 60, ty - 330, 120, tx, ty, -3.5 * this.model.exag) }
      case 'condamine': { const [x, y] = toMga(151.26, -27.18); const tx = (x - this.model.cx) / 1000, ty = (y - this.model.cy) / 1000; return look(tx + 40, ty - 140, 90, tx, ty, 0.3 * this.model.exag) }
    }
  }
  flyToLayer(k, from = 'southeast') {
    const box = this.model.layerWorldBox(k); if (!box) return
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
    const d = Math.max(s.x, s.y) * 1.15
    const dir = from === 'southeast' ? [0.6, -0.8] : [0.2, -1]
    this.viewer.controls.setLookAt(c.x + dir[0] * d, c.y + dir[1] * d, c.z + d * 0.7, c.x, c.y, c.z, true)
  }
  cutPreset(name) {
    const sec = this.section
    const offsetFor = (az, x, y) => { const a = az * Math.PI / 180; const nx = Math.cos(a), ny = -Math.sin(a); return nx * (x - this.model.cx) / 1000 + ny * (y - this.model.cy) / 1000 }
    if (name === 'ew-trough') { sec.azimuth = 90; sec.offset = offsetFor(90, 771000, 7120500) }
    else if (name === 'ns-condamine') { const [x, y] = toMga(151.26, -27.18); sec.azimuth = 0; sec.offset = offsetFor(0, x, y) }
    else if (name === 'nw-se') { sec.azimuth = 135; sec.offset = 0 }
    this._setCut('slice')
  }

  // ---------------------------------------------------------------- UI wiring
  _wireUI() {
    // tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => this._showTab(t.dataset.tab)))
    $('#panel-collapse').addEventListener('click', () => this._togglePanel(false))
    $('#panel-open').addEventListener('click', () => this._togglePanel(true))
    // layers
    $('#layers-all').addEventListener('click', () => this.model.setAllVisible(true))
    $('#layers-none').addEventListener('click', () => this.model.setAllVisible(false))
    $('#layers-surat').addEventListener('click', () => { for (const L of this.model.layers.values()) this.model.setVisible(L.k, L.k <= 16) })
    $('#layers-bowen').addEventListener('click', () => { for (const L of this.model.layers.values()) this.model.setVisible(L.k, L.k >= 17) })
    // view
    $('#exag').addEventListener('input', (e) => this.setExaggeration(Number(e.target.value)))
    $('#explode').addEventListener('input', (e) => this.setExplode(Number(e.target.value)))
    $$('#mode-seg button').forEach(b => b.addEventListener('click', () => this.setMode(b.dataset.mode)))
    $('#contour').addEventListener('input', (e) => this.setContour(Number(e.target.value)))
    $('#tg-terrain').addEventListener('change', (e) => this.context.setTerrainVisible(e.target.checked))
    $('#tg-towns').addEventListener('change', (e) => this.context.setTownsVisible(e.target.checked))
    $('#tg-grid').addEventListener('change', (e) => this.context.setGridVisible(e.target.checked))
    $('#tg-faults').addEventListener('change', (e) => this._setFaults(e.target.checked))
    $('#tg-xray').addEventListener('change', (e) => this.setXray(e.target.checked))
    $$('#basemap-seg button').forEach(b => b.addEventListener('click', () => { $$('#basemap-seg button').forEach(x => x.classList.toggle('active', x === b)); this.context.setBasemap(b.dataset.bm) }))
    $('#tg-ao').addEventListener('change', (e) => this.viewer.setAO(e.target.checked))
    $('#tg-shadows').addEventListener('change', (e) => this.viewer.setShadows(e.target.checked))
    $('#tg-shadows').checked = !isMobile
    $('#tg-hires').addEventListener('change', (e) => { if (e.target.checked) this._loadHires() })
    $$('#presets .chip').forEach(b => b.addEventListener('click', () => this.preset(b.dataset.preset)))
    // cut
    $$('#cut-seg button').forEach(b => b.addEventListener('click', () => this._setCut(b.dataset.cut)))
    $('#azimuth').addEventListener('input', (e) => { this.section.setAzimuth(Number(e.target.value)); this._azLabel() })
    $('#offset').addEventListener('input', (e) => this.section.setOffset(Number(e.target.value)))
    $('#width').addEventListener('input', (e) => { this.section.setWidth(Number(e.target.value)); $('#width-val').textContent = `${e.target.value} km` })
    $('#fence-clear').addEventListener('click', () => { this.section.clearFence(); this.fenceDrawing = true })
    $('#fence-ghost').addEventListener('click', () => this.setGhost(!this.ghost))
    $$('#cut-presets .chip').forEach(b => b.addEventListener('click', () => this.cutPreset(b.dataset.cutpreset)))
    $('#s2d-close').addEventListener('click', () => this._setCut('off'))
    // probe
    $('#tg-probe').addEventListener('change', (e) => this.setProbe(e.target.checked))
    $('#probe-clear').addEventListener('click', () => this.probe.clear())
    $('#probe-copy').addEventListener('click', () => this._copyProbe())
    this.probe.addEventListener('probe', (e) => this._renderProbe(e.column))
    this.probe.addEventListener('cleared', () => { $('#probe-out').innerHTML = '<div class="probe-empty">No probe yet.</div>'; $('#probe-copy').disabled = true })
    // top bar
    $('#btn-tour').addEventListener('click', () => this.tour.active ? this.tour.stop() : this.tour.start())
    $('#btn-share').addEventListener('click', () => this._share())
    $('#btn-shot').addEventListener('click', () => this._screenshot())
    $('#btn-full').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
    $('#btn-help').addEventListener('click', () => { $('#help').hidden = false; this._updateStats() })
    $('#help-close').addEventListener('click', () => $('#help').hidden = true)
    $('#help').addEventListener('click', (e) => { if (e.target === $('#help')) $('#help').hidden = true })
    // fence drawing via clicks on the model
    const canvas = this.viewer.canvas; let down = null
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() } })
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null
      if (moved > 6 || dt > 600 || this.section.mode !== 'fence' || !this.fenceDrawing) return
      const p = this._rayToModel(e.clientX, e.clientY); if (!p) return
      this.section.addFencePoint({ x: p.x, y: p.y })
    })
    canvas.addEventListener('dblclick', () => { if (this.section.mode === 'fence') this.fenceDrawing = false })
    if (isMobile) this._togglePanel(false)
  }
  _showTab(name) { $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name)); $$('.tabpane').forEach(p => p.classList.toggle('active', p.dataset.pane === name)); this._togglePanel(true) }
  _togglePanel(open) { $('#panel').classList.toggle('collapsed', !open); $('#panel-open').hidden = open }
  _azLabel() { const a = this.section.azimuth; const names = { 0: 'N–S', 45: 'NE–SW', 90: 'E–W', 135: 'NW–SE' }; const near = Object.keys(names).map(Number).find(x => Math.abs(x - a) < 3); $('#az-val').textContent = near !== undefined ? names[near] : `${a}°` }
  _cutControls(mode) { $('#cut-plane-ctls').hidden = !(mode === 'slice' || mode === 'slab'); $('#width-ctl').hidden = mode !== 'slab'; $('#cut-fence-ctls').hidden = mode !== 'fence' }
  _setCut(mode) {
    $$('#cut-seg button').forEach(b => b.classList.toggle('active', b.dataset.cut === mode))
    this._cutControls(mode)
    const [lo, hi] = this.section.offsetRange(); $('#offset').min = lo.toFixed(0); $('#offset').max = hi.toFixed(0)
    $('#azimuth').value = this.section.azimuth; $('#offset').value = this.section.offset; $('#width').value = this.section.width; this._azLabel()
    this.fenceDrawing = mode === 'fence'
    if (mode !== 'fence' && this.ghost) this.setGhost(false)
    this.section.setMode(mode)
    if (mode !== 'off') this._showTab('cut')
  }
  _onSectionChange() {
    const p = this.section.profile
    const title = this.section.mode === 'fence' ? 'Fence diagram' : `${this.section.mode === 'slab' ? 'Slab' : 'Slice'} · ${$('#az-val').textContent} · ${fmt(this.section.offset, 1)} km`
    const show = !!(p && p.segments.length)
    this.section2d.setProfile(show ? p : null, title)
    document.body.classList.toggle('has-section', show)
    $('#offset').value = this.section.offset; $('#off-val').textContent = `${fmt(this.section.offset, 1)} km`
    this.viewer.requestRender(); this._syncUrlSoon()
  }
  _onSectionHover(hit, pos) {
    for (const L of this.model.layers.values()) this.model.setHighlight(L.k, !!hit && hit.k === L.k)
    this.viewer.requestRender()
    $('#s2d-hint').textContent = hit ? `${byK[hit.k].name}: top ${fmt(hit.zt * 1000)} m, base ${fmt(hit.zb * 1000)} m, thickness ${fmt((hit.zt - hit.zb) * 1000)} m at ${fmt(hit.s, 1)} km` : (pos ? `${fmt(pos.s, 1)} km, ${fmt(pos.z * 1000)} m AHD` : 'Hover for formation and depth')
  }
  _rayToModel(clientX, clientY) {
    const r = this.viewer.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.viewer.camera); ray.firstHitOnly = true
    const hit = this.model.pick(ray)
    if (hit) return hit.point
    // fall back to the ground plane
    const p = new THREE.Vector3(); if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) return p
    return null
  }
  _setFaults(on) {
    if (!this.faultGroup) {
      this.faultGroup = new THREE.Group(); this.faultGroup.name = 'faults'
      const lod = this.model.lod, g = this.model.grid
      // faulted cells (corner discrepancies > 10 m in the source grid) drawn as red patches on each layer top
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide })
      for (const L of lod.layers) {
        if (!L.fault) continue
        const pos = [], idx = []
        for (let j = 0; j < g.nyc; j++) for (let i = 0; i < g.nxc; i++) {
          if (!L.fault[j * g.nxc + i]) continue
          const n = j * g.nxn + i, corners = [n, n + 1, n + g.nxn + 1, n + g.nxn]
          if (corners.some(c => !Number.isFinite(L.top[c]))) continue
          const base = pos.length / 3
          for (const c of corners) pos.push(g.X[c], g.Y[c], L.top[c] / 1000 + 0.002)
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
        if (!pos.length) continue
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); geo.setIndex(idx); geo.computeBoundingSphere()
        const mesh = new THREE.Mesh(geo, mat); mesh.name = `fault-${L.k}`; mesh.userData.fault = true; mesh.renderOrder = 3
        this.model.layers.get(L.k).group.add(mesh)
      }
    }
    this.model.root.traverse(o => { if (o.userData.fault) o.visible = on })
    this.viewer.requestRender()
  }

  // ---------------------------------------------------------------- hover
  _wireHover() {
    const chip = $('#hover-chip'); let last = 0, hoverK = null
    const canvas = this.viewer.canvas
    canvas.addEventListener('pointermove', (e) => {
      if (isMobile) return
      const now = performance.now(); if (now - last < 40) return; last = now
      if (e.buttons) { chip.hidden = true; return }
      const r = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.viewer.camera); ray.firstHitOnly = true
      const hit = this.model.pick(ray)
      if (hoverK !== null && (!hit || hit.k !== hoverK)) { this.model.setHighlight(hoverK, false); hoverK = null; this.viewer.requestRender() }
      if (!hit) { chip.hidden = true; return }
      if (hoverK !== hit.k) { hoverK = hit.k; this.model.setHighlight(hit.k, true); this.viewer.requestRender() }
      const f = byK[hit.k]
      const localZ = (hit.point.z / this.model.exag - this.model.explodeOffsetKm(hit.k)) * 1000
      const x = hit.point.x * 1000 + this.model.cx, y = hit.point.y * 1000 + this.model.cy
      const col = this.model.grid.column(x, y)
      const depth = col && Number.isFinite(col.ground) ? col.ground - localZ : NaN
      const Lc = col && col.layers.find(l => l.k === hit.k)
      chip.innerHTML = `<i style="background:${this.model.layerColor(hit.k)}"></i><span>${f.k} · ${f.name}</span><small>${fmt(localZ)} m AHD${Number.isFinite(depth) && depth > 1 ? ` · ${fmt(depth)} m deep` : ''}${Lc && Lc.active ? ` · ${fmt(Lc.thick)} m thick` : ''}</small>`
      chip.style.left = `${e.clientX}px`; chip.style.top = `${e.clientY}px`; chip.hidden = false
      const [lon, lat] = toLonLat(x, y)
      this.hud.setReadout(`E ${fmt(x)}  N ${fmt(y)}\n${lat.toFixed(4)}°, ${lon.toFixed(4)}°`)
    })
    canvas.addEventListener('pointerleave', () => { chip.hidden = true; if (hoverK !== null) { this.model.setHighlight(hoverK, false); hoverK = null; this.viewer.requestRender() } })
  }

  // ---------------------------------------------------------------- keys
  _wireKeys() {
    addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return
      const k = e.key.toLowerCase()
      const presets = ['overview', 'north', 'south', 'top', 'trough', 'condamine']
      if (/^[1-6]$/.test(k)) this.preset(presets[Number(k) - 1])
      else if (k === 's') this._setCut(this.section.mode === 'slice' ? 'off' : 'slice')
      else if (k === 'b') this._setCut(this.section.mode === 'slab' ? 'off' : 'slab')
      else if (k === 'f' && !e.metaKey && !e.ctrlKey) this._setCut(this.section.mode === 'fence' ? 'off' : 'fence')
      else if (k === 'p') this.setProbe(!this.probe.enabled)
      else if (k === 'e') this.setExplode(this.state.explode > 0 ? 0 : 40)
      else if (k === '[') this.setExaggeration(Math.max(1, this.state.exag - 1))
      else if (k === ']') this.setExaggeration(Math.min(40, this.state.exag + 1))
      else if (k === 'arrowleft' || k === 'arrowright') { if (this.section.mode === 'slice' || this.section.mode === 'slab') { const [lo, hi] = this.section.offsetRange(); this.section.setOffset(Math.min(hi, Math.max(lo, this.section.offset + (k === 'arrowright' ? 5 : -5)))) } }
      else if (k === 'h') this._togglePanel($('#panel').classList.contains('collapsed'))
      else if (k === 't') this.tour.active ? this.tour.stop() : this.tour.start()
      else if (k === '?') $('#help').hidden = !$('#help').hidden
      else if (k === 'escape') { $('#help').hidden = true; if (this.section.mode === 'fence') this.section.clearFence(); if (this.tour.active) this.tour.stop() }
      else if (k === 'enter') { if (this.section.mode === 'fence') this.fenceDrawing = false }
      else return
      e.preventDefault()
    })
  }

  // ---------------------------------------------------------------- probe output
  _renderProbe(col) {
    const [lon, lat] = toLonLat(col.x, col.y)
    const rows = col.layers.map(L => {
      const f = byK[L.k]
      if (!L.active) return `<div class="probe-row absent"><span class="bar" style="background:${f.color}"></span><div class="nm">${f.name}<small>absent</small></div><span class="v">–</span><span class="v">–</span></div>`
      const depthTop = col.ground - L.top
      return `<div class="probe-row" title="${f.name}: top ${fmt(L.top)} m AHD, base ${fmt(L.bot)} m AHD"><span class="bar" style="background:${f.color}"></span><div class="nm">${f.name}<small>${fmt(depthTop)} m deep · ${fmt(L.thick)} m thick</small></div><span class="v">${fmt(L.top)}</span><span class="v">${fmt(L.bot)}</span></div>`
    }).join('')
    $('#probe-out').innerHTML = `<div class="probe-head">E <b>${fmt(col.x)}</b> N <b>${fmt(col.y)}</b> (MGA55)<br>${lat.toFixed(4)}°S ${lon.toFixed(4)}°E · ground <b>${fmt(col.ground)} m AHD</b><br><span style="float:right">top · base (m AHD)</span></div>${rows}`
    $('#probe-copy').disabled = false
    this._showTab('probe')
  }
  _copyProbe() {
    const col = this.probe.column; if (!col) return
    const lines = ['formation,k,top_mAHD,base_mAHD,thickness_m,depth_to_top_m']
    for (const L of col.layers) if (L.active) lines.push(`"${byK[L.k].name}",${L.k},${L.top.toFixed(1)},${L.bot.toFixed(1)},${L.thick.toFixed(1)},${(col.ground - L.top).toFixed(1)}`)
    navigator.clipboard.writeText(`# E ${col.x.toFixed(0)} N ${col.y.toFixed(0)} MGA55, ground ${col.ground.toFixed(1)} m AHD\n${lines.join('\n')}`).then(() => this._toast('Borehole copied as CSV'))
  }

  // ---------------------------------------------------------------- misc
  _toast(msg) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; Object.assign(t.style, { position: 'absolute', left: '50%', top: '18px', transform: 'translateX(-50%)', background: 'var(--glass-strong)', border: '1px solid var(--line-strong)', borderRadius: '10px', padding: '8px 14px', zIndex: 50, fontSize: '13px', transition: 'opacity .3s' }); document.body.appendChild(t) } t.textContent = msg; t.style.opacity = 1; clearTimeout(this._toastT); this._toastT = setTimeout(() => t.style.opacity = 0, 2200) }
  _share() { this._syncUrl(); navigator.clipboard.writeText(location.href).then(() => this._toast('Link copied')) }
  /** Screenshot with a provenance stamp (model, CRS, datum, exaggeration, date). */
  _screenshot() {
    const url = this.viewer.screenshot()
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
      const pad = Math.round(img.width * 0.012), fs = Math.max(12, Math.round(img.width * 0.011))
      const lines = ['Surat Underground · OGIA 2017 Surat CMA geological model (Rev2B, 250 m)', `GDA94 / MGA zone 55 · elevations m AHD · vertical exaggeration ${this.state.exag}× · ${new Date().toISOString().slice(0, 10)}`]
      ctx.font = `${fs}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'bottom'
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2, h = fs * 2.6 + pad
      ctx.fillStyle = 'rgba(5,8,15,0.72)'; ctx.fillRect(img.width - w - pad, img.height - h - pad, w, h)
      ctx.fillStyle = '#e8edf5'; ctx.fillText(lines[0], img.width - w, img.height - pad - fs * 1.4)
      ctx.fillStyle = '#9aa6bb'; ctx.fillText(lines[1], img.width - w, img.height - pad - fs * 0.2)
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `surat-underground-${Date.now()}.png`; a.click()
      this._toast('Screenshot saved')
    }
    img.src = url
  }
  _updateStats() { let tris = 0, cells = 0; for (const L of this.model.layers.values()) if (L.counts) { tris += L.counts.tris; cells += L.counts.cells } $('#help-stats').textContent = `${this.model.lodId || ''} · ${fmt(cells)} cells · ${fmt(tris)} triangles` }

  // URL state --------------------------------------------------------------
  _syncUrlSoon() { clearTimeout(this._urlT); this._urlT = setTimeout(() => this._syncUrl(), 400) }
  _syncUrl() {
    if (this._applying) return
    const c = this.viewer.controls, p = new THREE.Vector3(), t = new THREE.Vector3(); c.getPosition(p); c.getTarget(t)
    const q = new URLSearchParams()
    q.set('c', [p.x, p.y, p.z, t.x, t.y, t.z].map(v => v.toFixed(1)).join(','))
    q.set('e', this.state.exag); if (this.state.explode) q.set('x', this.state.explode)
    if (this.mode && this.mode !== 'formation') q.set('m', this.mode); if (this.contourIdx) q.set('k', this.contourIdx)
    const vis = [...this.model.layers.values()].map(L => L.visible ? '1' : '0').join(''); if (vis.includes('0')) q.set('l', vis)
    if (this.section.mode === 'slice' || this.section.mode === 'slab') q.set('s', `${this.section.mode},${this.section.azimuth},${this.section.offset.toFixed(1)},${this.section.width}`)
    if (this.probe.column) q.set('p', `${this.probe.column.x.toFixed(0)},${this.probe.column.y.toFixed(0)}`)
    history.replaceState(null, '', `#${q.toString()}`)
  }
  _applyUrlState() {
    const h = location.hash.slice(1); if (!h) return
    const q = new URLSearchParams(h); this._applying = true
    try {
      if (q.get('e')) this.setExaggeration(Number(q.get('e')))
      if (q.get('x')) this.state.explode = Number(q.get('x'))
      if (q.get('m')) this.setMode(q.get('m'))
      if (q.get('k')) this.setContour(Number(q.get('k')))
      if (q.get('l')) { const v = q.get('l'); [...this.model.layers.values()].forEach((L, i) => this.model.setVisible(L.k, v[i] !== '0')) }
      if (q.get('s')) { const [mode, az, off, w] = q.get('s').split(','); this.section.azimuth = Number(az); this.section.offset = Number(off); this.section.width = Number(w); this._setCut(mode) }
      if (q.get('c')) { const v = q.get('c').split(',').map(Number); this.viewer.controls.setLookAt(v[0], v[1], v[2], v[3], v[4], v[5], false); this._urlHadCamera = true }
      if (q.get('p')) { const [x, y] = q.get('p').split(',').map(Number); setTimeout(() => this.probe.probeXY(x, y), 50) }
    } catch (e) { console.warn('bad url state', e) }
    this._applying = false
  }
}

async function boot() {
  try {
    const manifest = await (await fetch(`${DATA_BASE}/manifest.json`)).json()
    const app = new App(manifest); window.app = app
    await app.load()
  } catch (e) {
    console.error(e)
    const s = document.querySelector('#loader-status'); if (s) s.textContent = `Failed to load: ${e.message}`
  }
}
boot()
