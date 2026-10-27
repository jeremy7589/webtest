// Section tool: vertical slices and slabs (clipping planes + exact caps built from the grids),
// and fence diagrams along a user polyline.
import * as THREE from 'three'
import { createCapMaterial } from './material.js'

const DEG = Math.PI / 180

export class SectionTool extends THREE.EventDispatcher {
  constructor(model, viewer) {
    super()
    this.model = model; this.viewer = viewer
    this.mode = 'off'            // off | slice | slab | fence
    this.azimuth = 90            // degrees clockwise from north, direction of the section line
    this.offset = 0              // km along the plane normal from the model centre
    this.width = 40              // slab width km
    this.capMats = new Map()
    this.capMeshes = new Map()
    this.fencePts = []           // [{x, y}] km scene coords
    this.profile = null
    this.handle = new THREE.Group(); this.handle.name = 'section-handle'
    viewer.scene.add(this.handle)
    this._buildHandle()
    this._dragging = false
    this._bindDrag()
    model.addEventListener('change', (e) => { if (e.what === 'palette') for (const [k, m] of this.capMats) m.userData.uLayerColor.value.set(model.layerColor(k)) })
  }

  get extent() {
    const m = this.model.manifest; const ex = m.extent
    return { hw: (ex[2] - ex[0]) / 2000, hh: (ex[3] - ex[1]) / 2000 }
  }

  // ---- geometry helpers -------------------------------------------------
  /** Unit vectors for azimuth: t along the line, n normal (right-hand side). */
  _vectors(azDeg) {
    const a = azDeg * DEG
    const tx = Math.sin(a), ty = Math.cos(a)
    return { tx, ty, nx: ty, ny: -tx }
  }

  _capMaterial(k) {
    if (!this.capMats.has(k)) this.capMats.set(k, createCapMaterial(this.model.layerColor(k), this.model.shared))
    return this.capMats.get(k)
  }

