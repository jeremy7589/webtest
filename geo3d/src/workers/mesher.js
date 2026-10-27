// Web Worker: builds a closed triangle mesh (top sheet, bottom sheet, boundary walls) for one
// geological layer from node grids, plus a serialized BVH for fast picking.
// Units: kilometres, positions relative to (cx, cy). Elevation stays in km on position.z.
import { BufferGeometry, BufferAttribute } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

self.onmessage = (e) => {
  const { id, k, nxn, nyn, x, y, top, bot, mask, cx, cy, wantBvh } = e.data
  try {
    const out = buildLayer({ nxn, nyn, x, y, top, bot, mask, cx, cy })
    const transfer = [out.position.buffer, out.normal.buffer, out.index.buffer, out.thick.buffer, out.kind.buffer]
    let bvh = null
    if (wantBvh && out.index.length > 0) {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(out.position, 3))
      g.setIndex(new BufferAttribute(out.index, 1))
      const tree = new MeshBVH(g, { indirect: true, targetLeafSize: 16 })
      bvh = MeshBVH.serialize(tree, { cloneBuffers: false })
      for (const r of bvh.roots) transfer.push(r)
      if (bvh.indirectBuffer) transfer.push(bvh.indirectBuffer.buffer)
      bvh.index = null // the geometry index is sent separately
    }
    self.postMessage({ id, k, ...out, bvh }, transfer)
  } catch (err) {
    self.postMessage({ id, k, error: String(err && err.stack || err) })
  }
}

