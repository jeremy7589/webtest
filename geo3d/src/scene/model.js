// GeoModel: owns the layer meshes, materials, exaggeration and explode state, and the worker pool.
import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { createLayerMaterial, createSharedUniforms, MODE } from './material.js'
import { FORMATIONS, PALETTES } from '../data/formations.js'
import { loadLod } from '../data/geo3.js'
import { GridHelper } from './grid.js'

THREE.Mesh.prototype.raycast = acceleratedRaycast

class WorkerPool {
  constructor(n) {
    this.workers = []; this.idle = []; this.queue = []; this.pending = new Map(); this.nextId = 1
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../workers/mesher.js', import.meta.url), { type: 'module' })
      w.onmessage = (e) => { const p = this.pending.get(e.data.id); this.pending.delete(e.data.id); this.idle.push(w); this.pump(); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data) }
      w.onerror = (e) => { console.error('mesher worker error', e) }
      this.workers.push(w); this.idle.push(w)
    }
  }
  run(msg) { return new Promise((resolve, reject) => { this.queue.push({ msg, resolve, reject }); this.pump() }) }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop(); const job = this.queue.shift(); const id = this.nextId++
      this.pending.set(id, job); w.postMessage({ id, ...job.msg })
    }
  }
  dispose() { for (const w of this.workers) w.terminate() }
}

