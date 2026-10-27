// 2D profile panel for the current slice / fence, drawn on a canvas from the section segments.
import { byK } from '../data/formations.js'

export class Section2D {
  constructor(el, canvas, onHover) {
    this.el = el; this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onHover = onHover
    this.profile = null; this.visibleK = () => true
    this.hover = null
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(canvas)
    canvas.addEventListener('pointermove', (e) => this._hover(e))
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); onHover && onHover(null) })
  }

  setProfile(profile, title) {
    this.profile = profile
    this.el.hidden = !profile
    if (title) this.el.querySelector('#s2d-title').textContent = title
    this.draw()
  }

  _layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) { this.canvas.width = w * dpr; this.canvas.height = h * dpr }
    return { dpr, w, h, ml: 54, mr: 14, mt: 12, mb: 24 }
  }

  _bounds() {
    const p = this.profile; let smin = Infinity, smax = -Infinity, zmin = Infinity, zmax = -Infinity
    for (const seg of p.segments) {
      const off = (seg.cum ?? 0) - seg.s0
      for (const L of seg.profile) {
        if (!this.visibleK(L.k)) continue
        const a = L.segs
        for (let i = 0; i < a.length; i += 3) { const s = a[i] + off, zt = a[i + 1], zb = a[i + 2]; if (s < smin) smin = s; if (s > smax) smax = s; if (zt > zmax) zmax = zt; if (zb < zmin) zmin = zb }
      }
    }
    if (!isFinite(smin)) return null
    return { smin, smax, zmin: zmin - 0.1, zmax: zmax + 0.15 }
  }

  draw() {
    const { dpr, w, h, ml, mr, mt, mb } = this._layout()
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
    if (!this.profile) return
    const b = this._bounds(); if (!b) return
    this.b = b
    const sx = (s) => ml + (s - b.smin) / (b.smax - b.smin) * (w - ml - mr)
    const sy = (z) => mt + (b.zmax - z) / (b.zmax - b.zmin) * (h - mt - mb)
    this.sx = sx; this.sy = sy
    // grid
    ctx.font = '10px IBM Plex Mono, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
    const zspan = (b.zmax - b.zmin) * 1000
    const zstep = zspan > 6000 ? 2000 : zspan > 2500 ? 1000 : zspan > 1200 ? 500 : zspan > 500 ? 250 : 100
    for (let z = Math.ceil(b.zmin * 1000 / zstep) * zstep; z <= b.zmax * 1000; z += zstep) {
      const y = sy(z / 1000); ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(w - mr, y); ctx.stroke()
      ctx.textAlign = 'right'; ctx.fillText(`${z} m`, ml - 6, y + 3)
    }
    const sspan = b.smax - b.smin
    const sstep = sspan > 300 ? 100 : sspan > 120 ? 50 : sspan > 50 ? 20 : sspan > 20 ? 10 : 5
    ctx.textAlign = 'center'
    for (let s = Math.ceil(b.smin / sstep) * sstep; s <= b.smax; s += sstep) {
      const x = sx(s); ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, h - mb); ctx.stroke(); ctx.fillText(`${Math.round(s - b.smin)} km`, x, h - 8)
    }
    // layers
    for (const seg of this.profile.segments) {
      const off = (seg.cum ?? 0) - seg.s0
      for (const L of seg.profile) {
        if (!this.visibleK(L.k)) continue
        const a = L.segs; if (!a.length) continue
        ctx.fillStyle = byK[L.k].color
        ctx.globalAlpha = this.hover && this.hover.k !== L.k ? 0.55 : 1
        ctx.beginPath()
        for (let i = 0; i < a.length; i += 6) {
          const x1 = sx(a[i] + off), x2 = sx(a[i + 3] + off)
          ctx.moveTo(x1, sy(a[i + 1])); ctx.lineTo(x2, sy(a[i + 4])); ctx.lineTo(x2, sy(a[i + 5])); ctx.lineTo(x1, sy(a[i + 2])); ctx.closePath()
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (seg.cum !== undefined && seg.cum > 0) { const x = sx(seg.cum); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, h - mb); ctx.stroke(); ctx.setLineDash([]) }
    }
    // frame
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.strokeRect(ml, mt, w - ml - mr, h - mt - mb)
    if (this.hover) {
      const { x, y } = this.hover
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, h - mb); ctx.stroke()
    }
  }

  _hover(e) {
    if (!this.profile || !this.b) return
    const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
    const b = this.b, { w, h, ml, mr, mt, mb } = this._layout()
    const s = b.smin + (x - ml) / (w - ml - mr) * (b.smax - b.smin)
    const z = b.zmax - (y - mt) / (h - mt - mb) * (b.zmax - b.zmin)
    let found = null
    for (const seg of this.profile.segments) {
      const off = (seg.cum ?? 0) - seg.s0
      for (const L of seg.profile) {
        if (!this.visibleK(L.k)) continue
        const a = L.segs
        for (let i = 0; i < a.length; i += 6) {
          const s1 = a[i] + off, s2 = a[i + 3] + off
          if (s < Math.min(s1, s2) || s > Math.max(s1, s2)) continue
          const t = (s - s1) / ((s2 - s1) || 1e-9)
          const zt = a[i + 1] + t * (a[i + 4] - a[i + 1]), zb = a[i + 2] + t * (a[i + 5] - a[i + 2])
          if (z <= zt && z >= zb) { found = { k: L.k, s: s - b.smin, zt, zb, z, x, y, seg }; break }
        }
        if (found) break
      }
      if (found) break
    }
    this.hover = found ? { k: found.k, x, y } : { x, y }
    this.draw()
    this.onHover && this.onHover(found, { s: s - b.smin, z })
  }
}