function buildLayer({ nxn, nyn, x, y, top, bot, mask, cx, cy }) {
  const nxc = nxn - 1, nyc = nyn - 1
  const N = nxn * nyn
  // 1. nodes used by active cells -> compact vertex ids
  const vid = new Int32Array(N).fill(-1)
  let nv = 0, ncell = 0
  for (let j = 0; j < nyc; j++) for (let i = 0; i < nxc; i++) {
    if (!mask[j * nxc + i]) continue
    ncell++
    const n00 = j * nxn + i, n10 = n00 + 1, n01 = n00 + nxn, n11 = n01 + 1
    if (vid[n00] < 0) vid[n00] = nv++
    if (vid[n10] < 0) vid[n10] = nv++
    if (vid[n01] < 0) vid[n01] = nv++
    if (vid[n11] < 0) vid[n11] = nv++
  }
  // 2. count boundary edges for walls
  const isAct = (i, j) => (i >= 0 && j >= 0 && i < nxc && j < nyc && mask[j * nxc + i] === 1)
  let nwall = 0
  for (let j = 0; j < nyc; j++) for (let i = 0; i < nxc; i++) {
    if (!mask[j * nxc + i]) continue
    if (!isAct(i, j - 1)) nwall++
    if (!isAct(i, j + 1)) nwall++
    if (!isAct(i - 1, j)) nwall++
    if (!isAct(i + 1, j)) nwall++
  }
  const NT = nv                       // top vertices [0, NT)
  const NB = nv                       // bottom vertices [NT, 2NT)
  const NW = nwall * 4                // wall vertices after that
  const nvert = NT + NB + NW
  const position = new Float32Array(nvert * 3)
  const normal = new Float32Array(nvert * 3)
  const thick = new Float32Array(nvert)
  const kind = new Float32Array(nvert) // 0 top, 1 bottom, 2 wall
  const ntri = ncell * 2 * 2 + nwall * 2
  const index = new Uint32Array(ntri * 3)

  // 3. positions for top and bottom
  for (let n = 0; n < N; n++) {
    const v = vid[n]; if (v < 0) continue
    const px = (x[n] - cx) / 1000, py = (y[n] - cy) / 1000
    const zt = top[n] / 1000, zb = bot[n] / 1000
    const th = top[n] - bot[n]
    position[v * 3] = px; position[v * 3 + 1] = py; position[v * 3 + 2] = zt
    const w = NT + v
    position[w * 3] = px; position[w * 3 + 1] = py; position[w * 3 + 2] = zb
    thick[v] = th; thick[w] = th; kind[v] = 0; kind[w] = 1
  }
  // 4. indices for top and bottom sheets (bottom reversed)
  let t = 0
  for (let j = 0; j < nyc; j++) for (let i = 0; i < nxc; i++) {
    if (!mask[j * nxc + i]) continue
    const n00 = j * nxn + i
    const a = vid[n00], b = vid[n00 + 1], c = vid[n00 + nxn + 1], d = vid[n00 + nxn]
    index[t++] = a; index[t++] = b; index[t++] = c
    index[t++] = a; index[t++] = c; index[t++] = d
    index[t++] = NT + a; index[t++] = NT + c; index[t++] = NT + b
    index[t++] = NT + a; index[t++] = NT + d; index[t++] = NT + c
  }
  const topEnd = t
  // 5. smooth normals for top/bottom from triangle normals (area weighted)
  for (let tri = 0; tri < topEnd; tri += 3) {
    const ia = index[tri], ib = index[tri + 1], ic = index[tri + 2]
    const ax = position[ia * 3], ay = position[ia * 3 + 1], az = position[ia * 3 + 2]
    const bx = position[ib * 3] - ax, by = position[ib * 3 + 1] - ay, bz = position[ib * 3 + 2] - az
    const cxv = position[ic * 3] - ax, cyv = position[ic * 3 + 1] - ay, czv = position[ic * 3 + 2] - az
    const nx = by * czv - bz * cyv, ny = bz * cxv - bx * czv, nz = bx * cyv - by * cxv
    normal[ia * 3] += nx; normal[ia * 3 + 1] += ny; normal[ia * 3 + 2] += nz
    normal[ib * 3] += nx; normal[ib * 3 + 1] += ny; normal[ib * 3 + 2] += nz
    normal[ic * 3] += nx; normal[ic * 3 + 1] += ny; normal[ic * 3 + 2] += nz
  }
  for (let v = 0; v < NT + NB; v++) {
    const nx = normal[v * 3], ny = normal[v * 3 + 1], nz = normal[v * 3 + 2]
    const l = Math.hypot(nx, ny, nz) || 1
    normal[v * 3] = nx / l; normal[v * 3 + 1] = ny / l; normal[v * 3 + 2] = nz / l
  }
  // 6. walls: one quad per boundary edge with flat outward normals
  let wv = NT + NB
  const addWall = (nA, nB, ox, oy) => {
    // nA, nB node indices of the edge; (ox, oy) outward horizontal direction
    const vA = vid[nA], vB = vid[nB]
    const tA = vA, tB = vB, bA = NT + vA, bB = NT + vB
    const src = [tA, bA, bB, tB]
    const base = wv
    for (let q = 0; q < 4; q++) {
      const s = src[q]; const d = wv++
      position[d * 3] = position[s * 3]; position[d * 3 + 1] = position[s * 3 + 1]; position[d * 3 + 2] = position[s * 3 + 2]
      thick[d] = thick[s]; kind[d] = 2
    }
    // flat normal: outward horizontal component plus tilt from edge slope
    const ex = position[tB * 3] - position[tA * 3], ey = position[tB * 3 + 1] - position[tA * 3 + 1], ez = position[tB * 3 + 2] - position[tA * 3 + 2]
    // down vector (0,0,-1) x edge gives a horizontal-ish normal; orient to outward
    let nx = ey * 1, ny = -ex * 1, nz = 0
    if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny }
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l
    for (let q = 0; q < 4; q++) { const d = base + q; normal[d * 3] = nx; normal[d * 3 + 1] = ny; normal[d * 3 + 2] = nz }
    // two triangles, oriented so the face normal matches (nx, ny)
    const p = base
    const cross = (i0, i1, i2) => {
      const x0 = position[i0 * 3], y0 = position[i0 * 3 + 1], z0 = position[i0 * 3 + 2]
      const ux = position[i1 * 3] - x0, uy = position[i1 * 3 + 1] - y0, uz = position[i1 * 3 + 2] - z0
      const vx = position[i2 * 3] - x0, vy = position[i2 * 3 + 1] - y0, vz = position[i2 * 3 + 2] - z0
      return (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny
    }
    if (cross(p, p + 1, p + 2) >= 0) { index[t++] = p; index[t++] = p + 1; index[t++] = p + 2; index[t++] = p; index[t++] = p + 2; index[t++] = p + 3 }
    else { index[t++] = p; index[t++] = p + 2; index[t++] = p + 1; index[t++] = p; index[t++] = p + 3; index[t++] = p + 2 }
  }
  for (let j = 0; j < nyc; j++) for (let i = 0; i < nxc; i++) {
    if (!mask[j * nxc + i]) continue
    const n00 = j * nxn + i, n10 = n00 + 1, n01 = n00 + nxn, n11 = n01 + 1
    if (!isAct(i, j - 1)) addWall(n00, n10, 0, -1)
    if (!isAct(i, j + 1)) addWall(n01, n11, 0, 1)
    if (!isAct(i - 1, j)) addWall(n00, n01, -1, 0)
    if (!isAct(i + 1, j)) addWall(n10, n11, 1, 0)
  }
  // bounding box
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity
  for (let v = 0; v < nvert; v++) {
    const px = position[v * 3], py = position[v * 3 + 1], pz = position[v * 3 + 2]
    if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py; if (pz < minz) minz = pz; if (pz > maxz) maxz = pz
  }
  return { position, normal, index: index.subarray(0, t).slice(), thick, kind, groups: { topEnd, wallStart: topEnd, wallEnd: t }, counts: { cells: ncell, verts: nvert, tris: t / 3, walls: nwall }, bbox: nvert ? [minx, miny, minz, maxx, maxy, maxz] : null }
}
