// Grid helper: locating cells from map coordinates, sampling columns and cutting vertical sections
// directly from the node grids (exact match with the triangle meshes built by the worker).

function bary(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay, v2x = px - ax, v2y = py - ay
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < 1e-12) return null
  const v = (v2x * v1y - v1x * v2y) / den, w = (v0x * v2y - v2x * v0y) / den, u = 1 - v - w
  const eps = -1e-6
  if (u >= eps && v >= eps && w >= eps) return [u, v, w]
  return null
}

export class GridHelper {
  constructor(lod, cx, cy) {
    this.lod = lod; this.cx = cx; this.cy = cy
    const { nxn, nyn, x, y } = lod
    this.nxn = nxn; this.nyn = nyn; this.nxc = nxn - 1; this.nyc = nyn - 1
    this.x0 = x[0]; this.y0 = y[0]
    this.dx = (x[nxn - 1] - x[0]) / (nxn - 1); this.dy = (y[(nyn - 1) * nxn] - y[0]) / (nyn - 1)
    // scene-space (km, centred) node coordinates for section cutting
    const N = nxn * nyn
    this.X = new Float32Array(N); this.Y = new Float32Array(N)
    for (let n = 0; n < N; n++) { this.X[n] = (x[n] - cx) / 1000; this.Y[n] = (y[n] - cy) / 1000 }
  }

  /** Find the triangle containing map point (px, py) in metres. Returns {i, j, tri, nodes, w} or null. */
  locate(px, py) {
    const ie = Math.floor((px - this.x0) / this.dx), je = Math.floor((py - this.y0) / this.dy)
    const { x, y, nxn } = this.lod
    for (let r = 0; r <= 3; r++) {
      for (let j = je - r; j <= je + r; j++) for (let i = ie - r; i <= ie + r; i++) {
        if (r > 0 && Math.abs(j - je) !== r && Math.abs(i - ie) !== r) continue
        if (i < 0 || j < 0 || i >= this.nxc || j >= this.nyc) continue
        const n00 = j * nxn + i, n10 = n00 + 1, n01 = n00 + nxn, n11 = n01 + 1
        let w = bary(px, py, x[n00], y[n00], x[n10], y[n10], x[n11], y[n11])
        if (w) return { i, j, tri: 0, nodes: [n00, n10, n11], w }
        w = bary(px, py, x[n00], y[n00], x[n11], y[n11], x[n01], y[n01])
        if (w) return { i, j, tri: 1, nodes: [n00, n11, n01], w }
      }
    }
    return null
  }

  sample(arr, loc) {
    const [a, b, c] = loc.nodes; const va = arr[a], vb = arr[b], vc = arr[c]
    if (Number.isNaN(va) || Number.isNaN(vb) || Number.isNaN(vc)) return NaN
    return va * loc.w[0] + vb * loc.w[1] + vc * loc.w[2]
  }

  /** Virtual borehole at map point (metres). */
  column(px, py) {
    const loc = this.locate(px, py)
    if (!loc) return null
    const { nxc } = this
    const cellIdx = loc.j * nxc + loc.i
    const layers = []
    let ground = NaN
    for (const L of this.lod.layers) {
      const active = L.mask[cellIdx] === 1
      const top = active ? this.sample(L.top, loc) : NaN
      const bot = active ? this.sample(L.bot, loc) : NaN
      if (active && Number.isNaN(ground)) ground = top
      layers.push({ k: L.k, active, top, bot, thick: active ? top - bot : 0 })
    }
    const dem = this.sample(this.lod.dem, loc)
    return { loc, x: px, y: py, ground: Number.isNaN(ground) ? dem : ground, dem, layers }
  }

  /** Signed distance of every node to the vertical plane nx*X + ny*Y = d (scene km). */
  signedDistances(nx, ny, d) {
    const N = this.X.length, sd = new Float32Array(N)
    const X = this.X, Y = this.Y
    for (let n = 0; n < N; n++) sd[n] = nx * X[n] + ny * Y[n] - d
    return sd
  }

  /**
   * Intersect a layer with a vertical plane. tx,ty is the unit direction along the plane.
   * Returns Float32Array of segments [s1, zt1, zb1, s2, zt2, zb2, ...] with s in km along (tx,ty)
   * and z in km (elevation / 1000). Optional [smin, smax] clips in s.
   */
  sectionSegments(layer, sd, tx, ty, smin = -Infinity, smax = Infinity) {
    const { nxn, nxc, nyc, X, Y } = this
    const top = layer.top, bot = layer.bot, mask = layer.mask
    const out = []
    const pt = (u, v) => {
      const t = sd[u] / (sd[u] - sd[v])
      const px = X[u] + t * (X[v] - X[u]), py = Y[u] + t * (Y[v] - Y[u])
      return [tx * px + ty * py, (top[u] + t * (top[v] - top[u])) / 1000, (bot[u] + t * (bot[v] - bot[u])) / 1000]
    }
    const tri = (a, b, c) => {
      const sa = sd[a] >= 0, sb = sd[b] >= 0, sc = sd[c] >= 0
      if (sa === sb && sb === sc) return
      const pts = []
      if (sa !== sb) pts.push(pt(a, b))
      if (sb !== sc) pts.push(pt(b, c))
      if (sc !== sa) pts.push(pt(c, a))
      if (pts.length !== 2) return
      let [p, q] = pts
      if (p[0] > q[0]) { const tmp = p; p = q; q = tmp }
      if (q[0] < smin || p[0] > smax) return
      // clip to [smin, smax]
      if (p[0] < smin) { const t = (smin - p[0]) / (q[0] - p[0]); p = [smin, p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])] }
      if (q[0] > smax) { const t = (smax - p[0]) / (q[0] - p[0]); q = [smax, p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])] }
      out.push(p[0], p[1], p[2], q[0], q[1], q[2])
    }
    for (let j = 0; j < nyc; j++) {
      const row = j * nxc, nrow = j * nxn
      for (let i = 0; i < nxc; i++) {
        if (!mask[row + i]) continue
        const n00 = nrow + i, n10 = n00 + 1, n01 = n00 + nxn, n11 = n01 + 1
        const s0 = sd[n00] >= 0, s1 = sd[n10] >= 0, s2 = sd[n01] >= 0, s3 = sd[n11] >= 0
        if (s0 === s1 && s1 === s2 && s2 === s3) continue
        tri(n00, n10, n11); tri(n00, n11, n01)
      }
    }
    return Float32Array.from(out)
  }
}