  /** Build/refresh cap strips for a vertical plane. */
  _buildCaps(nx, ny, d, tx, ty, smin, smax, tag) {
    const grid = this.model.grid; if (!grid) return []
    const sd = grid.signedDistances(nx, ny, d)
    const profile = []
    for (const Ld of this.model.lod.layers) {
      const segs = grid.sectionSegments(Ld, sd, tx, ty, smin, smax)
      profile.push({ k: Ld.k, segs })
      const nseg = segs.length / 6
      const key = `${tag}-${Ld.k}`
      let mesh = this.capMeshes.get(key)
      if (nseg === 0) { if (mesh) mesh.visible = false; continue }
      const pos = new Float32Array(nseg * 4 * 3), nrm = new Float32Array(nseg * 4 * 3), thick = new Float32Array(nseg * 4), kind = new Float32Array(nseg * 4).fill(3)
      const idx = new Uint32Array(nseg * 6)
      for (let s = 0; s < nseg; s++) {
        const o = s * 6
        const s1 = segs[o], zt1 = segs[o + 1], zb1 = segs[o + 2], s2 = segs[o + 3], zt2 = segs[o + 4], zb2 = segs[o + 5]
        const x1 = nx * d + tx * s1, y1 = ny * d + ty * s1, x2 = nx * d + tx * s2, y2 = ny * d + ty * s2
        const v = s * 4
        pos.set([x1, y1, zt1, x2, y2, zt2, x2, y2, zb2, x1, y1, zb1], v * 3)
        // normal from the actual winding (v0,v1,v2) so double-sided lighting faces the viewer
        const ax = x2 - x1, ay = y2 - y1, az = zt2 - zt1, bx = x2 - x1, by = y2 - y1, bz = zb2 - zt1
        let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
        const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl
        if (cl < 1e-9) { cx = nx; cy = ny; cz = 0 }
        for (let q = 0; q < 4; q++) { nrm[(v + q) * 3] = cx; nrm[(v + q) * 3 + 1] = cy; nrm[(v + q) * 3 + 2] = cz }
        thick[v] = (zt1 - zb1) * 1000; thick[v + 1] = (zt2 - zb2) * 1000; thick[v + 2] = thick[v + 1]; thick[v + 3] = thick[v]
        idx.set([v, v + 1, v + 2, v, v + 2, v + 3], s * 6)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
      g.setAttribute('aThick', new THREE.BufferAttribute(thick, 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere()
      if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; mesh.visible = true }
      else {
        mesh = new THREE.Mesh(g, this._capMaterial(Ld.k)); mesh.name = key; mesh.userData.isCap = true; mesh.userData.k = Ld.k
        mesh.castShadow = false; mesh.receiveShadow = true
        this.model.layers.get(Ld.k).group.add(mesh); this.capMeshes.set(key, mesh)
      }
    }
    return profile
  }

  _hideCaps(prefix = null) { for (const [key, m] of this.capMeshes) if (!prefix || key.startsWith(prefix)) m.visible = false }

  // ---- public API -------------------------------------------------------
  setMode(mode) {
    this.mode = mode
    if (mode === 'off') { this.model.setClippingPlanes([]); this._hideCaps(); this.handle.visible = false; this.profile = null }
    else if (mode === 'fence') { this.model.setClippingPlanes([]); this._hideCaps(); this.handle.visible = false; this.updateFence() }
    else { this._hideCaps('fence'); this.update() }
    this.dispatchEvent({ type: 'change' }); this.viewer.requestRender()
  }
  setAzimuth(a) { this.azimuth = ((a % 360) + 360) % 360; if (this.mode === 'slice' || this.mode === 'slab') this.update() }
  setOffset(o) { this.offset = o; if (this.mode === 'slice' || this.mode === 'slab') this.update() }
  setWidth(w) { this.width = Math.max(2, w); if (this.mode === 'slab') this.update() }
  /** Range of valid offsets for the current azimuth (km). */
  offsetRange() { const { nx, ny } = this._vectors(this.azimuth); const { hw, hh } = this.extent; const r = Math.abs(nx) * hw + Math.abs(ny) * hh; return [-r, r] }

  update() {
    const { tx, ty, nx, ny } = this._vectors(this.azimuth)
    const { hw, hh } = this.extent
    const span = Math.abs(tx) * hw + Math.abs(ty) * hh
    if (this.mode === 'slice') {
      const d = this.offset
      // keep the side n·p <= d (viewer looks from the +n side into the cut)
      this.model.setClippingPlanes([new THREE.Plane(new THREE.Vector3(-nx, -ny, 0), d)])
      this._hideCaps('slab')
      const prof = this._buildCaps(nx, ny, d, tx, ty, -span, span, 'slice')
      this.profile = { kind: 'slice', segments: [{ profile: prof, s0: -span, s1: span, origin: [nx * d, ny * d], t: [tx, ty] }] }
      this._placeHandle(nx, ny, d, tx, ty, span)
    } else if (this.mode === 'slab') {
      const d1 = this.offset - this.width / 2, d2 = this.offset + this.width / 2
      this.model.setClippingPlanes([new THREE.Plane(new THREE.Vector3(nx, ny, 0), -d1), new THREE.Plane(new THREE.Vector3(-nx, -ny, 0), d2)])
      this._hideCaps('slice')
      const p1 = this._buildCaps(nx, ny, d1, tx, ty, -span, span, 'slabA')
      this._buildCaps(nx, ny, d2, tx, ty, -span, span, 'slabB')
      this.profile = { kind: 'slab', segments: [{ profile: p1, s0: -span, s1: span, origin: [nx * d1, ny * d1], t: [tx, ty] }] }
      this._placeHandle(nx, ny, this.offset, tx, ty, span)
    }
    this.dispatchEvent({ type: 'change' }); this.viewer.requestRender()
  }

  // fence --------------------------------------------------------------------
  setFencePoints(pts) { this.fencePts = pts.slice(); if (this.mode === 'fence') this.updateFence() }
  addFencePoint(p) { this.fencePts.push(p); if (this.mode === 'fence') this.updateFence() }
  clearFence() { this.fencePts = []; this._hideCaps('fence'); this.profile = null; this.dispatchEvent({ type: 'change' }); this.viewer.requestRender() }
  updateFence() {
    this._hideCaps('fence')
    const pts = this.fencePts
    const segments = []
    let s0 = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 1e-6) continue
      const tx = dx / len, ty = dy / len, nx = ty, ny = -tx
      const d = nx * a.x + ny * a.y
      const smin = tx * a.x + ty * a.y, smax = smin + len
      const prof = this._buildCaps(nx, ny, d, tx, ty, smin, smax, `fence${i}`)
      segments.push({ profile: prof, s0: smin, s1: smax, cum: s0, origin: [nx * d, ny * d], t: [tx, ty], a, b })
      s0 += len
    }
    this.profile = segments.length ? { kind: 'fence', segments } : null
    this.dispatchEvent({ type: 'change' }); this.viewer.requestRender()
  }

