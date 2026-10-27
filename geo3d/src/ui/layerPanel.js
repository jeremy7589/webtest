// Layer list (stratigraphic order) and the legend box.
import { FORMATIONS, byK, HYDRO, PERIOD_COLORS } from '../data/formations.js'
import { COLORMAPS, rampCss } from '../data/colormaps.js'
import { MODE } from '../scene/material.js'

const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.7 6.7C4 8.3 2 12 2 12s3.5 6 10 6c1.6 0 3-.3 4.3-.9M9.9 5.2C10.6 5.1 11.3 5 12 5c6.5 0 10 7 10 7s-.8 1.6-2.4 3.3"/></svg>'
const FLY = '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg>'

export class LayerPanel {
  constructor({ listEl, legendEl, model, viewer, onFly }) {
    this.listEl = listEl; this.legendEl = legendEl; this.model = model; this.viewer = viewer; this.onFly = onFly
    this.rows = new Map(); this.mode = MODE.LAYER; this.range = [0, 1]
    this._build()
    model.addEventListener('change', (e) => { if (e.what === 'visible' || e.what === 'opacity' || e.what === 'palette') this.refresh() })
  }

  _build() {
    this.listEl.innerHTML = ''
    let period = null
    for (const f of FORMATIONS) {
      if (f.period !== period) { period = f.period; const h = document.createElement('li'); h.className = 'layer-period'; h.textContent = period; this.listEl.appendChild(h) }
      const li = document.createElement('li'); li.className = 'layer'; li.dataset.k = f.k
      li.innerHTML = `<span class="sw" style="background:${f.color}" title="Isolate ${f.name}"></span>
        <div class="nm"><span class="num">${f.k}</span> ${f.name}<small>${f.role}</small></div>
        <button class="fly" title="Fly to layer">${FLY}</button>
        <button class="eye" title="Show / hide">${EYE}</button>
        <input class="op" type="range" min="0.1" max="1" step="0.05" value="1" title="Opacity" />`
      const sw = li.querySelector('.sw'), eye = li.querySelector('.eye'), nm = li.querySelector('.nm'), fly = li.querySelector('.fly'), op = li.querySelector('.op')
      sw.addEventListener('click', () => {
        const L = this.model.layers.get(f.k)
        const soloed = [...this.model.layers.values()].every(x => x.visible === (x.k === f.k))
        if (soloed) this.model.setAllVisible(true); else this.model.solo(f.k)
        this.viewer.requestRender()
      })
      eye.addEventListener('click', () => { const L = this.model.layers.get(f.k); this.model.setVisible(f.k, !L.visible); this.viewer.requestRender() })
      nm.addEventListener('click', () => li.classList.toggle('expanded'))
      fly.addEventListener('click', () => this.onFly && this.onFly(f.k))
      op.addEventListener('input', () => { this.model.setOpacity(f.k, Number(op.value)); this.viewer.requestRender() })
      li.addEventListener('mouseenter', () => { this.model.setHighlight(f.k, true); this.viewer.requestRender() })
      li.addEventListener('mouseleave', () => { this.model.setHighlight(f.k, false); this.viewer.requestRender() })
      this.listEl.appendChild(li); this.rows.set(f.k, { li, eye, op, sw })
    }
    this.refresh(); this.renderLegend()
  }

  refresh() {
    for (const [k, r] of this.rows) {
      const L = this.model.layers.get(k)
      r.li.classList.toggle('off', !L.visible)
      r.eye.innerHTML = L.visible ? EYE : EYE_OFF
      r.op.value = L.opacity
      r.sw.style.background = this.model.layerColor(k)
    }
    this.renderLegend()
  }

  setMode(mode, range, rampName) { this.mode = mode; this.range = range; this.rampName = rampName; this.renderLegend() }

  renderLegend() {
    const el = this.legendEl
    if (this.mode === MODE.LAYER) {
      const pal = this.model.palette
      let key = ''
      if (pal === 'hydro') key = `<div class="key">${Object.values(HYDRO).map(h => `<span><i style="background:${h.color}"></i>${h.label}</span>`).join('')}</div>`
      if (pal === 'age') key = `<div class="key">${Object.entries(PERIOD_COLORS).map(([p, c]) => `<span><i style="background:${c}"></i>${p}</span>`).join('')}</div>`
      const title = pal === 'hydro' ? 'Hydrostratigraphy' : pal === 'age' ? 'Age (ICS colours)' : 'Stratigraphy'
      el.innerHTML = `<h4>${title}</h4><div class="strat">${FORMATIONS.map(f => `<div data-k="${f.k}" style="background:${this.model.layerColor(f.k)}" title="${f.k} · ${f.name}" class="${this.model.layers.get(f.k).visible ? '' : 'off'}"></div>`).join('')}</div>${key}<div class="legend-note">Youngest at top. Click a band to isolate that formation.</div>`
      el.querySelectorAll('.strat div').forEach(d => {
        d.addEventListener('click', () => { const k = Number(d.dataset.k); const soloed = [...this.model.layers.values()].every(x => x.visible === (x.k === k)); if (soloed) this.model.setAllVisible(true); else this.model.solo(k); this.viewer.requestRender() })
        d.addEventListener('mouseenter', () => { this.model.setHighlight(Number(d.dataset.k), true); this.viewer.requestRender() })
        d.addEventListener('mouseleave', () => { this.model.setHighlight(Number(d.dataset.k), false); this.viewer.requestRender() })
      })
    } else {
      const title = this.mode === MODE.ELEV ? 'Elevation of surface (m AHD)' : 'Formation thickness (m)'
      const ramp = COLORMAPS[this.rampName || 'batlow'].stops
      const [a, b] = this.range
      el.innerHTML = `<h4>${title}</h4><div class="ramp" style="background:${rampCss(ramp)}"></div><div class="ramp-labels"><span>${Math.round(a)}</span><span>${Math.round((a + b) / 2)}</span><span>${Math.round(b)}</span></div><div class="legend-note">${this.mode === MODE.ELEV ? 'Each vertex coloured by its own elevation; caps keep formation colours.' : 'Vertical thickness of the formation at each point.'}</div>`
    }
  }
}