export class GeoModel extends THREE.EventDispatcher {
  constructor(manifest, dataBase) {
    super()
    this.manifest = manifest; this.dataBase = dataBase
    this.cx = manifest.center[0]; this.cy = manifest.center[1]
    this.root = new THREE.Group(); this.root.name = 'model-root'
    this.exag = 12; this.root.scale.z = this.exag
    this.explodeGap = 0
    this.shared = createSharedUniforms()
    this.layers = new Map()
    this.clipPlanes = []
    this.palette = 'formation'
    this.lod = null; this.grid = null; this.lodId = null
    const nw = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1))
    this.pool = new WorkerPool(nw)
    for (const f of FORMATIONS) {
      const group = new THREE.Group(); group.name = `layer-${f.k}`
      const material = createLayerMaterial(f.color, this.shared)
      const L = { k: f.k, f, group, material, mesh: null, visible: true, opacity: 1, bbox: null, counts: null }
      this.layers.set(f.k, L); this.root.add(group)
    }
  }

  get layerList() { return [...this.layers.values()] }

  async load(lodId, onProgress) {
    const lodMeta = this.manifest.lods.find(l => l.id === lodId)
    const lod = await loadLod(`${this.dataBase}/${lodMeta.file}`, onProgress)
    return lod
  }

  /** Build all layer meshes for a loaded LOD, bottom-up. Resolves when all are in the scene. */
  async build(lod, onLayer) {
    this.lod = lod; this.lodId = lod.lod
    this.grid = new GridHelper(lod, this.cx, this.cy)
    const order = [...lod.layers].sort((a, b) => b.k - a.k)
    let built = 0
    await Promise.all(order.map(async (Ld) => {
      const res = await this.pool.run({ k: Ld.k, nxn: lod.nxn, nyn: lod.nyn, x: lod.x, y: lod.y, top: Ld.top, bot: Ld.bot, mask: Ld.mask, cx: this.cx, cy: this.cy, wantBvh: true })
      this.installGeometry(Ld.k, res)
      built++
      onLayer && onLayer(Ld.k, built, order.length, res.counts)
    }))
    this.dispatchEvent({ type: 'built', lod: lod.lod })
  }

  installGeometry(k, res) {
    const L = this.layers.get(k)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(res.position, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(res.normal, 3))
    g.setAttribute('aThick', new THREE.BufferAttribute(res.thick, 1))
    g.setAttribute('aKind', new THREE.BufferAttribute(res.kind, 1))
    g.setIndex(new THREE.BufferAttribute(res.index, 1))
    if (res.bbox) {
      g.boundingBox = new THREE.Box3(new THREE.Vector3(res.bbox[0], res.bbox[1], res.bbox[2]), new THREE.Vector3(res.bbox[3], res.bbox[4], res.bbox[5]))
      g.computeBoundingSphere()
    }
    if (res.bvh) {
      try { g.boundsTree = MeshBVH.deserialize(res.bvh, g, { setIndex: false }) } catch (e) { console.warn('BVH deserialize failed', e) }
    }
    if (L.mesh) { L.group.remove(L.mesh); L.mesh.geometry.dispose() }
    const mesh = new THREE.Mesh(g, L.material)
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.k = k; mesh.name = `mesh-${k}`
    L.mesh = mesh; L.bbox = g.boundingBox; L.counts = res.counts
    L.group.add(mesh)
    this.dispatchEvent({ type: 'layerbuilt', k, counts: res.counts })
  }

  /** World-space bounding box of all layers (accounts for exaggeration and explode). */
  worldBox() {
    const box = new THREE.Box3()
    this.root.updateMatrixWorld(true)
    for (const L of this.layers.values()) if (L.mesh && L.visible) box.expandByObject(L.mesh)
    return box
  }
  layerWorldBox(k) {
    const L = this.layers.get(k); if (!L || !L.mesh) return null
    this.root.updateMatrixWorld(true)
    return new THREE.Box3().expandByObject(L.mesh)
  }

  setExaggeration(e) {
    this.exag = e; this.root.scale.z = e; this.applyExplode()
    this.dispatchEvent({ type: 'change', what: 'exag' })
  }
  setExplode(gapKm) { this.explodeGap = gapKm; this.applyExplode(); this.dispatchEvent({ type: 'change', what: 'explode' }) }
  // Explode upward: the deepest layer stays put, every layer above rises by one gap per step.
  applyExplode() {
    const g = this.explodeGap / this.exag, n = this.layers.size
    for (const L of this.layers.values()) L.group.position.z = (n - L.k) * g
  }
  explodeOffsetKm(k) { return (this.layers.size - k) * this.explodeGap / this.exag }

  setVisible(k, v) { const L = this.layers.get(k); L.visible = v; L.group.visible = v; this.dispatchEvent({ type: 'change', what: 'visible', k }) }
  setAllVisible(v) { for (const L of this.layers.values()) { L.visible = v; L.group.visible = v } this.dispatchEvent({ type: 'change', what: 'visible' }) }
  solo(k) { for (const L of this.layers.values()) { L.visible = L.k === k; L.group.visible = L.visible } this.dispatchEvent({ type: 'change', what: 'visible' }) }
  setOpacity(k, a) {
    const L = this.layers.get(k); L.opacity = a
    L.material.opacity = a; L.material.transparent = a < 0.999; L.material.depthWrite = true
    L.material.needsUpdate = true
    this.dispatchEvent({ type: 'change', what: 'opacity', k })
  }
  setHighlight(k, on) { const L = this.layers.get(k); if (L) L.material.userData.uHighlight.value = on ? 1 : 0 }
  /** Current display colour of a layer under the active palette (formation | age | hydro). */
  layerColor(k) { return PALETTES[this.palette].color(this.layers.get(k).f) }
  setPalette(name) {
    if (!PALETTES[name]) return
    this.palette = name
    for (const L of this.layers.values()) L.material.userData.uLayerColor.value.set(this.layerColor(L.k))
    this.dispatchEvent({ type: 'change', what: 'palette' })
  }
  setMode(mode, range) {
    this.shared.uMode.value = mode
    if (range) this.shared.uRange.value.set(range[0], range[1])
    this.dispatchEvent({ type: 'change', what: 'mode' })
  }
  setRamp(tex) { this.shared.uRamp.value = tex }
  setContour(m) { this.shared.uContour.value = m; this.dispatchEvent({ type: 'change', what: 'contour' }) }
  setClippingPlanes(planes) {
    this.clipPlanes = planes || []
    for (const L of this.layers.values()) { L.material.clippingPlanes = this.clipPlanes.length ? this.clipPlanes : null; L.material.needsUpdate = true }
    this.dispatchEvent({ type: 'change', what: 'clip' })
  }

  /** Raycast visible layers; honours clipping planes. Returns {k, point(world), localZ} or null. */
  pick(raycaster) {
    const meshes = []
    for (const L of this.layers.values()) if (L.visible && L.mesh) meshes.push(L.mesh)
    const hits = raycaster.intersectObjects(meshes, false)
    for (const h of hits) {
      let clipped = false
      for (const p of this.clipPlanes) if (p.distanceToPoint(h.point) < 0) { clipped = true; break }
      if (clipped) continue
      return { k: h.object.userData.k, point: h.point, face: h.face, distance: h.distance }
    }
    return null
  }

  dispose() { this.pool.dispose() }
}

export { MODE }
