// Guided tour: a handful of camera + state steps that tell the story of the basin.
export const TOUR_STEPS = [
  {
    title: 'A basin, in three dimensions',
    text: 'You are looking at the OGIA 2017 geological model of the Surat Cumulative Management Area: 21 formations across 460 by 650 km, from the Cenozoic alluvium at the surface down to the Permian floor of the Bowen Basin, more than 8 km below sea level. Drag to orbit, scroll to zoom, right-drag to pan.',
    apply: (app) => { app.reset(); app.preset('overview') },
  },
  {
    title: 'The land surface is a geological map',
    text: 'Seen from above, the colours show which formation is exposed at the surface: the Walloon Coal Measures and Hutton Sandstone crop out along the northern rim, while the Condamine alluvium and Cenozoic cover blanket the south and east. Contour lines mark elevation every 100 m.',
    apply: (app) => { app.reset(); app.setContour(2); app.preset('top') },
  },
  {
    title: 'Walloon Coal Measures: the coal seam gas target',
    text: 'The Walloon Coal Measures (Middle Jurassic) are the reason this model exists. Gas is produced from thin coal seams within 100 to 500 m of interbedded siltstone and sandstone. Isolated here, the formation dips gently from its northern outcrop towards the deep centre of the basin.',
    apply: (app) => { app.reset(); app.model.solo(10); app.setMode(2, [0, 500]); app.flyToLayer(10, 'southeast') },
  },
  {
    title: 'The great aquifers',
    text: 'Three quartzose sandstones carry most of the groundwater of the Great Artesian Basin here: the Gubberamunda (top), Hutton (middle) and Precipice (bottom). Exploded apart, you can see how the Precipice is confined to the Taroom Trough while the Hutton and Gubberamunda spread much wider.',
    apply: (app) => { app.reset(); app.model.setAllVisible(false); for (const k of [7, 12, 16]) app.model.setVisible(k, true); app.setExplode(30); app.preset('overview') },
  },
  {
    title: 'Cutting through the Taroom Trough',
    text: 'An east-west slice across the model reveals the asymmetric Taroom Trough: the Permian and Triassic Bowen Basin units thicken to more than 7 km, and the Surat Basin above drapes across them. Drag the white bar to move the cut; the profile at the bottom is drawn directly from the grid.',
    apply: (app) => { app.reset(); app.cutPreset('ew-trough'); app.preset('trough-cut') },
  },
  {
    title: 'The whole stack, exploded',
    text: 'Pulling the 21 layers apart shows the geometry of each formation as a single body: the thin, patchy Boxvale Sandstone, the widespread Hutton, and the thick lower Bowen Basin that fills the trough. Vertical exaggeration is 12 times.',
    apply: (app) => { app.reset(); app.setExplode(45); app.preset('explode') },
  },
  {
    title: 'Your turn',
    text: 'Switch on the Probe and click anywhere to drill a virtual borehole. Use Cut for slices, slabs and fence diagrams, colour the model by elevation or thickness, and share any view with a link. Press ? for keyboard shortcuts.',
    apply: (app) => { app.reset(); app.preset('overview'); app.setProbe(true) },
  },
]

export class Tour {
  constructor(app, els) {
    this.app = app; this.els = els; this.i = -1
    els.next.addEventListener('click', () => this.go(this.i + 1))
    els.prev.addEventListener('click', () => this.go(this.i - 1))
    els.skip.addEventListener('click', () => this.stop())
  }
  start() { this.go(0) }
  stop() { this.i = -1; this.els.root.hidden = true }
  get active() { return this.i >= 0 }
  go(i) {
    if (i < 0) i = 0
    if (i >= TOUR_STEPS.length) return this.stop()
    this.i = i
    const s = TOUR_STEPS[i]
    this.els.root.hidden = false
    this.els.step.textContent = `${i + 1} / ${TOUR_STEPS.length}`
    this.els.title.textContent = s.title; this.els.text.textContent = s.text
    this.els.prev.disabled = i === 0
    this.els.next.textContent = i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next ›'
    s.apply(this.app)
  }
}
