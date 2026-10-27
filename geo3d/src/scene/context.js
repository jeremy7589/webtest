// Context: surrounding terrain (public Terrarium DEM) draped with the Queensland Government relief
// basemap, an MGA graticule, and town labels (CSS2D).
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import proj4 from 'proj4'
import { loadContextDem } from '../data/geo3.js'
import { TOWNS } from '../data/formations.js'

export const MGA55 = '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
export function toMga(lon, lat) { return proj4('EPSG:4326', MGA55, [lon, lat]) }
export function toLonLat(x, y) { return proj4(MGA55, 'EPSG:4326', [x, y]) }

// basemap image extent (metres, MGA55) as exported by scripts (matches context DEM extent)
const BM = { x0: 431000, y0: 6675500, x1: 1131000, y1: 7565500 }

export class ContextLayer extends THREE.EventDispatcher {
  constructor(model, viewer, dataBase) {
    super()
    this.model = model; this.viewer = viewer; this.dataBase = dataBase
    this.group = new THREE.Group(); this.group.name = 'context'
    model.root.add(this.group)
    this.labels = new CSS2DRenderer(); this.labels.domElement.className = 'labels'
    viewer.container.appendChild(this.labels.domElement)
    viewer.addEventListener('rendered', () => this.labels.render(viewer.scene, viewer.camera))
    const ro = new ResizeObserver(() => this.labels.setSize(viewer.container.clientWidth, viewer.container.clientHeight)); ro.observe(viewer.container)
    this.labels.setSize(viewer.container.clientWidth, viewer.container.clientHeight)
    this.terrain = null; this.textures = {}; this.townObjs = []; this.gridLines = null
    this.visibleTerrain = true; this.visibleTowns = true; this.visibleGrid = true
  }

  async load() {
    const dem = await loadContextDem(`${this.dataBase}/context_dem.bin.gz`)
    this.dem = dem
    this._buildTerrain(dem)
    await this.setBasemap('relief')
    this._buildGrid(dem)
    this._buildTowns(dem)
    this.viewer.requestRender()
  }