  // handle -------------------------------------------------------------------
  _buildHandle() {
    const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false })
    this.frame = new THREE.LineSegments(new THREE.BufferGeometry(), frameMat); this.frame.renderOrder = 5
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false })
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), barMat); this.bar.renderOrder = 6; this.bar.name = 'section-bar'
    const planeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false })
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMat); this.sheet.renderOrder = 4
    this.handle.add(this.frame, this.bar, this.sheet); this.handle.visible = false
  }
  _placeHandle(nx, ny, d, tx, ty, span) {
    const zr = this.model.manifest.zRange; const exag = this.model.exag
    const lift = (this.model.layers.size - 1) * this.model.explodeGap // exploded stack height (world km)
    const zTop = (zr[1] / 1000 + 0.4) * exag + lift, zBot = (zr[0] / 1000 - 0.3) * exag
    const cx = nx * d, cy = ny * d
    const p = (s, z) => [cx + tx * s, cy + ty * s, z]
    const verts = new Float32Array([...p(-span, zTop), ...p(span, zTop), ...p(span, zTop), ...p(span, zBot), ...p(span, zBot), ...p(-span, zBot), ...p(-span, zBot), ...p(-span, zTop)])
    this.frame.geometry.dispose(); this.frame.geometry = new THREE.BufferGeometry(); this.frame.geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    const dist = this.viewer.camera.position.distanceTo(new THREE.Vector3(cx, cy, zTop))
    const thick = Math.max(0.6, dist * 0.0022)
    this.bar.scale.set(span * 2, thick, thick); this.bar.position.set(cx, cy, zTop); this.bar.rotation.set(0, 0, Math.atan2(ty, tx))
    this.sheet.scale.set(span * 2, zTop - zBot, 1); this.sheet.position.set(cx, cy, (zTop + zBot) / 2)
    this.sheet.rotation.set(Math.PI / 2, 0, Math.atan2(ty, tx), 'ZXY')
    this.handle.visible = true
    this._handleData = { nx, ny, tx, ty, zTop }
  }
  _bindDrag() {
    const canvas = this.viewer.canvas, ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const toNdc = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
    let dragPlane = null, startOffset = 0, startHit = null
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.handle.visible || this.mode === 'off' || this.mode === 'fence') return
      toNdc(e); ray.setFromCamera(ndc, this.viewer.camera)
      const hit = ray.intersectObject(this.bar, false)[0]
      if (!hit) return
      e.stopImmediatePropagation(); e.preventDefault()
      this._dragging = true; startOffset = this.offset; startHit = hit.point.clone()
      dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z)
      this.viewer.controls.enabled = false; canvas.setPointerCapture(e.pointerId)
      this.dispatchEvent({ type: 'dragstart' })
    }, true)
    canvas.addEventListener('pointermove', (e) => {
      if (this._dragging) {
        toNdc(e); ray.setFromCamera(ndc, this.viewer.camera)
        const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(dragPlane, p)) return
        const { nx, ny } = this._handleData
        const delta = (p.x - startHit.x) * nx + (p.y - startHit.y) * ny
        const [lo, hi] = this.offsetRange()
        this.setOffset(Math.min(hi, Math.max(lo, startOffset + delta)))
        return
      }
      if (!this.handle.visible) { canvas.style.cursor = ''; return }
      toNdc(e); ray.setFromCamera(ndc, this.viewer.camera)
      const hit = ray.intersectObject(this.bar, false)[0]
      canvas.style.cursor = hit ? 'grab' : ''
    })
    const end = (e) => { if (!this._dragging) return; this._dragging = false; this.viewer.controls.enabled = true; try { canvas.releasePointerCapture(e.pointerId) } catch (_) {} this.dispatchEvent({ type: 'dragend' }) }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end)
  }
  /** Refresh handle after exaggeration / camera changes. */
  refreshHandle() { if (this.handle.visible && this._handleData) { const { nx, ny, tx, ty } = this._handleData; const { hw, hh } = this.extent; const span = Math.abs(tx) * hw + Math.abs(ty) * hh; this._placeHandle(nx, ny, this.mode === 'slab' ? this.offset : this.offset, tx, ty, span) } }
}
