// Probe tool: click the model to drop a virtual borehole and read every formation top and bottom.
import * as THREE from 'three'

export class ProbeTool extends THREE.EventDispatcher {
  constructor(model, viewer) {
    super()
    this.model = model; this.viewer = viewer
    this.enabled = false
    this.segments = new Map()  // k -> mesh
    this.mast = null
    this.column = null
    this.radiusKm = 2.2
    this._bind()
  }

  _bind() {
    const canvas = this.viewer.canvas
    let down = null
    canvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, t: performance.now() } })
    canvas.addEventListener('pointerup', (e) => {
      if (!down || !this.enabled) { down = null; return }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      const dt = performance.now() - down.t
      down = null
      if (moved > 6 || dt > 600) return
      this.probeAt(e.clientX, e.clientY)
    })
  }

  probeAt(clientX, clientY) {
    const canvas = this.viewer.canvas, r = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.viewer.camera)
    ray.firstHitOnly = true
    const hit = this.model.pick(ray)
    if (!hit) { this.dispatchEvent({ type: 'miss' }); return null }
    const px = hit.point.x * 1000 + this.model.cx, py = hit.point.y * 1000 + this.model.cy
    return this.probeXY(px, py, hit.k)
  }

  /** Probe at map coordinates (metres MGA55). */
  probeXY(px, py, hitK = null) {
    const col = this.model.grid.column(px, py)
    if (!col) { this.dispatchEvent({ type: 'miss' }); return null }
    col.hitK = hitK
    this.column = col
    this._draw(col)
    this.dispatchEvent({ type: 'probe', column: col })
    this.viewer.requestRender()
    return col
  }

  _draw(col) {
    const sx = (col.x - this.model.cx) / 1000, sy = (col.y - this.model.cy) / 1000
    const r = this.radiusKm
    for (const L of col.layers) {
      let mesh = this.segments.get(L.k)
      const grp = this.model.layers.get(L.k).group
      if (!L.active) { if (mesh) mesh.visible = false; continue }
      if (!mesh) {
        const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false); g.rotateX(Math.PI / 2)
        const m = new THREE.MeshStandardMaterial({ color: this.model.layers.get(L.k).f.color, roughness: 0.5, metalness: 0.05, emissive: new THREE.Color(this.model.layers.get(L.k).f.color), emissiveIntensity: 0.25 })
        mesh = new THREE.Mesh(g, m); mesh.name = `probe-${L.k}`; mesh.castShadow = true; mesh.renderOrder = 2
        grp.add(mesh); this.segments.set(L.k, mesh)
      }
      const h = Math.max((L.top - L.bot) / 1000, 0.002)
      mesh.scale.set(r, r, h); mesh.position.set(sx, sy, (L.top + L.bot) / 2000); mesh.visible = true
    }
    // mast above ground
    if (!this.mast) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 12); g.rotateX(Math.PI / 2)
      this.mast = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }))
      this.mast.renderOrder = 7; this.model.root.add(this.mast)
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }))
      ring.renderOrder = 7; this.ring = ring; this.model.root.add(ring)
    }
    const exag = this.model.exag
    const groundKm = (Number.isNaN(col.ground) ? col.dem : col.ground) / 1000
    const mastH = 1.2 / exag * 8 // visual ~ 8 km tall regardless of exaggeration
    this.mast.scale.set(0.25, 0.25, mastH); this.mast.position.set(sx, sy, groundKm + mastH / 2); this.mast.visible = true
    this.ring.scale.set(r, r, 1); this.ring.position.set(sx, sy, groundKm + 0.05 / exag); this.ring.visible = true
    this.dispatchEvent({ type: 'placed', x: sx, y: sy, z: groundKm, mastTop: groundKm + mastH })
  }

  clear() {
    for (const m of this.segments.values()) m.visible = false
    if (this.mast) { this.mast.visible = false; this.ring.visible = false }
    this.column = null
    this.dispatchEvent({ type: 'cleared' }); this.viewer.requestRender()
  }
  setEnabled(on) { this.enabled = on; this.viewer.canvas.classList.toggle('probe-cursor', on) }
}