  _demAt(x, y) { // metres -> elevation from context DEM (bilinear)
    const d = this.dem; if (!d) return 0
    const fx = (x - d.origin[0]) / d.step, fy = (y - d.origin[1]) / d.step
    const i = Math.max(0, Math.min(d.nxn - 2, Math.floor(fx))), j = Math.max(0, Math.min(d.nyn - 2, Math.floor(fy)))
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j))
    const g = d.dem, n = j * d.nxn + i
    return (g[n] * (1 - u) + g[n + 1] * u) * (1 - v) + (g[n + d.nxn] * (1 - u) + g[n + d.nxn + 1] * u) * v
  }

  _buildTerrain(dem) {
    const { nxn, nyn, origin, step } = dem
    const cx = this.model.cx, cy = this.model.cy
    const lod = this.model.lod
    // footprint mask on the context grid: remove cells under the model (eroded by one cell)
    const inModel = new Uint8Array((nxn - 1) * (nyn - 1))
    if (lod) {
      const g = this.model.grid
      for (let j = 0; j < nyn - 1; j++) for (let i = 0; i < nxn - 1; i++) {
        const px = origin[0] + (i + 0.5) * step, py = origin[1] + (j + 0.5) * step
        const ci = Math.floor((px - g.x0) / g.dx), cj = Math.floor((py - g.y0) / g.dy)
        if (ci < 0 || cj < 0 || ci >= g.nxc || cj >= g.nyc) continue
        inModel[j * (nxn - 1) + i] = lod.outcrop[cj * g.nxc + ci] > 0 ? 1 : 0
      }
    }
    const keep = (i, j) => {
      if (i < 0 || j < 0 || i >= nxn - 1 || j >= nyn - 1) return false
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= nxn - 1 || jj >= nyn - 1) return true
        if (!inModel[jj * (nxn - 1) + ii]) return true
      }
      return false
    }
    const pos = new Float32Array(nxn * nyn * 3), uv = new Float32Array(nxn * nyn * 2)
    for (let j = 0; j < nyn; j++) for (let i = 0; i < nxn; i++) {
      const n = j * nxn + i, x = origin[0] + i * step, y = origin[1] + j * step
      pos[n * 3] = (x - cx) / 1000; pos[n * 3 + 1] = (y - cy) / 1000; pos[n * 3 + 2] = (dem.dem[n] - 25) / 1000
      uv[n * 2] = (x - BM.x0) / (BM.x1 - BM.x0); uv[n * 2 + 1] = (y - BM.y0) / (BM.y1 - BM.y0)
    }
    const idx = []
    for (let j = 0; j < nyn - 1; j++) for (let i = 0; i < nxn - 1; i++) {
      if (!keep(i, j)) continue
      const a = j * nxn + i, b = a + 1, c = a + nxn + 1, d = a + nxn
      idx.push(a, b, c, a, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere()
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
    this.terrainMat = mat
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'context-terrain'; mesh.receiveShadow = true; mesh.castShadow = false
    this.terrain = mesh; this.group.add(mesh)
  }

  async setBasemap(name) { // 'relief' | 'topo' | 'none'
    if (name === 'none') { this.terrainMat.map = null; this.terrainMat.color.set(0x6f7781); this.terrainMat.needsUpdate = true; this.viewer.requestRender(); return }
    if (!this.textures[name]) {
      const tex = await new THREE.TextureLoader().loadAsync(`${this.dataBase}/basemap_${name}.jpg`)
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, this.viewer.renderer.capabilities.getMaxAnisotropy())
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true
      this.textures[name] = tex
    }
    this.terrainMat.map = this.textures[name]; this.terrainMat.color.set(name === 'topo' ? 0xd8dde3 : 0xc9ced4); this.terrainMat.needsUpdate = true
    this.basemap = name
    this.viewer.requestRender()
  }

  _buildGrid(dem) {
    const cx = this.model.cx, cy = this.model.cy
    const pts = []
    const step = 100000
    const x0 = Math.ceil(BM.x0 / step) * step, y0 = Math.ceil(BM.y0 / step) * step
    for (let x = x0; x <= BM.x1; x += step) for (let y = BM.y0; y < BM.y1; y += 5000) {
      pts.push((x - cx) / 1000, (y - cy) / 1000, (this._demAt(x, y) + 15) / 1000, (x - cx) / 1000, (y + 5000 - cy) / 1000, (this._demAt(x, y + 5000) + 15) / 1000)
    }
    for (let y = y0; y <= BM.y1; y += step) for (let x = BM.x0; x < BM.x1; x += 5000) {
      pts.push((x - cx) / 1000, (y - cy) / 1000, (this._demAt(x, y) + 15) / 1000, (x + 5000 - cx) / 1000, (y - cy) / 1000, (this._demAt(x + 5000, y) + 15) / 1000)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }))
    lines.name = 'mga-grid'; this.gridLines = lines; this.group.add(lines)
    // edge labels
    this.gridLabels = []
    for (let x = x0; x <= BM.x1; x += step) this._label(`${(x / 1000) | 0} 000 E`, x, BM.y0 + 12000, 'grid-label', this.gridLabels)
    for (let y = y0; y <= BM.y1; y += step) this._label(`${(y / 1000) | 0} 000 N`, BM.x0 + 12000, y, 'grid-label', this.gridLabels)
  }

  _label(text, x, y, cls, bucket, zOffset = 200) {
    const el = document.createElement('div'); el.className = cls; el.textContent = text
    const obj = new CSS2DObject(el)
    obj.position.set((x - this.model.cx) / 1000, (y - this.model.cy) / 1000, (this._demAt(x, y) + zOffset) / 1000)
    this.group.add(obj); bucket.push(obj); return obj
  }

  _buildTowns() {
    for (const t of TOWNS) {
      const [x, y] = toMga(t.lon, t.lat)
      if (x < BM.x0 || x > BM.x1 || y < BM.y0 || y > BM.y1) continue
      const obj = this._label(t.name, x, y, `town-label${t.major ? ' major' : ''}`, this.townObjs, 60)
      obj.userData.town = t
    }
  }

  setTerrainVisible(v) { this.visibleTerrain = v; if (this.terrain) this.terrain.visible = v; this.viewer.requestRender() }
  setTownsVisible(v) { this.visibleTowns = v; for (const o of this.townObjs) o.visible = v; this.viewer.requestRender() }
  setGridVisible(v) { this.visibleGrid = v; if (this.gridLines) this.gridLines.visible = v; for (const o of this.gridLabels || []) o.visible = v; this.viewer.requestRender() }
}
